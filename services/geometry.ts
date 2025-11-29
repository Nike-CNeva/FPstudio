
import { Part, Point, SnapMode, PartGeometry, DxfEntity, PlacedPart, Tool, ToolShape, PartProfile } from '../types';

/**
 * Checks if a point is inside a polygon using the Ray Casting algorithm.
 * Pure mathematical implementation, no DOM dependency.
 */
export const isPointInsideContour = (point: Point, partGeometry: PartGeometry): boolean => {
    const { bbox, entities } = partGeometry;
    if (!bbox || !entities) return false;

    if (point.x < bbox.minX || point.x > bbox.maxX || point.y < bbox.minY || point.y > bbox.maxY) {
        return false;
    }

    let intersections = 0;

    for (const entity of entities) {
        switch (entity.type) {
            case 'LWPOLYLINE': {
                const vertices = entity.vertices;
                for (let i = 0; i < vertices.length; i++) {
                    const p1 = vertices[i];
                    const p2 = vertices[(i + 1) % vertices.length];
                    if (!entity.closed && i === vertices.length - 1) continue;

                    if (rayIntersectsSegment(point, p1, p2)) {
                        intersections++;
                    }
                }
                break;
            }
            case 'LINE': {
                if (rayIntersectsSegment(point, entity.start, entity.end)) {
                    intersections++;
                }
                break;
            }
            case 'CIRCLE': {
                const dy = point.y - entity.center.y;
                if (Math.abs(dy) <= entity.radius) {
                    const dx = Math.sqrt(entity.radius * entity.radius - dy * dy);
                    const x1 = entity.center.x - dx;
                    const x2 = entity.center.x + dx;
                    if (x1 > point.x) intersections++;
                    if (x2 > point.x) intersections++;
                }
                break;
            }
            case 'ARC': {
                const dy = point.y - entity.center.y;
                if (Math.abs(dy) <= entity.radius) {
                     const dx = Math.sqrt(entity.radius * entity.radius - dy * dy);
                     const intersectXs = [entity.center.x - dx, entity.center.x + dx];
                     
                     for (const ix of intersectXs) {
                         if (ix > point.x) {
                             const angle = Math.atan2(point.y - entity.center.y, ix - entity.center.x) * (180 / Math.PI);
                             let normAngle = angle < 0 ? angle + 360 : angle;
                             let start = entity.startAngle;
                             let end = entity.endAngle;
                             if (end < start) end += 360;
                             if (normAngle < start) normAngle += 360;
                             
                             if (normAngle >= start && normAngle <= end) {
                                 intersections++;
                             }
                         }
                     }
                }
                break;
            }
        }
    }

    return intersections % 2 !== 0;
};

const rayIntersectsSegment = (p: Point, a: Point, b: Point): boolean => {
    if ((a.y > p.y) !== (b.y > p.y)) {
        const intersectX = a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y);
        if (intersectX > p.x) {
            return true;
        }
    }
    return false;
};

/**
 * Checks intersections between a specific line segment (p1-p2) and the part entities.
 * Used for Line-of-Sight checks.
 */
