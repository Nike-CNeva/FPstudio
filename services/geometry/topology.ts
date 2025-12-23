
import { Point, Part, PartGeometry, PartProfile, Tool, ToolShape } from '../../types';
import { distanceSq, polygonArea, polygonCenter, normalize } from './math';
import { segmentIntersectsGeometry } from './intersections';

export type Segment = { 
    p1: Point; p2: Point; type: 'line' | 'arc'; radius?: number; center?: Point; originalEntity?: any; 
};

export type ProcessedGeometry = { 
    vertices: Point[], segments: Segment[], bbox: PartGeometry['bbox'], holeCenters: { point: Point, rotation?: number }[],
};

export const findClosedLoops = (segments: Segment[]): { vertices: Point[], segmentIndices: number[] }[] => {
    const adj = new Map<string, number[]>();
    const getKey = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    segments.forEach((s, i) => {
        [getKey(s.p1), getKey(s.p2)].forEach(k => {
            if (!adj.has(k)) adj.set(k, []);
            adj.get(k)!.push(i);
        });
    });
    const visitedSegs = new Set<number>();
    const loops: { vertices: Point[], segmentIndices: number[] }[] = [];
    segments.forEach((seg, startIdx) => {
        if (visitedSegs.has(startIdx)) return;
        const componentSegs = new Set<number>();
        const q = [startIdx]; visitedSegs.add(startIdx); componentSegs.add(startIdx);
        while(q.length > 0) {
            const currIdx = q.pop()!; const s = segments[currIdx];
            [getKey(s.p1), getKey(s.p2)].forEach(k => {
                (adj.get(k) || []).forEach(nIdx => {
                    if (!visitedSegs.has(nIdx)) { visitedSegs.add(nIdx); componentSegs.add(nIdx); q.push(nIdx); }
                });
            });
        }
        const uniquePoints = new Map<string, Point>();
        const pointDegrees = new Map<string, number>();
        componentSegs.forEach(idx => {
            const s = segments[idx];
            [s.p1, s.p2].forEach(p => {
                const k = getKey(p);
                uniquePoints.set(k, p);
                pointDegrees.set(k, (pointDegrees.get(k) || 0) + 1);
            });
        });
        let isClosed = true;
        for(const deg of pointDegrees.values()) if (deg % 2 !== 0) { isClosed = false; break; }
        if (isClosed && uniquePoints.size > 2) {
            loops.push({ vertices: Array.from(uniquePoints.values()), segmentIndices: Array.from(componentSegs) });
        }
    });
    return loops;
};

export const getOuterLoopIndices = (segments: Segment[]): Set<number> => {
    const loops = findClosedLoops(segments);
    let maxArea = -1; let indices: number[] = [];
    loops.forEach(l => {
        const area = polygonArea(l.vertices);
        if(area > maxArea) { maxArea = area; indices = l.segmentIndices; }
    });
    return new Set(indices);
};

export const getGeometryFromEntities = (part: Part): ProcessedGeometry | null => {
    const { entities, bbox } = part.geometry;
    if (!entities || !bbox) return null;
    const vertices: Point[] = []; const segments: Segment[] = [];
    entities.forEach(entity => {
        switch(entity.type) {
            case 'LINE': {
                const p1 = normalize(entity.start, bbox); const p2 = normalize(entity.end, bbox);
                vertices.push(p1, p2); segments.push({ p1, p2, type: 'line', originalEntity: entity });
                break;
            }
            case 'LWPOLYLINE': {
                if (entity.vertices.length < 2) break;
                const points = entity.vertices.map(v => normalize(v, bbox));
                for(let i = 0; i < points.length - 1; i++) {
                    vertices.push(points[i]); segments.push({ p1: points[i], p2: points[i+1], type: 'line', originalEntity: entity });
                }
                vertices.push(points[points.length-1]);
                if (entity.closed) segments.push({ p1: points[points.length-1], p2: points[0], type: 'line', originalEntity: entity });
                break;
            }
            case 'ARC': {
                const d2r = Math.PI / 180; const startRad = entity.startAngle * d2r; const endRad = entity.endAngle * d2r;
                const p1 = normalize({ x: entity.center.x + entity.radius * Math.cos(startRad), y: entity.center.y + entity.radius * Math.sin(startRad) }, bbox);
                const p2 = normalize({ x: entity.center.x + entity.radius * Math.cos(endRad), y: entity.center.y + entity.radius * Math.sin(endRad) }, bbox);
                const center = normalize(entity.center, bbox);
                vertices.push(p1, p2); segments.push({ p1, p2, type: 'arc', radius: entity.radius, center, originalEntity: entity });
                break;
            }
            case 'CIRCLE': {
                const r = entity.radius; const c = entity.center; const center = normalize(c, bbox);
                const points = [{x: c.x + r, y: c.y}, {x: c.x, y: c.y + r}, {x: c.x - r, y: c.y}, {x: c.x, y: c.y - r}].map(p => normalize(p, bbox));
                vertices.push(...points);
                for (let i = 0; i < points.length; i++) segments.push({p1: points[i], p2: points[(i+1) % 4], type: 'arc', radius: r, center, originalEntity: entity });
                break;
            }
        }
    });
    const shapeCenters: { point: Point, rotation?: number }[] = [];
    entities.forEach(e => { if (e.type === 'CIRCLE') shapeCenters.push({ point: normalize(e.center, bbox), rotation: 0 }); });
    const detectedLoops = findClosedLoops(segments);
    let maxArea = -1; let mainLoopIndex = -1;
    detectedLoops.forEach((loop, idx) => {
        const area = polygonArea(loop.vertices);
        if (area > maxArea) { maxArea = area; mainLoopIndex = idx; }
    });
    detectedLoops.forEach((loop, idx) => {
        if (idx !== mainLoopIndex) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            loop.vertices.forEach(v => {
                if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
                if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
            });
            shapeCenters.push({ point: polygonCenter(loop.vertices), rotation: (maxY - minY) > (maxX - minX) ? 90 : 0 });
        }
    });
    return { vertices, segments, bbox, holeCenters: shapeCenters };
};

