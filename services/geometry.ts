
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

// --- PRECISE INTERSECTION HELPERS ---

const segmentIntersectsCircle = (p1: Point, p2: Point, center: Point, r: number): boolean => {
    const d1 = (p1.x - center.x)**2 + (p1.y - center.y)**2;
    const d2 = (p2.x - center.x)**2 + (p2.y - center.y)**2;
    const r2 = r * r;
    if (d1 < r2 || d2 < r2) return true;

    const lx = p2.x - p1.x;
    const ly = p2.y - p1.y;
    const lenSq = lx * lx + ly * ly;
    
    if (lenSq === 0) return false;

    const dot = ((center.x - p1.x) * lx + (center.y - p1.y) * ly) / lenSq;
    const closestX = p1.x + dot * lx;
    const closestY = p1.y + dot * ly;

    if (dot < 0 || dot > 1) return false;

    const distSq = (closestX - center.x)**2 + (closestY - center.y)**2;
    return distSq < (r2 - 0.0001); 
};

const segmentIntersectsArc = (p1: Point, p2: Point, center: Point, r: number, startAngle: number, endAngle: number): boolean => {
    if (!segmentIntersectsCircle(p1, p2, center, r)) return false;

    const dx = p1.x - center.x;
    const dy = p1.y - center.y;
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    
    const A = vx*vx + vy*vy;
    const B = 2 * (dx*vx + dy*vy);
    const C = (dx*dx + dy*dy) - (r*r);
    
    const det = B*B - 4*A*C;
    
    if (det < 0) return false;
    
    const sqrtDet = Math.sqrt(det);
    const t1 = (-B - sqrtDet) / (2*A);
    const t2 = (-B + sqrtDet) / (2*A);
    
    const checkT = (t: number) => {
        if (t >= 0 && t <= 1) {
            const ix = p1.x + t * vx;
            const iy = p1.y + t * vy;
            const angle = Math.atan2(iy - center.y, ix - center.x) * (180 / Math.PI);
            let normAngle = angle < 0 ? angle + 360 : angle;
            
            let s = startAngle;
            let e = endAngle;
            if (e < s) e += 360;
            if (normAngle < s) normAngle += 360;
            
            if (normAngle >= s && normAngle <= e) return true;
        }
        return false;
    }

    if (checkT(t1)) return true;
    if (checkT(t2)) return true;
    
    return false;
};

const segmentIntersectsGeometry = (p1: Point, p2: Point, entities: DxfEntity[]): boolean => {
    const minX = Math.min(p1.x, p2.x) - 0.1;
    const maxX = Math.max(p1.x, p2.x) + 0.1;
    const minY = Math.min(p1.y, p2.y) - 0.1;
    const maxY = Math.max(p1.y, p2.y) + 0.1;

    const checkLine = (a: Point, b: Point) => {
        const det = (p2.x - p1.x) * (b.y - a.y) - (p2.y - p1.y) * (b.x - a.x);
        if (det === 0) return false;
        
        const denominator = ((p2.x - p1.x) * (b.y - a.y)) - ((p2.y - p1.y) * (b.x - a.x));
        if (denominator === 0) return false;

        const numerator1 = ((p1.y - a.y) * (b.x - a.x)) - ((p1.x - a.x) * (b.y - a.y));
        const numerator2 = ((p1.y - a.y) * (p2.x - p1.x)) - ((p1.x - a.x) * (p2.y - p1.y));

        const r = numerator1 / denominator;
        const s = numerator2 / denominator;

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
        } else if (entity.type === 'ARC') {
            if (entity.center.x + entity.radius < minX || entity.center.x - entity.radius > maxX || 
                entity.center.y + entity.radius < minY || entity.center.y - entity.radius > maxY) continue;

            if (segmentIntersectsArc(p1, p2, entity.center, entity.radius, entity.startAngle, entity.endAngle)) return true;

        } else if (entity.type === 'CIRCLE') {
            if (entity.center.x + entity.radius < minX || entity.center.x - entity.radius > maxX || 
                entity.center.y + entity.radius < minY || entity.center.y - entity.radius > maxY) continue;

            if (segmentIntersectsCircle(p1, p2, entity.center, entity.radius)) return true;
        }
    }
    return false;
};

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

export const getToolCorners = (tool: Tool, x: number, y: number, rotation: number): Point[] => {
    const w = tool.width;
    const h = tool.shape === ToolShape.Circle ? tool.width : tool.height;
    
    // Tool origin is center. Vertices relative to center.
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const corners = [
        { x: -w/2, y: -h/2 },
        { x: w/2, y: -h/2 },
        { x: w/2, y: h/2 },
        { x: -w/2, y: h/2 }
    ];
    
    return corners.map(p => ({
        x: x + (p.x * cos - p.y * sin),
        y: y + (p.x * sin + p.y * cos)
    }));
};