const segmentIntersectsGeometry = (p1: Point, p2: Point, entities: DxfEntity[]): boolean => {
    const minX = Math.min(p1.x, p2.x) - 0.1;
    const maxX = Math.max(p1.x, p2.x) + 0.1;
    const minY = Math.min(p1.y, p2.y) - 0.1;
    const maxY = Math.max(p1.y, p2.y) + 0.1;

    // Simplified intersection check: treat everything as line segments for robustness
    // This is an approximation for Arcs but sufficient for "blocking" checks
    const checkLine = (a: Point, b: Point) => {
        // Standard line-line intersection
        const det = (p2.x - p1.x) * (b.y - a.y) - (p2.y - p1.y) * (b.x - a.x);
        if (det === 0) return false;
        
        const denominator = ((p2.x - p1.x) * (b.y - a.y)) - ((p2.y - p1.y) * (b.x - a.x));
        if (denominator === 0) return false;

        const numerator1 = ((p1.y - a.y) * (b.x - a.x)) - ((p1.x - a.x) * (b.y - a.y));
        const numerator2 = ((p1.y - a.y) * (p2.x - p1.x)) - ((p1.x - a.x) * (p2.y - p1.y));

        const r = numerator1 / denominator;
        const s = numerator2 / denominator;

        // Check if intersection is strictly within segments (ignore endpoints to allow starting on a line)
        return (r > 0.01 && r < 0.99) && (s > 0.01 && s < 0.99);
    };

    for (const entity of entities) {
        if (entity.type === 'LINE') {
            if (checkLine(entity.start, entity.end)) return true;
        } else if (entity.type === 'LWPOLYLINE') {
            const v = entity.vertices;
            for (let i = 0; i < v.length - 1; i++) {
                if (checkLine(v[i], v[i+1])) return true;
            }
            if (entity.closed && v.length > 1) {
                if (checkLine(v[v.length-1], v[0])) return true;
            }
        } else if (entity.type === 'ARC' || entity.type === 'CIRCLE') {
            // Bounding box pre-check for curve
            const cx = entity.center.x;
            const cy = entity.center.y;
            const r = entity.radius;
            if (cx + r < minX || cx - r > maxX || cy + r < minY || cy - r > maxY) continue;

            // Crude approximation: 8 segments
            const steps = 8;
            let startAngle = 0;
            let endAngle = Math.PI * 2;
            if (entity.type === 'ARC') {
                startAngle = entity.startAngle * (Math.PI / 180);
                endAngle = entity.endAngle * (Math.PI / 180);
                if (endAngle < startAngle) endAngle += Math.PI * 2;
            }
            
            let prevP = { x: cx + r * Math.cos(startAngle), y: cy + r * Math.sin(startAngle) };
            for(let i=1; i<=steps; i++) {
                const ang = startAngle + (endAngle - startAngle) * (i/steps);
                const currP = { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
                if (checkLine(prevP, currP)) return true;
                prevP = currP;
            }
        }
    }
    return false;
};

/**
 * Checks if a point is inside a rectangle defined by position, dimensions and rotation.
 * Used for selecting placed parts in nesting.
 */
export const isPointInRectangle = (
    point: Point, 
    rectX: number, 
    rectY: number, 
    width: number, 
    height: number, 
    rotation: number
): boolean => {
    const dx = point.x - rectX;
    const dy = point.y - rectY;
    const rad = -rotation * (Math.PI / 180);
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    return localX >= 0 && localX <= width && localY >= 0 && localY <= height;
};

export const getRotatedRectVertices = (x: number, y: number, w: number, h: number, rotation: number): Point[] => {
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
        { x: x, y: y },
        { x: x + w * cos, y: y + w * sin },
        { x: x + w * cos - h * sin, y: y + w * sin + h * cos },
        { x: x - h * sin, y: y + h * cos }
    ];
};

export const calculatePartPhysicalExtents = (part: Part, tools: Tool[]): { width: number, height: number, offsetX: number, offsetY: number } => {
    let minX = 0;
    let minY = 0;
    let maxX = part.geometry.width;
    let maxY = part.geometry.height;

    part.punches.forEach(p => {
        const tool = tools.find(t => t.id === p.toolId);
        if (!tool) return;
        const rad = p.rotation * Math.PI / 180;
        const absCos = Math.abs(Math.cos(rad));
        const absSin = Math.abs(Math.sin(rad));
        
        let toolW = tool.width;
        let toolH = tool.height;
        if(tool.shape === ToolShape.Circle) toolH = tool.width;

        const effectiveW = toolW * absCos + toolH * absSin;
        const effectiveH = toolW * absSin + toolH * absCos;

        const pMinX = p.x - effectiveW / 2;
        const pMaxX = p.x + effectiveW / 2;
        const pMinY = p.y - effectiveH / 2;
        const pMaxY = p.y + effectiveH / 2;

        if (pMinX < minX) minX = pMinX;
        if (pMaxX > maxX) maxX = pMaxX;
        if (pMinY < minY) minY = pMinY;
        if (pMaxY > maxY) maxY = pMaxY;
    });

    return {
        width: maxX - minX,
        height: maxY - minY,
        offsetX: -minX, 
        offsetY: -minY
    };
};

