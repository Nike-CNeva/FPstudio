
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

export interface PartCollisionStatus {
    isSafe: boolean;
    outOfBounds: boolean;
    clampCollision: boolean;
    partOverlap: boolean;
    collidingPartNames: string[];
}

export const checkPlacedPartCollision = (
    placedPart: PlacedPart,
    partDef: Part,
    allPlacedParts: PlacedPart[],
    allParts: Part[],
    settings: {
        sheetMarginLeft: number;
        sheetMarginRight: number;
        sheetMarginTop: number;
        sheetMarginBottom: number;
        clampPositions: number[];
        nestUnderClamps: boolean;
    },
    sheetWidth: number,
    sheetHeight: number
): PartCollisionStatus => {
    const vertices = getRotatedRectVertices(placedPart.x, placedPart.y, partDef.geometry.width, partDef.geometry.height, placedPart.rotation);
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of vertices) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
    }

    const marginL = settings.sheetMarginLeft || 0;
    const marginR = settings.sheetMarginRight || 0;
    const marginB = settings.sheetMarginBottom || 0;
    const marginT = settings.sheetMarginTop || 0;

    const outOfBounds = minX < marginL - 0.01 || maxX > (sheetWidth - marginR) + 0.01 ||
                        minY < marginB - 0.01 || maxY > (sheetHeight - marginT) + 0.01;

    let clampCollision = false;
    if (!settings.nestUnderClamps && settings.clampPositions) {
        for (const cx of settings.clampPositions) {
            const clampMinX = cx - 40;
            const clampMaxX = cx + 40;
            const clampMinY = 0;
            const clampMaxY = 50;

            if (maxX >= clampMinX && minX <= clampMaxX && maxY >= clampMinY && minY <= clampMaxY) {
                clampCollision = true;
                break;
            }
        }
    }

    const collidingPartNames: string[] = [];
    let partOverlap = false;

    for (const other of allPlacedParts) {
        if (other.id === placedPart.id) continue;
        const otherDef = allParts.find(p => p.id === other.partId);
        if (!otherDef) continue;

        if (doPartsIntersect(partDef, { x: placedPart.x, y: placedPart.y }, placedPart.rotation, otherDef, { x: other.x, y: other.y }, other.rotation)) {
            partOverlap = true;
            if (!collidingPartNames.includes(otherDef.name)) {
                collidingPartNames.push(otherDef.name);
            }
        }
    }

    const isSafe = !outOfBounds && !clampCollision && !partOverlap;

    return {
        isSafe,
        outOfBounds,
        clampCollision,
        partOverlap,
        collidingPartNames
    };
};
