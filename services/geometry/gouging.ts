import { Tool, PartGeometry, Point } from '../../types';
import { isPointInsideContour } from './predicates';
import { getToolCorners } from './transform';
// FIX: distanceSq is exported from ./math, not ./topology
import { distanceSq } from './math';
import { Segment } from './topology';

/**
 * Проверка: зарезает ли инструмент геометрию при ударе в точке (x,y).
 */
export const isToolGouging = (tool: Tool, x: number, y: number, rotation: number, geometry: PartGeometry, bbox: PartGeometry['bbox'], currentSegment: Segment, allSegments?: Segment[]): boolean => {
    if (!geometry || !bbox) return false;
    const corners = getToolCorners(tool, x, y, rotation);
    const denorm = (p: Point) => ({ x: p.x + bbox.minX, y: p.y + bbox.minY });
    for (const corner of corners) {
        if (isPointInsideContour(denorm(corner), geometry)) {
            let tol = 0.5;
            if (allSegments) {
                for (const seg of allSegments) if (distanceSq(corner, seg.p1) < 25) { tol = 2.5; break; }
            }
            let dist = Infinity;
            if (currentSegment.type === 'line') {
                const { p1, p2 } = currentSegment; const l2 = distanceSq(p1, p2);
                if (l2 === 0) dist = Math.sqrt(distanceSq(corner, p1));
                else {
                    const t = Math.max(0, Math.min(1, ((corner.x - p1.x) * (p2.x - p1.x) + (corner.y - p1.y) * (p2.y - p1.y)) / l2));
                    dist = Math.sqrt(distanceSq(corner, { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }));
                }
            } else if (currentSegment.type === 'arc' && currentSegment.radius && currentSegment.center) {
                dist = Math.abs(Math.sqrt(distanceSq(corner, currentSegment.center)) - currentSegment.radius);
            }
            if (dist > tol) {
                if (allSegments) {
                    let touching = false;
                    for (const seg of allSegments) {
                        if (seg === currentSegment) continue;
                        let dOther = Infinity;
                        if (seg.type === 'line') {
                            const { p1, p2 } = seg; const l2 = distanceSq(p1, p2);
                            const t = Math.max(0, Math.min(1, ((corner.x - p1.x) * (p2.x - p1.x) + (corner.y - p1.y) * (p2.y - p1.y)) / l2));
                            dOther = Math.sqrt(distanceSq(corner, { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }));
                        } else if (seg.type === 'arc' && seg.radius && seg.center) {
                            dOther = Math.abs(Math.sqrt(distanceSq(corner, seg.center)) - seg.radius);
                        }
                        if (dOther <= tol) { touching = true; break; }
                    }
                    if (touching) continue;
                }
                return true;
            }
        }
    }
    return false;
};