export const calculateNestingSnap = (
    draggedPart: PlacedPart,
    placedParts: PlacedPart[],
    allParts: Part[],
    snapDistance: number = 10
): { x: number, y: number } | null => {
    const partDef = allParts.find(p => p.id === draggedPart.partId);
    if (!partDef) return null;

    const dragVertices = getRotatedRectVertices(draggedPart.x, draggedPart.y, partDef.geometry.width, partDef.geometry.height, draggedPart.rotation);
    let bestSnap: { x: number, y: number, distSq: number } | null = null;
    const snapDistSq = snapDistance * snapDistance;

    for (const target of placedParts) {
        if (target.id === draggedPart.id) continue;
        const targetDef = allParts.find(p => p.id === target.partId);
        if (!targetDef) continue;
        const targetVertices = getRotatedRectVertices(target.x, target.y, targetDef.geometry.width, targetDef.geometry.height, target.rotation);

        for (const dv of dragVertices) {
            for (const tv of targetVertices) {
                const d2 = (dv.x - tv.x)**2 + (dv.y - tv.y)**2;
                if (d2 < snapDistSq) {
                    if (!bestSnap || d2 < bestSnap.distSq) {
                        const offsetX = tv.x - dv.x;
                        const offsetY = tv.y - dv.y;
                        bestSnap = { x: draggedPart.x + offsetX, y: draggedPart.y + offsetY, distSq: d2 };
                    }
                }
            }
        }
    }
    return bestSnap ? { x: bestSnap.x, y: bestSnap.y } : null;
};

export type Segment = { 
    p1: Point; 
    p2: Point; 
    type: 'line' | 'arc';
    radius?: number;
    center?: Point;
    originalEntity?: any; 
};

export type ProcessedGeometry = { 
    vertices: Point[], 
    segments: Segment[], 
    bbox: PartGeometry['bbox'],
    holeCenters: Point[],
};
export type SnapTarget = 'start' | 'end' | 'middle';
export interface SnapResult {
    point: Point;
    angle: number;
    snapTarget: SnapTarget;
    wasNormalized: boolean;
}

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

const normalize = (p: Point, bbox: PartGeometry['bbox']) => ({
    x: p.x - bbox.minX,
    y: p.y - bbox.minY // Y-Up: Simple shift
});

const polygonArea = (vertices: Point[]): number => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area / 2);
};

const polygonCenter = (vertices: Point[]): Point => {
    let x = 0;
    let y = 0;
    for(const v of vertices) {
        x += v.x;
        y += v.y;
    }
    return { x: x / vertices.length, y: y / vertices.length };
}

const distanceSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