export const detectPartProfile = (geometry: PartGeometry): PartProfile => {
    const { bbox, entities, height } = geometry;
    const width = bbox.maxX - bbox.minX;
    if (entities.length === 0) return { type: 'flat', orientation: 'vertical', dims: { a: width, b: 0, c: 0 } };
    const toSvgY = (rawY: number) => rawY - bbox.minY; const toSvgX = (rawX: number) => rawX - bbox.minX;
    const verticalBendCandidates: number[] = []; const horizontalBendCandidates: number[] = [];
    const checkPoint = (rawP: Point) => {
        const sx = toSvgX(rawP.x); const sy = toSvgY(rawP.y);
        if (sy > (height - 50) && sy < (height - 0.5)) verticalBendCandidates.push(sx);
        if (sy > 0.5 && sy < 50) verticalBendCandidates.push(sx);
        if (sx > 0.5 && sx < 50) horizontalBendCandidates.push(sy);
        if (sx > (width - 50) && sx < (width - 0.5)) horizontalBendCandidates.push(sy);
    };
    entities.forEach(e => {
        if (e.type === 'ARC') checkPoint(e.center);
        else if (e.type === 'LWPOLYLINE') e.vertices.forEach(v => checkPoint(v));
    });
    const cluster = (coords: number[], rangeMax: number) => {
        if (coords.length === 0) return [];
        coords.sort((a, b) => a - b);
        const res: number[] = []; let cur: number[] = [coords[0]];
        for (let i = 1; i < coords.length; i++) {
            if (coords[i] - coords[i-1] < 20) cur.push(coords[i]);
            else { res.push(cur.reduce((a,b)=>a+b,0)/cur.length); cur = [coords[i]]; }
        }
        res.push(cur.reduce((a,b)=>a+b,0)/cur.length);
        return res.filter(v => v > 50 && v < (rangeMax - 50));
    };
    const vLines = cluster(verticalBendCandidates, width);
    if (vLines.length === 1) return { type: 'L', orientation: 'vertical', dims: { a: vLines[0], b: width - vLines[0], c: 0 } };
    if (vLines.length === 2) return { type: 'U', orientation: 'vertical', dims: { a: vLines[0], b: vLines[1] - vLines[0], c: width - vLines[1] } };
    const hLines = cluster(horizontalBendCandidates, height);
    if (hLines.length === 1) return { type: 'L', orientation: 'horizontal', dims: { a: hLines[0], b: height - hLines[0], c: 0 } };
    if (hLines.length === 2) return { type: 'U', orientation: 'horizontal', dims: { a: hLines[0], b: hLines[1] - hLines[0], c: height - hLines[1] } };
    return { type: 'flat', orientation: 'vertical', dims: { a: width, b: 0, c: 0 } };
};

export const calculatePartPhysicalExtents = (part: Part, tools: Tool[]): { width: number, height: number, offsetX: number, offsetY: number } => {
    let minX = 0; let minY = 0; let maxX = part.geometry.width; let maxY = part.geometry.height;
    part.punches.forEach(p => {
        const tool = tools.find(t => t.id === p.toolId); if (!tool) return;
        const rad = p.rotation * Math.PI / 180;
        const tW = tool.width; const tH = tool.shape === ToolShape.Circle ? tool.width : tool.height;
        const effW = tW * Math.abs(Math.cos(rad)) + tH * Math.abs(Math.sin(rad));
        const effH = tW * Math.abs(Math.sin(rad)) + tH * Math.abs(Math.cos(rad));
        minX = Math.min(minX, p.x - effW/2); maxX = Math.max(maxX, p.x + effW/2);
        minY = Math.min(minY, p.y - effH/2); maxY = Math.max(maxY, p.y + effH/2);
    });
    return { width: maxX - minX, height: maxY - minY, offsetX: -minX, offsetY: -minY };
};