/**
 * Checks if a tool placed at (x,y) "gouges" into the part geometry.
 * A gouge is defined as any of the tool's corners being strictly INSIDE the contour,
 * UNLESS that corner is on the segment we are currently processing (touching allowed),
 * OR if it is touching any other boundary line (admissible contact).
 */
export const isToolGouging = (
    tool: Tool, 
    x: number, 
    y: number, 
    rotation: number, 
    geometry: PartGeometry, 
    bbox: PartGeometry['bbox'],
    currentSegment: Segment,
    allSegments?: Segment[]
): boolean => {
    if (!geometry || !bbox) return false;
    
    const corners = getToolCorners(tool, x, y, rotation);
    const DEFAULT_TOLERANCE = 0.5;
    const CORNER_TOLERANCE = 2.5; // Relaxed tolerance near vertices (Corners/Fillets)
    const VERTEX_ZONE_SQ = 5.0 * 5.0; // 5mm radius around vertex to engage relaxed tolerance
    
    // Denormalize helper for geometry check
    const denorm = (p: Point) => ({ x: p.x + bbox.minX, y: p.y + bbox.minY });

    for (const corner of corners) {
        const rawCorner = denorm(corner);
        
        // 1. Is the corner inside the material?
        if (isPointInsideContour(rawCorner, geometry)) {
            // Adaptive Tolerance Logic:
            // If the corner is close to ANY vertex of the geometry, use a larger tolerance.
            // This allows tools to "poke" into fillets or touch perpendicular lines without being flagged.
            let activeTolerance = DEFAULT_TOLERANCE;
            
            if (allSegments) {
                // Check proximity to any vertex in the full geometry
                // Optimization: In a loop, breaking early is fine.
                // We check p1 of all segments (covers all vertices effectively for closed loops)
                for (const seg of allSegments) {
                    const distSq = (corner.x - seg.p1.x)**2 + (corner.y - seg.p1.y)**2;
                    if (distSq < VERTEX_ZONE_SQ) {
                        activeTolerance = CORNER_TOLERANCE;
                        break;
                    }
                }
            }

            // 2. Is it touching the CURRENT segment?
            let dist = 0;
            const { p1, p2 } = currentSegment;
            // Calculations in Normalized Space (consistent with corner and allSegments)
            // Note: If currentSegment came from geometry directly it is normalized. 
            // Previous version denormalized p1/p2, but corner was normalized?
            // Wait, isToolGouging contract: 
            // - `corner` is from `x,y` (Normalized).
            // - `allSegments` are Normalized.
            // - `currentSegment` is Normalized.
            // - `isPointInsideContour` uses `rawCorner` (Denormalized) against `geometry` (Normalized Entities + BBox).
            //   Wait, geometry.entities are Normalized. bbox is usually 0-based if from `getGeometryFromEntities`.
            //   But `isPointInsideContour` adds `bbox.minX`?
            //   If `geometry` passed here is the original `part.geometry` (Normalized Entities, 0-based BBox),
            //   then `denorm` adds 0. So `rawCorner == corner`. 
            //   This is correct for standard flow.
            
            if (currentSegment.type === 'line') {
                const l2 = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
                if (l2 === 0) dist = Math.sqrt((corner.x - p1.x)**2 + (corner.y - p1.y)**2);
                else {
                    let t = ((corner.x - p1.x) * (p2.x - p1.x) + (corner.y - p1.y) * (p2.y - p1.y)) / l2;
                    t = Math.max(0, Math.min(1, t));
                    const projX = p1.x + t * (p2.x - p1.x);
                    const projY = p1.y + t * (p2.y - p1.y);
                    dist = Math.sqrt((corner.x - projX)**2 + (corner.y - projY)**2);
                }
            } else if (currentSegment.type === 'arc' && currentSegment.radius && currentSegment.center) {
                const distToCenter = Math.sqrt((corner.x - currentSegment.center.x)**2 + (corner.y - currentSegment.center.y)**2);
                dist = Math.abs(distToCenter - currentSegment.radius);
            }

            // If distance > Tolerance, it might be a gouge.
            // BUT, if it is touching ANY other segment, it is admissible.
            if (dist > activeTolerance) {
                if (allSegments) {
                    let touchingAny = false;
                    for (const seg of allSegments) {
                        if (seg === currentSegment) continue;
                        
                        let dOther = 0;
                        if (seg.type === 'line') {
                             const l2 = (seg.p2.x - seg.p1.x)**2 + (seg.p2.y - seg.p1.y)**2;
                             if (l2 === 0) dOther = Math.sqrt((corner.x - seg.p1.x)**2 + (corner.y - seg.p1.y)**2);
                             else {
                                 let t = ((corner.x - seg.p1.x) * (seg.p2.x - seg.p1.x) + (corner.y - seg.p1.y) * (seg.p2.y - seg.p1.y)) / l2;
                                 t = Math.max(0, Math.min(1, t));
                                 const px = seg.p1.x + t * (seg.p2.x - seg.p1.x);
                                 const py = seg.p1.y + t * (seg.p2.y - seg.p1.y);
                                 dOther = Math.sqrt((corner.x - px)**2 + (corner.y - py)**2);
                             }
                        } else if (seg.type === 'arc' && seg.radius && seg.center) {
                             const dc = Math.sqrt((corner.x - seg.center.x)**2 + (corner.y - seg.center.y)**2);
                             dOther = Math.abs(dc - seg.radius);
                        }
                        
                        if (dOther <= activeTolerance) {
                            touchingAny = true;
                            break;
                        }
                    }
                    if (touchingAny) continue; // Touching neighbor, admissible.
                }
                return true; // Real Gouge
            }
        }
    }
    return false;
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
    holeCenters: { point: Point, rotation?: number }[],
};
export type SnapTarget = 'start' | 'end' | 'middle';
export interface SnapResult {
    point: Point;
    angle: number;
    snapTarget: SnapTarget;
    wasNormalized: boolean;
    forceRotation?: number; // Rotation implied by shape (e.g. 90deg for vertical oblong)
}

const distanceSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

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

// Helper: Identify closed loops from segment soup
export const findClosedLoops = (segments: Segment[]): { vertices: Point[], segmentIndices: number[] }[] => {
    const adj = new Map<string, number[]>();
    const getKey = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

    segments.forEach((s, i) => {
        const k1 = getKey(s.p1);
        const k2 = getKey(s.p2);
        if (!adj.has(k1)) adj.set(k1, []);
        if (!adj.has(k2)) adj.set(k2, []);
        adj.get(k1)!.push(i);
        adj.get(k2)!.push(i);
    });

    const visitedSegs = new Set<number>();
    const loops: { vertices: Point[], segmentIndices: number[] }[] = [];

    segments.forEach((seg, startIdx) => {
        if (visitedSegs.has(startIdx)) return;

        const componentSegs = new Set<number>();
        const q = [startIdx];
        visitedSegs.add(startIdx);
        componentSegs.add(startIdx);

        while(q.length > 0) {
            const currIdx = q.pop()!;
            const s = segments[currIdx];
            
            [getKey(s.p1), getKey(s.p2)].forEach(k => {
                const neighbors = adj.get(k) || [];
                neighbors.forEach(nIdx => {
                    if (!visitedSegs.has(nIdx)) {
                        visitedSegs.add(nIdx);
                        componentSegs.add(nIdx);
                        q.push(nIdx);
                    }
                });
            });
        }

        const uniquePoints = new Map<string, Point>();
        const pointDegrees = new Map<string, number>();

        componentSegs.forEach(idx => {
            const s = segments[idx];
            const k1 = getKey(s.p1);
            const k2 = getKey(s.p2);
            uniquePoints.set(k1, s.p1);
            uniquePoints.set(k2, s.p2);
            pointDegrees.set(k1, (pointDegrees.get(k1) || 0) + 1);
            pointDegrees.set(k2, (pointDegrees.get(k2) || 0) + 1);
        });

        let isClosed = true;
        for(const deg of pointDegrees.values()) {
            if (deg % 2 !== 0) {
                isClosed = false;
                break;
            }
        }

        if (isClosed && uniquePoints.size > 2) {
            loops.push({
                vertices: Array.from(uniquePoints.values()),
                segmentIndices: Array.from(componentSegs)
            });
        }
    });

    return loops;
};

