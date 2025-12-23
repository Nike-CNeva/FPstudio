
import { Point, SnapMode } from '../../types';
import { distanceSq } from './math';
import { ProcessedGeometry, Segment } from './topology';

export type SnapTarget = 'start' | 'end' | 'middle';
export interface SnapResult {
    point: Point; angle: number; snapTarget: SnapTarget; wasNormalized: boolean; forceRotation?: number;
}

const distanceToSegmentSq = (p: Point, seg: Segment) => {
    const { p1, p2 } = seg;
    if (seg.type === 'arc' && seg.center && seg.radius) {
         const distToCenter = Math.sqrt(distanceSq(p, seg.center));
         const distToCurve = Math.abs(distToCenter - seg.radius);
         const l2 = distanceSq(p1, p2);
         if (l2 === 0) return distanceSq(p, p1);
         let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
         if (t >= 0 && t <= 1) return distToCurve * distToCurve;
         return Math.min(distanceSq(p, p1), distanceSq(p, p2));
    }
    const l2 = distanceSq(p1, p2);
    if (l2 === 0) return distanceSq(p, p1);
    let t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
    return distanceSq(p, { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
};

export const findClosestSegment = (point: Point, geometry: ProcessedGeometry | null, threshold: number = 100): { p1: Point, p2: Point, angle: number, wasNormalized: boolean } | null => {
    if (!geometry) return null;
    let closest: any = null;
    let minDst = (threshold * Math.max(0.1, (geometry.bbox.maxX - geometry.bbox.minX) / 500))**2;
    geometry.segments.forEach(seg => {
        const d2 = distanceToSegmentSq(point, seg);
        if (d2 < minDst) {
            minDst = d2;
            closest = { p1: seg.p1, p2: seg.p2, angle: Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x) * 180 / Math.PI, wasNormalized: false };
        }
    });
    return closest;
};

export const findSnapPoint = (mousePoint: Point, processedGeometry: ProcessedGeometry | null, mode: SnapMode): SnapResult | null => {
    if (mode === SnapMode.Off || !processedGeometry) return null;
    const { vertices, segments, holeCenters, bbox } = processedGeometry;
    if (mode === SnapMode.ShapeCenter && holeCenters.length > 0) {
        let best: any = null; let minD = Infinity;
        holeCenters.forEach(c => { const d = distanceSq(mousePoint, c.point); if (d < minD) { minD = d; best = c; } });
        return best ? { point: best.point, angle: 0, snapTarget: 'middle', wasNormalized: false, forceRotation: best.rotation } : null;
    }
    if (vertices.length === 0) return null;
    let bestRes: SnapResult | null = null; let minD = (25 * Math.max(0.1, (bbox.maxX - bbox.minX) / 500))**2;
    if (mode === SnapMode.Vertex) {
        let cv: Point | null = null; let mvD = Infinity;
        vertices.forEach(v => { const d = distanceSq(mousePoint, v); if (d < mvD) { mvD = d; cv = v; } });
        if (cv && mvD < minD) {
            const connected = segments.filter(s => distanceSq(s.p1, cv!) < 1e-9 || distanceSq(s.p2, cv!) < 1e-9);
            const s = connected[0] || segments[0];
            const ang = Math.atan2(s.p2.y - s.p1.y, s.p2.x - s.p1.x) * 180 / Math.PI;
            return { point: cv, angle: ang, snapTarget: distanceSq(cv, s.p1) < 1e-9 ? 'start' : 'end', wasNormalized: false };
        }
    }
    if (mode === SnapMode.SegmentCenter) {
        segments.forEach(s => {
            const cp = { x: (s.p1.x + s.p2.x)/2, y: (s.p1.y + s.p2.y)/2 }; const d = distanceSq(mousePoint, cp);
            if (d < minD) { minD = d; bestRes = { point: cp, angle: Math.atan2(s.p2.y - s.p1.y, s.p2.x - s.p1.x) * 180 / Math.PI, snapTarget: 'middle', wasNormalized: false }; }
        });
    }
    return bestRes;
};