export const getGeometryFromEntities = (part: Part): ProcessedGeometry | null => {
    const { entities, bbox } = part.geometry;
    if (!entities || !bbox) return null;

    const vertices: Point[] = [];
    const segments: Segment[] = [];
    
    entities.forEach(entity => {
        switch(entity.type) {
            case 'LINE': {
                const p1 = normalize(entity.start, bbox);
                const p2 = normalize(entity.end, bbox);
                vertices.push(p1, p2);
                segments.push({ p1, p2, type: 'line', originalEntity: entity });
                break;
            }
            case 'LWPOLYLINE': {
                if (entity.vertices.length < 2) break;
                const points = entity.vertices.map(v => normalize(v, bbox));
                for(let i = 0; i < points.length - 1; i++) {
                    vertices.push(points[i]);
                    segments.push({ p1: points[i], p2: points[i+1], type: 'line', originalEntity: entity });
                }
                vertices.push(points[points.length-1]);
                if (entity.closed) {
                     segments.push({ p1: points[points.length-1], p2: points[0], type: 'line', originalEntity: entity });
                }
                break;
            }
            case 'ARC': {
                const startRad = degreesToRadians(entity.startAngle);
                const endRad = degreesToRadians(entity.endAngle);
                const p1_raw = { x: entity.center.x + entity.radius * Math.cos(startRad), y: entity.center.y + entity.radius * Math.sin(startRad) };
                const p2_raw = { x: entity.center.x + entity.radius * Math.cos(endRad), y: entity.center.y + entity.radius * Math.sin(endRad) };
                const p1 = normalize(p1_raw, bbox);
                const p2 = normalize(p2_raw, bbox);
                const center = normalize(entity.center, bbox);
                vertices.push(p1, p2);
                segments.push({ p1, p2, type: 'arc', radius: entity.radius, center, originalEntity: entity });
                break;
            }
            case 'CIRCLE': {
                const r = entity.radius;
                const c = entity.center;
                const center = normalize(c, bbox);
                const points_raw = [
                    {x: c.x + r, y: c.y}, {x: c.x, y: c.y + r},
                    {x: c.x - r, y: c.y}, {x: c.x, y: c.y - r},
                ];
                const points = points_raw.map(p => normalize(p, bbox));
                vertices.push(...points);
                for (let i = 0; i < points.length; i++) {
                    segments.push({p1: points[i], p2: points[(i+1) % 4], type: 'arc', radius: r, center, originalEntity: entity });
                }
                break;
            }
        }
    });
    
    const contours: { center: Point, area: number }[] = [];
    entities.forEach(entity => {
        if (entity.type === 'CIRCLE') {
            contours.push({
                center: normalize(entity.center, bbox),
                area: Math.PI * entity.radius**2,
            });
        } else if (entity.type === 'LWPOLYLINE' && entity.closed && entity.vertices.length > 2) {
            const normalizedVertices = entity.vertices.map(v => normalize(v, bbox));
            contours.push({
                center: polygonCenter(normalizedVertices),
                area: polygonArea(normalizedVertices),
            });
        }
    });

    const allShapeCenters = new Map<string, Point>();
    contours.forEach(c => allShapeCenters.set(`${c.center.x.toFixed(3)},${c.center.y.toFixed(3)}`, c.center));
    entities.forEach(entity => {
        if (entity.type === 'ARC') {
            const center = normalize(entity.center, bbox);
            allShapeCenters.set(`${center.x.toFixed(3)},${center.y.toFixed(3)}`, center);
        }
    });

    const lines = segments.filter(s => s.type === 'line');
    const usedLines = new Set<Segment>();
    
    for(let i=0; i<lines.length; i++) {
        if(usedLines.has(lines[i])) continue;
        const l1 = lines[i];
        const len1Sq = distanceSq(l1.p1, l1.p2);
        if (len1Sq < 0.1) continue; 
        const dx1 = l1.p2.x - l1.p1.x; 
        const dy1 = l1.p2.y - l1.p1.y;
        
        for(let j=i+1; j<lines.length; j++) {
            if(usedLines.has(lines[j])) continue;
            const l2 = lines[j];
            const len2Sq = distanceSq(l2.p1, l2.p2);
            if (Math.abs(len1Sq - len2Sq) > 1.0) continue; 
            const dx2 = l2.p2.x - l2.p1.x; 
            const dy2 = l2.p2.y - l2.p1.y;
            if (Math.abs(dx1*dy2 - dx2*dy1) > 1.0) continue; 
            const mid1 = { x: (l1.p1.x + l1.p2.x)/2, y: (l1.p1.y + l1.p2.y)/2 };
            const mid2 = { x: (l2.p1.x + l2.p2.x)/2, y: (l2.p1.y + l2.p2.y)/2 };
            const connX = mid2.x - mid1.x;
            const connY = mid2.y - mid1.y;
            const dot = connX * dx1 + connY * dy1;
            const projection = Math.abs(dot) / len1Sq;
            if (projection > 0.2) continue; 
            
            const center = { x: (mid1.x + mid2.x)/2, y: (mid1.y + mid2.y)/2 };
            const key = `${center.x.toFixed(3)},${center.y.toFixed(3)}`;
            if (!allShapeCenters.has(key)) allShapeCenters.set(key, center);
            usedLines.add(lines[i]);
            usedLines.add(lines[j]);
            break; 
        }
    }

    return { vertices, segments, bbox, holeCenters: Array.from(allShapeCenters.values()) };
};

