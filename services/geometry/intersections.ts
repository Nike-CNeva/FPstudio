
import { Point, DxfEntity } from '../../types';

export const segmentIntersectsCircle = (p1: Point, p2: Point, center: Point, r: number): boolean => {
    const d1Sq = (p1.x - center.x)**2 + (p1.y - center.y)**2;
    const d2Sq = (p2.x - center.x)**2 + (p2.y - center.y)**2;
    const r2 = r * r;
    if (d1Sq < r2 || d2Sq < r2) return true;
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

export const segmentIntersectsArc = (p1: Point, p2: Point, center: Point, r: number, startAngle: number, endAngle: number): boolean => {
    if (!segmentIntersectsCircle(p1, p2, center, r)) return false;
    const dx = p1.x - center.x; const dy = p1.y - center.y;
    const vx = p2.x - p1.x; const vy = p2.y - p1.y;
    const A = vx*vx + vy*vy;
    const B = 2 * (dx*vx + dy*vy);
    const C = (dx*dx + dy*dy) - (r*r);
    const det = B*B - 4*A*C;
    if (det < 0) return false;
    const sqrtDet = Math.sqrt(det);
    const ts = [(-B - sqrtDet) / (2*A), (-B + sqrtDet) / (2*A)];
    for (const t of ts) {
        if (t >= 0 && t <= 1) {
            const ix = p1.x + t * vx;
            const iy = p1.y + t * vy;
            const angle = Math.atan2(iy - center.y, ix - center.x) * (180 / Math.PI);
            let normAngle = angle < 0 ? angle + 360 : angle;
            let s = startAngle; let e = endAngle;
            if (e < s) e += 360;
            if (normAngle < s) normAngle += 360;
            if (normAngle >= s && normAngle <= e) return true;
        }
    }
    return false;
};

export const segmentIntersectsGeometry = (p1: Point, p2: Point, entities: DxfEntity[]): boolean => {
    const minX = Math.min(p1.x, p2.x) - 0.1; const maxX = Math.max(p1.x, p2.x) + 0.1;
    const minY = Math.min(p1.y, p2.y) - 0.1; const maxY = Math.max(p1.y, p2.y) + 0.1;
    const checkLine = (a: Point, b: Point) => {
        const denominator = ((p2.x - p1.x) * (b.y - a.y)) - ((p2.y - p1.y) * (b.x - a.x));
        if (denominator === 0) return false;
        const r = (((p1.y - a.y) * (b.x - a.x)) - ((p1.x - a.x) * (b.y - a.y))) / denominator;
        const s = (((p1.y - a.y) * (p2.x - p1.x)) - ((p1.x - a.x) * (p2.y - p1.y))) / denominator;
        return (r > 0.01 && r < 0.99) && (s > 0.01 && s < 0.99);
    };
    for (const entity of entities) {
        if (entity.type === 'LINE') {
            if (checkLine(entity.start, entity.end)) return true;
        } else if (entity.type === 'LWPOLYLINE') {
            const v = entity.vertices;
            for (let i = 0; i < v.length - 1; i++) if (checkLine(v[i], v[i+1])) return true;
            if (entity.closed && v.length > 1) if (checkLine(v[v.length-1], v[0])) return true;
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
