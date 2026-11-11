/**
 * УРОВЕНЬ 3. БЕЗОПАСНОСТЬ ОТХОДОВ И ОСТАТОЧНЫХ ПЕРЕМЫЧЕК
 * 
 * Анализирует:
 * 1. Образование свободных отсоединенных угловых отходов (Topology Cut-off Check).
 * 2. Тонкую клиновидную стружку (Pinch / Sliver Check < minSlugWidth).
 * 3. Нарушение остаточных перемычек между независимыми контурами (Web Thickness < minWebThickness).
 */
import { Point, Tool, PartGeometry } from '../../../types';
import { isPointInsideContour } from '../predicates';
import { distanceSq } from '../math';
import { Segment } from '../topology';
import { PunchValidationIssue } from './types';
import { ValidationConfig } from './config';

export interface Level3Result {
    isValid: boolean;
    hasLooseSlugs: boolean;
    issues: PunchValidationIssue[];
}

const isPointInPolygon = (p: Point, poly: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const segmentIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < 1e-9) return null;
    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) };
    }
    return null;
};

const pointToSegmentDistance = (p: Point, p1: Point, p2: Point): number => {
    const l2 = distanceSq(p1, p2);
    if (l2 === 0) return Math.sqrt(distanceSq(p, p1));
    const t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
    const proj = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    return Math.sqrt(distanceSq(p, proj));
};

export const validateLevel3SlugsAndWebs = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    poly: Point[],
    geometry: PartGeometry,
    currentSegment: Segment,
    allSegments?: Segment[],
    config?: ValidationConfig
): Level3Result => {
    const issues: PunchValidationIssue[] = [];
    const cfg = config || {
        minSlugWidth: 0.8,
        minWebThickness: 1.0,
        checkLooseSlugs: true
    };

    if (!cfg.checkLooseSlugs) {
        return { isValid: true, hasLooseSlugs: false, issues: [] };
    }

    const bbox = geometry.bbox;
    const denorm = (p: Point) => ({ x: p.x + bbox.minX, y: p.y + bbox.minY });
    const norm = (p: Point) => ({ x: p.x - bbox.minX, y: p.y - bbox.minY });

    let hasLooseSlugs = false;

    // 1. Топологический анализ отсечения угловых отходов (Severed Corner Cut-offs)
    if (allSegments && currentSegment) {
        const p1Key = `${currentSegment.p1.x.toFixed(3)},${currentSegment.p1.y.toFixed(3)}`;
        const p2Key = `${currentSegment.p2.x.toFixed(3)},${currentSegment.p2.y.toFixed(3)}`;

        for (const seg of allSegments) {
            if (seg === currentSegment) continue;

            const isConnectedP1 = `${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}` === p1Key || `${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}` === p1Key;
            const isConnectedP2 = `${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}` === p2Key || `${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}` === p2Key;

            if (isConnectedP1 || isConnectedP2) {
                const sharedVertex = isConnectedP1 ? currentSegment.p1 : currentSegment.p2;
                const normV = norm(sharedVertex);
                const segP1 = norm(seg.p1);
                const segP2 = norm(seg.p2);

                for (let i = 0; i < poly.length; i++) {
                    const edge1 = poly[i];
                    const edge2 = poly[(i + 1) % poly.length];

                    const intP = segmentIntersection(edge1, edge2, segP1, segP2);
                    if (intP) {
                        const distFromVertex = Math.sqrt(distanceSq(intP, normV));
                        if (distFromVertex > 0.3) {
                            const vInTool = isPointInPolygon(normV, poly);
                            if (!vInTool) {
                                hasLooseSlugs = true;
                                issues.push({
                                    code: 'LOOSE_CORNER_SLUG',
                                    severity: 'error',
                                    message: `Образование незакрепенного выпадающего углового отхода: кромка на расстоянии ${distFromVertex.toFixed(2)} мм подрезает стенку, но угол не закрыт пуансоном`,
                                    coordinates: sharedVertex,
                                    affectedGeometry: (currentSegment as any)?.id || 'Contour',
                                    toolId: tool.id,
                                    ruleId: 'L3-SLUG-001'
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Проверка глубины захвата реза (Тонкая выпадающая стружка / Sliver Check)
    const centerNorm = { x, y };
    const centerInMaterial = isPointInsideContour(denorm(centerNorm), geometry);

    if (!centerInMaterial && currentSegment) {
        let inMaterialCount = 0;
        for (const pt of poly) {
            if (isPointInsideContour(denorm(pt), geometry)) {
                inMaterialCount++;
            }
        }

        if (inMaterialCount > 0) {
            let maxInternalPenetration = 0;
            for (const pt of poly) {
                if (isPointInsideContour(denorm(pt), geometry)) {
                    // Измеряем глубину реза
                    const segP1 = norm(currentSegment.p1);
                    const segP2 = norm(currentSegment.p2);
                    const d = pointToSegmentDistance(pt, segP1, segP2);
                    if (d > maxInternalPenetration) maxInternalPenetration = d;
                }
            }

            if (maxInternalPenetration < cfg.minSlugWidth && maxInternalPenetration > 0.05) {
                hasLooseSlugs = true;
                issues.push({
                    code: 'THIN_SLIVER',
                    severity: 'error',
                    message: `Образование тонкой выпадающей стружки: глубина реза ${maxInternalPenetration.toFixed(3)} мм < минимально допустимой ${cfg.minSlugWidth} мм`,
                    coordinates: { x, y },
                    affectedGeometry: (currentSegment as any)?.id || 'Contour',
                    toolId: tool.id,
                    ruleId: 'L3-SLUG-002'
                });
            }
        }
    }

    // 3. Проверка остаточных перемычек к соседним независящим элементам контура
    if (allSegments && currentSegment) {
        const p1Key = `${currentSegment.p1.x.toFixed(3)},${currentSegment.p1.y.toFixed(3)}`;
        const p2Key = `${currentSegment.p2.x.toFixed(3)},${currentSegment.p2.y.toFixed(3)}`;

        for (const seg of allSegments) {
            if (seg === currentSegment) continue;
            const isConn = `${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}` === p1Key ||
                           `${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}` === p2Key ||
                           `${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}` === p1Key ||
                           `${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}` === p2Key;
            if (isConn) continue;

            let minPolyDist = Infinity;
            const segP1 = norm(seg.p1);
            const segP2 = norm(seg.p2);

            for (const pt of poly) {
                let d = 0;
                if (seg.type === 'line') {
                    d = pointToSegmentDistance(pt, segP1, segP2);
                } else if (seg.type === 'arc' && seg.center && seg.radius) {
                    const normCenter = norm(seg.center);
                    d = Math.abs(Math.sqrt(distanceSq(pt, normCenter)) - seg.radius);
                }
                if (d < minPolyDist) minPolyDist = d;
            }

            if (minPolyDist > 0.05 && minPolyDist < cfg.minWebThickness) {
                hasLooseSlugs = true;
                issues.push({
                    code: 'THIN_WEB_BREACH',
                    severity: 'error',
                    message: `Опасное истончение перемычки к соседнему вырезу: ${minPolyDist.toFixed(3)} мм (требуется >= ${cfg.minWebThickness} мм)`,
                    coordinates: { x, y },
                    affectedGeometry: (seg as any)?.id || 'Neighbor',
                    toolId: tool.id,
                    ruleId: 'L3-WEB-003'
                });
            }
        }
    }

    return {
        isValid: !hasLooseSlugs,
        hasLooseSlugs,
        issues
    };
};