export const findClosestSegment = (
    point: Point,
    geometry: ProcessedGeometry | null,
    threshold: number = 100 
): { p1: Point, p2: Point, angle: number, wasNormalized: boolean } | null => {
    if (!geometry) return null;
    let closest: { p1: Point, p2: Point, angle: number, wasNormalized: boolean } | null = null;
    const partWidth = geometry.bbox.maxX - geometry.bbox.minX;
    const effectiveThresholdSq = (threshold * (partWidth > 0 ? Math.max(0.1, partWidth / 500) : 1))**2;
    let minDst = effectiveThresholdSq;

    geometry.segments.forEach(seg => {
        const d2 = distanceToSegmentSq(point, seg);
        if (d2 < minDst) {
            minDst = d2;
            const { p1, p2, angle, wasNormalized } = getNormalizedSegment(seg.p1, seg.p2);
            closest = { p1, p2, angle, wasNormalized };
        }
    });
    return closest;
};

const distanceToSegmentSq = (p: Point, seg: Segment) => {
    if (seg.type === 'arc' && seg.center && seg.radius) {
         const distToCenter = Math.sqrt(distanceSq(p, seg.center));
         const distToCurve = Math.abs(distToCenter - seg.radius);
         const { p1, p2 } = seg;
         const l2 = distanceSq(p1, p2);
         if (l2 === 0) return distanceSq(p, p1);
         let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
         if (t >= 0 && t <= 1) return distToCurve * distToCurve;
         return Math.min(distanceSq(p, p1), distanceSq(p, p2));
    }
    const { p1, p2 } = seg;
    const l2 = distanceSq(p1, p2);
    if (l2 === 0) return distanceSq(p, p1);
    let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    return distanceSq(p, projection);
};

const getNormalizedSegment = (p1_orig: Point, p2_orig: Point): {p1: Point, p2: Point, angle: number, wasNormalized: boolean} => {
    const p1 = p1_orig;
    const p2 = p2_orig;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    return {p1, p2, angle, wasNormalized: false};
};