export const getOuterLoopIndices = (segments: Segment[]): Set<number> => {
    const loops = findClosedLoops(segments);
    let maxArea = -1;
    let indices: number[] = [];
    
    loops.forEach(l => {
        const area = polygonArea(l.vertices);
        if(area > maxArea) {
            maxArea = area;
            indices = l.segmentIndices;
        }
    });
    
    return new Set(indices);
};

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
                const d2r = Math.PI / 180;
                const startRad = entity.startAngle * d2r;
                const endRad = entity.endAngle * d2r;
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
    
    const shapeCenters: { point: Point, rotation?: number }[] = [];

    // 1. Exact Circles
    entities.forEach(entity => {
        if (entity.type === 'CIRCLE') {
            shapeCenters.push({ point: normalize(entity.center, bbox), rotation: 0 });
        }
    });

    // 2. Closed Loops (Complex Shapes)
    const detectedLoops = findClosedLoops(segments);
    let maxArea = -1;
    let mainLoopIndex = -1;

    detectedLoops.forEach((loop, idx) => {
        const area = polygonArea(loop.vertices);
        if (area > maxArea) {
            maxArea = area;
            mainLoopIndex = idx;
        }
    });

    const featureSegmentIndices = new Set<number>();

    detectedLoops.forEach((loop, idx) => {
        if (idx !== mainLoopIndex) {
            // Determine orientation based on bounding box aspect ratio of the hole
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            loop.vertices.forEach(v => {
                if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
                if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
            });
            const w = maxX - minX;
            const h = maxY - minY;
            const rotation = h > w ? 90 : 0; // Vertical hole = 90

            shapeCenters.push({ point: polygonCenter(loop.vertices), rotation });
            loop.segmentIndices.forEach(si => featureSegmentIndices.add(si));
        }
    });

    // 3. Add Arc Centers for others
    segments.forEach((seg, idx) => {
        if (seg.type === 'arc' && seg.center && !featureSegmentIndices.has(idx)) {
            const exists = shapeCenters.some(c => distanceSq(c.point, seg.center!) < 0.001);
            if (!exists) shapeCenters.push({ point: seg.center, rotation: 0 });
        }
    });

    return { vertices, segments, bbox, holeCenters: shapeCenters };
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
        let closestCenter: { point: Point, rotation?: number } | null = null;
        let closestDistSq = Infinity;
        holeCenters.forEach(center => {
            const dSq = distanceSq(mousePoint, center.point);
            if (dSq < closestDistSq) { closestDistSq = dSq; closestCenter = center; }
        });
        if (closestCenter) return { 
            point: closestCenter.point, 
            angle: 0, 
            snapTarget: 'middle', 
            wasNormalized: false, 
            forceRotation: closestCenter.rotation 
        };
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

// ... detectPartProfile logic (unchanged) ...
export const detectPartProfile = (geometry: PartGeometry): PartProfile => {
    const { bbox, entities, height } = geometry;
    const width = bbox.maxX - bbox.minX;

    if (entities.length === 0) return { type: 'flat', orientation: 'vertical', dims: { a: width, b: 0, c: 0 } };

    const toSvgY = (rawY: number) => rawY - bbox.minY;
    const toSvgX = (rawX: number) => rawX - bbox.minX;

    const MIN_DEPTH = 0.5;
    const MAX_DEPTH = 50.0;

    const topZone = { min: height - MAX_DEPTH, max: height - MIN_DEPTH };
    const bottomZone = { min: MIN_DEPTH, max: MAX_DEPTH };
    const leftZone = { min: MIN_DEPTH, max: MAX_DEPTH };
    const rightZone = { min: width - MAX_DEPTH, max: width - MIN_DEPTH };

    const verticalBendCandidates: number[] = [];
    const horizontalBendCandidates: number[] = [];

    const isVisibleFromEdge = (pRaw: Point, edge: 'top'|'bottom'|'left'|'right'): boolean => {
        let target = { ...pRaw };
        if (edge === 'top') target.y = bbox.maxY + 1;
        else if (edge === 'bottom') target.y = bbox.minY - 1;
        else if (edge === 'left') target.x = bbox.minX - 1;
        else if (edge === 'right') target.x = bbox.maxX + 1;

        return !segmentIntersectsGeometry(pRaw, target, entities);
    };

    const checkPoint = (e: DxfEntity, rawP: Point) => {
        const svgX = toSvgX(rawP.x);
        const svgY = toSvgY(rawP.y);

        const inTop = svgY > topZone.min && svgY < topZone.max;
        const inBottom = svgY > bottomZone.min && svgY < bottomZone.max;
        
        if (inTop) {
            if (isVisibleFromEdge(rawP, 'top')) verticalBendCandidates.push(svgX);
        }
        if (inBottom) {
            if (isVisibleFromEdge(rawP, 'bottom')) verticalBendCandidates.push(svgX);
        }

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
        }
    });

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

        const margin = Math.min(rangeMax * 0.1, 50.0);
        return clusters.filter(val => val > margin && val < (rangeMax - margin));
    };

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
