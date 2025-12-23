
import { Point, Part, PlacedPart, SnapMode } from '../../types';
import { distanceSq } from './math';
import { isPointInsideContour } from './predicates';
import { getRotatedRectVertices } from './transform';
import { getGeometryFromEntities } from './topology';

export const doPartsIntersect = (partA: Part, posA: Point, rotA: number, partB: Part, posB: Point, rotB: number, margin: number = 0): boolean => {
    const getSegs = (p: Part, pos: Point, rot: number) => {
        const rad = rot * Math.PI / 180; const c = Math.cos(rad); const s = Math.sin(rad);
        const processed = getGeometryFromEntities(p);
        return (processed?.segments || []).map(seg => {
            const tr = (pt: Point) => ({ x: pos.x + (pt.x * c - pt.y * s), y: pos.y + (pt.x * s + pt.y * c) });
            return { p1: tr(seg.p1), p2: tr(seg.p2) };
        });
    };
    const segsA = getSegs(partA, posA, rotA); const segsB = getSegs(partB, posB, rotB);
    const intersect = (p1: Point, p2: Point, p3: Point, p4: Point) => {
        const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (det === 0) return false;
        const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
        const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    };
    for (const sA of segsA) for (const sB of segsB) if (intersect(sA.p1, sA.p2, sB.p1, sB.p2)) return true;
    const checkIn = (pts: Point[], target: Part, tPos: Point, tRot: number) => {
        const rad = -tRot * Math.PI / 180; const c = Math.cos(rad); const s = Math.sin(rad);
        for (const pt of pts) {
            const dx = pt.x - tPos.x; const dy = pt.y - tPos.y;
            if (isPointInsideContour({ x: dx * c - dy * s, y: dx * s + dy * c }, target.geometry)) return true;
        }
        return false;
    };
    if (checkIn(segsA.map(s => s.p1), partB, posB, rotB)) return true;
    if (checkIn(segsB.map(s => s.p1), partA, posA, rotA)) return true;
    return false;
};

export const calculateNestingSnap = (draggedPart: PlacedPart, placedParts: PlacedPart[], allParts: Part[], snapDistance: number = 10): { x: number, y: number } | null => {
    const partDef = allParts.find(p => p.id === draggedPart.partId); if (!partDef) return null;
    const dragVertices = getRotatedRectVertices(draggedPart.x, draggedPart.y, partDef.geometry.width, partDef.geometry.height, draggedPart.rotation);
    let bestSnap: { x: number, y: number, distSq: number } | null = null;
    const snapDistSq = snapDistance * snapDistance;
    for (const target of placedParts) {
        if (target.id === draggedPart.id) continue;
        const targetDef = allParts.find(p => p.id === target.partId); if (!targetDef) continue;
        const targetVertices = getRotatedRectVertices(target.x, target.y, targetDef.geometry.width, targetDef.geometry.height, target.rotation);
        for (const dv of dragVertices) for (const tv of targetVertices) {
            const d2 = distanceSq(dv, tv);
            if (d2 < snapDistSq && (!bestSnap || d2 < bestSnap.distSq)) {
                bestSnap = { x: draggedPart.x + (tv.x - dv.x), y: draggedPart.y + (tv.y - dv.y), distSq: d2 };
            }
        }
    }
    return bestSnap ? { x: bestSnap.x, y: bestSnap.y } : null;
};