export const findSnapPoint = (
    mousePoint: Point,
    processedGeometry: ProcessedGeometry | null,
    mode: SnapMode
): SnapResult | null => {
    if (mode === SnapMode.Off || !processedGeometry) return null;
    const { vertices, segments, holeCenters, bbox } = processedGeometry;
    
    if (mode === SnapMode.ShapeCenter) {
        if (!holeCenters || holeCenters.length === 0) return null;
        let closestCenter: Point | null = null;
        let closestDistSq = Infinity;
        holeCenters.forEach(center => {
            const dSq = distanceSq(mousePoint, center);
            if (dSq < closestDistSq) { closestDistSq = dSq; closestCenter = center; }
        });
        if (closestCenter) return { point: closestCenter, angle: 0, snapTarget: 'middle', wasNormalized: false };
        return null;
    }
    
    if (vertices.length === 0) return null;
    let closestDistSq = Infinity;
    let snapResult: SnapResult | null = null;
    const snapRadius = 25; 

    const findClosest = (candidatePoint: Point, angle: number, snapTarget: SnapTarget, wasNormalized: boolean) => {
        const dSq = distanceSq(mousePoint, candidatePoint);
        if (dSq < closestDistSq) { closestDistSq = dSq; snapResult = { point: candidatePoint, angle, snapTarget, wasNormalized }; }
    }

    switch(mode) {
        case SnapMode.Vertex: {
            let closestVertex: Point | null = null;
            let minVertexDistSq = Infinity;
            vertices.forEach(v => {
                const dSq = distanceSq(mousePoint, v);
                if (dSq < minVertexDistSq) { minVertexDistSq = dSq; closestVertex = v; }
            });
            if (closestVertex) {
                const connectedSegments = segments.filter(s => (distanceSq(s.p1, closestVertex!) < 1e-9) || (distanceSq(s.p2, closestVertex!) < 1e-9));
                if (connectedSegments.length > 0) {
                    let bestSegment = connectedSegments[0];
                    let minLineDistSq = distanceToSegmentSq(mousePoint, bestSegment);
                    for (let i = 1; i < connectedSegments.length; i++) {
                        const distSq = distanceToSegmentSq(mousePoint, connectedSegments[i]);
                        if (distSq < minLineDistSq) { minLineDistSq = distSq; bestSegment = connectedSegments[i]; }
                    }
                    const { p1: normP1, angle, wasNormalized } = getNormalizedSegment(bestSegment.p1, bestSegment.p2);
                    const isStart = distanceSq(closestVertex, normP1) < 1e-9;
                    findClosest(closestVertex, angle, isStart ? 'start' : 'end', wasNormalized);
                } else { findClosest(closestVertex, 0, 'middle', false); }
            }
            break;
        }
        case SnapMode.SegmentCenter:
            segments.forEach(seg => {
                const center = { x: (seg.p1.x + seg.p2.x) / 2, y: (seg.p1.y + seg.p2.y) / 2 };
                const { angle, wasNormalized } = getNormalizedSegment(seg.p1, seg.p2);
                findClosest(center, angle, 'middle', wasNormalized);
            });
            break;
        case SnapMode.ClosestPoint:
            segments.forEach(seg => {
                const { p1, p2 } = seg;
                const { angle, wasNormalized } = getNormalizedSegment(p1, p2);
                const l2 = distanceSq(p1, p2);
                if (l2 === 0) { findClosest(p1, 0, 'middle', false); return; }
                let t = ((mousePoint.x - p1.x) * (p2.x - p1.x) + (mousePoint.y - p1.y) * (p2.y - p1.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                const closestPointOnSeg = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
                findClosest(closestPointOnSeg, angle, 'middle', wasNormalized);
            });
            break;
    }
    const partWidth = bbox.maxX - bbox.minX;
    const effectiveSnapRadiusSq = (snapRadius * (partWidth > 0 ? Math.max(0.1, partWidth / 500) : 1))**2;
    if (snapResult && closestDistSq < effectiveSnapRadiusSq) return snapResult;
    return null;
};

/**
 * Analyzes geometry to detect Profile (L-shape, U-shape).
 * Improved to robustly distinguishing between internal holes and actual edge notches/reliefs.
 * Also filters out corner cutouts to find the main bend line(s).
 * Now also detects ORIENTATION (Vertical vs Horizontal bends).
 */
export const detectPartProfile = (geometry: PartGeometry): PartProfile => {
    const { bbox, entities, height } = geometry;
    const width = bbox.maxX - bbox.minX;

    if (entities.length === 0) return { type: 'flat', orientation: 'vertical', dims: { a: width, b: 0, c: 0 } };

    const toSvgY = (rawY: number) => rawY - bbox.minY; // Y-Up: Simple shift
    const toSvgX = (rawX: number) => rawX - bbox.minX;

    // Check zones
    const MIN_DEPTH = 0.5;
    const MAX_DEPTH = 50.0;

    const topZone = { min: height - MAX_DEPTH, max: height - MIN_DEPTH }; // Top is High Y in Y-Up
    const bottomZone = { min: MIN_DEPTH, max: MAX_DEPTH }; // Bottom is Low Y
    const leftZone = { min: MIN_DEPTH, max: MAX_DEPTH };
    const rightZone = { min: width - MAX_DEPTH, max: width - MIN_DEPTH };

    const verticalBendCandidates: number[] = [];
    const horizontalBendCandidates: number[] = [];

    // Raw Entity Helper for intersection checks (Line of Sight)
    const isVisibleFromEdge = (pRaw: Point, edge: 'top'|'bottom'|'left'|'right'): boolean => {
        let target = { ...pRaw };
        if (edge === 'top') target.y = bbox.maxY + 1; // Cast Up
        else if (edge === 'bottom') target.y = bbox.minY - 1; // Cast Down
        else if (edge === 'left') target.x = bbox.minX - 1;
        else if (edge === 'right') target.x = bbox.maxX + 1;

        return !segmentIntersectsGeometry(pRaw, target, entities);
    };

    const checkPoint = (e: DxfEntity, rawP: Point) => {
        const svgX = toSvgX(rawP.x);
        const svgY = toSvgY(rawP.y);

        // Check Vertical Bends (Top/Bottom edges imply fold on X-axis)
        const inTop = svgY > topZone.min && svgY < topZone.max;
        const inBottom = svgY > bottomZone.min && svgY < bottomZone.max;
        
        if (inTop) {
            if (isVisibleFromEdge(rawP, 'top')) verticalBendCandidates.push(svgX);
        }
        if (inBottom) {
            if (isVisibleFromEdge(rawP, 'bottom')) verticalBendCandidates.push(svgX);
        }

        // Check Horizontal Bends (Left/Right edges imply fold on Y-axis)
        const inLeft = svgX > leftZone.min && svgX < leftZone.max;
        const inRight = svgX > rightZone.min && svgX < rightZone.max;
        
        if (inLeft) {
            if (isVisibleFromEdge(rawP, 'left')) horizontalBendCandidates.push(svgY);
        }
        if (inRight) {
            if (isVisibleFromEdge(rawP, 'right')) horizontalBendCandidates.push(svgY);
        }
    };

    entities.forEach(e => {
        if (e.type === 'ARC') {
            checkPoint(e, e.center);
        } else if (e.type === 'LWPOLYLINE') {
            e.vertices.forEach(v => checkPoint(e, v));
        } else if (e.type === 'LINE') {
            // Usually redundant if polylines are used
        }
    });

    // Clustering Helper
    const clusterPoints = (coords: number[], rangeMax: number): number[] => {
        if (coords.length === 0) return [];
        coords.sort((a, b) => a - b);
        const clusters: number[] = [];
        let currentCluster: number[] = [coords[0]];
        const TOLERANCE = 20.0; 

        for (let i = 1; i < coords.length; i++) {
            if (coords[i] - coords[i-1] < TOLERANCE) { 
                currentCluster.push(coords[i]);
            } else {
                const avg = currentCluster.reduce((a,b)=>a+b,0) / currentCluster.length;
                clusters.push(avg);
                currentCluster = [coords[i]];
            }
        }
        if (currentCluster.length > 0) {
            const avg = currentCluster.reduce((a,b)=>a+b,0) / currentCluster.length;
            clusters.push(avg);
        }

        // FILTER: Remove "Corner Reliefs"
        const margin = Math.min(rangeMax * 0.1, 50.0);
        return clusters.filter(val => val > margin && val < (rangeMax - margin));
    };

    // 1. Detect Vertical Bend Lines (Folds along X axis => Left/Right Flanges)
    const verticalBendLines = clusterPoints(verticalBendCandidates, width);

    if (verticalBendLines.length > 0) {
        if (verticalBendLines.length === 1) {
            const x = verticalBendLines[0];
            return { 
                type: 'L', 
                orientation: 'vertical',
                dims: { a: parseFloat(x.toFixed(2)), b: parseFloat((width - x).toFixed(2)), c: 0 } 
            };
        } else {
            const x1 = verticalBendLines[0];
            const x2 = verticalBendLines[1];
            return { 
                type: 'U', 
                orientation: 'vertical',
                dims: { a: parseFloat(x1.toFixed(2)), b: parseFloat((x2 - x1).toFixed(2)), c: parseFloat((width - x2).toFixed(2)) } 
            };
        }
    }

    // 2. Detect Horizontal Bend Lines (Folds along Y axis => Top/Bottom Flanges)
    const horizontalBendLines = clusterPoints(horizontalBendCandidates, height);

    if (horizontalBendLines.length > 0) {
        if (horizontalBendLines.length === 1) {
            const y = horizontalBendLines[0];
            return { 
                type: 'L', 
                orientation: 'horizontal',
                dims: { a: parseFloat(y.toFixed(2)), b: parseFloat((height - y).toFixed(2)), c: 0 } 
            };
        } else {
            const y1 = horizontalBendLines[0];
            const y2 = horizontalBendLines[1];
            return { 
                type: 'U', 
                orientation: 'horizontal',
                dims: { a: parseFloat(y1.toFixed(2)), b: parseFloat((y2 - y1).toFixed(2)), c: parseFloat((height - y2).toFixed(2)) } 
            };
        }
    }

    return { type: 'flat', orientation: 'vertical', dims: { a: width, b: 0, c: 0 } };
};
