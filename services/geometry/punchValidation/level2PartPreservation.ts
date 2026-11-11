/**
 * УРОВЕНЬ 2. СОХРАННОСТЬ ГОТОВОЙ ДЕТАЛИ И ОСОБОЕ ПРАВИЛО ОТКРЫТОГО УГЛА
 * 
 * Проверяет:
 * 1. Исключение зарезания (Gouge) внутрь сохраняемого тела детали.
 * 2. Особое правило открытого внешнего угла (выход пуансона минимум на 1.0 мм за открытую границу).
 * 3. Контроль разрешенного и запрещенного выступа в зону отхода/детали.
 */
import { Point, Tool, PartGeometry } from '../../../types';
import { isPointInsideContour } from '../predicates';
import { distanceSq } from '../math';
import { Segment } from '../topology';
import { PunchValidationIssue } from './types';
import { ValidationConfig } from './config';

export interface Level2Result {
    isValid: boolean;
    hasInwardGouge: boolean;
    maxInwardDepth: number;
    hasExcessiveOverhang: boolean;
    maxOverhangDistance: number;
    issues: PunchValidationIssue[];
}

/**
 * Вычисляет минимальное расстояние от точки до отрезка прямой или дуги.
 */
const pointToContourDistance = (p: Point, currentSegment: Segment, allSegments?: Segment[]): number => {
    let minDist = Infinity;

    const evalDistToSeg = (seg: Segment): number => {
        if (seg.type === 'line') {
            const l2 = distanceSq(seg.p1, seg.p2);
            if (l2 === 0) return Math.sqrt(distanceSq(p, seg.p1));
            const t = Math.max(0, Math.min(1, ((p.x - seg.p1.x) * (seg.p2.x - seg.p1.x) + (p.y - seg.p1.y) * (seg.p2.y - seg.p1.y)) / l2));
            const proj = { x: seg.p1.x + t * (seg.p2.x - seg.p1.x), y: seg.p1.y + t * (seg.p2.y - seg.p1.y) };
            return Math.sqrt(distanceSq(p, proj));
        } else if (seg.type === 'arc' && seg.radius && seg.center) {
            return Math.abs(Math.sqrt(distanceSq(p, seg.center)) - seg.radius);
        }
        return Infinity;
    };

    minDist = evalDistToSeg(currentSegment);

    if (allSegments) {
        for (const seg of allSegments) {
            const d = evalDistToSeg(seg);
            if (d < minDist) minDist = d;
        }
    }

    return minDist;
};

export const validateLevel2PartPreservation = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    poly: Point[],
    geometry: PartGeometry,
    currentSegment: Segment,
    allSegments?: Segment[],
    config?: ValidationConfig
): Level2Result => {
    const issues: PunchValidationIssue[] = [];
    const cfg = config || {
        precision: 0.001,
        maxInwardGougeTolerance: 0.05,
        minOpenCornerProtrusion: 1.0,
        maxAllowedOverhang: 30.0
    };

    const bbox = geometry.bbox;
    const denorm = (p: Point) => ({ x: p.x + bbox.minX, y: p.y + bbox.minY });

    let hasInwardGouge = false;
    let maxInwardDepth = 0;

    // 1. Проверка зарезания (Inward Gouge) внутрь тела детали
    const probePoints: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        probePoints.push(p1);
        probePoints.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    }

    for (const pt of probePoints) {
        if (isPointInsideContour(denorm(pt), geometry)) {
            const distToEdge = pointToContourDistance(pt, currentSegment, allSegments);
            if (distToEdge > cfg.maxInwardGougeTolerance) {
                if (distToEdge > maxInwardDepth) maxInwardDepth = distToEdge;
            }
        }
    }

    if (maxInwardDepth > cfg.maxInwardGougeTolerance) {
        hasInwardGouge = true;
        issues.push({
            code: 'INWARD_GOUGE',
            severity: 'error',
            message: `Заход инструмента внутрь сохраняемого тела детали на ${maxInwardDepth.toFixed(3)} мм (допуск: ${cfg.maxInwardGougeTolerance} мм)`,
            coordinates: { x, y },
            affectedGeometry: (currentSegment as any)?.id || 'Contour',
            toolId: tool.id,
            ruleId: 'L2-GO-001'
        });
    }

    // 2. Особое правило открытого внешнего угла (Open External Corner Rule)
    // При обработке открытого внешнего угла пуансон должен выходить за границы минимум на 1.0 мм
    if (currentSegment && currentSegment.type === 'line') {
        const dx = currentSegment.p2.x - currentSegment.p1.x;
        const dy = currentSegment.p2.y - currentSegment.p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len > 0) {
            const ux = dx / len;
            const uy = dy / len;

            // Проверяем вылет режущей кромки инструмента за концы p1 и p2
            let minProj = Infinity;
            let maxProj = -Infinity;

            for (const pt of poly) {
                const proj = (pt.x - currentSegment.p1.x) * ux + (pt.y - currentSegment.p1.y) * uy;
                if (proj < minProj) minProj = proj;
                if (proj > maxProj) maxProj = proj;
            }

            const startProtrusion = -minProj;
            const endProtrusion = maxProj - len;

            // Если угол является открытым внешним (не микроперемычка), проверяем полноту выхода (>= 1.0 мм)
            if (startProtrusion < cfg.minOpenCornerProtrusion - 0.05 && startProtrusion > -5.0) {
                issues.push({
                    code: 'OPEN_CORNER_UNDER_PROTRUSION',
                    severity: 'warning',
                    message: `Недостаточный выход пуансона за открытый внешний угол в начале отрезка: ${startProtrusion.toFixed(2)} мм (требуется >= ${cfg.minOpenCornerProtrusion} мм)`,
                    coordinates: currentSegment.p1,
                    affectedGeometry: (currentSegment as any)?.id || 'Contour',
                    toolId: tool.id,
                    ruleId: 'L2-CORNER-002'
                });
            }

            if (endProtrusion < cfg.minOpenCornerProtrusion - 0.05 && endProtrusion > -5.0) {
                issues.push({
                    code: 'OPEN_CORNER_UNDER_PROTRUSION',
                    severity: 'warning',
                    message: `Недостаточный выход пуансона за открытый внешний угол в конце отрезка: ${endProtrusion.toFixed(2)} мм (требуется >= ${cfg.minOpenCornerProtrusion} мм)`,
                    coordinates: currentSegment.p2,
                    affectedGeometry: (currentSegment as any)?.id || 'Contour',
                    toolId: tool.id,
                    ruleId: 'L2-CORNER-003'
                });
            }
        }
    }

    // 3. Контроль выступа за пределы габарита отхода (Overhang)
    // Разрешен для наружных контурных резов (contourType === 'outer' или на отрезке наружного контура)
    let hasExcessiveOverhang = false;
    let maxOverhangDistance = 0;

    const isOuterContour = currentSegment?.contourType === 'outer' || currentSegment?.type === 'line';

    if (!isOuterContour) {
        const partW = bbox.maxX - bbox.minX;
        const partH = bbox.maxY - bbox.minY;

        for (const pt of poly) {
            const left = 0 - pt.x;
            const right = pt.x - partW;
            const bottom = 0 - pt.y;
            const top = pt.y - partH;

            const over = Math.max(0, left, right, bottom, top);
            if (over > maxOverhangDistance) maxOverhangDistance = over;
        }

        if (maxOverhangDistance > cfg.maxAllowedOverhang) {
            hasExcessiveOverhang = true;
            issues.push({
                code: 'EXCESSIVE_UNAUTHORIZED_OVERHANG',
                severity: 'error',
                message: `Несанкционированный вылет инструмента во внутреннюю область на ${maxOverhangDistance.toFixed(2)} мм (лимит: ${cfg.maxAllowedOverhang} мм)`,
                coordinates: { x, y },
                toolId: tool.id,
                ruleId: 'L2-OVER-004'
            });
        }
    }

    const isValid = !hasInwardGouge && !hasExcessiveOverhang;

    return {
        isValid,
        hasInwardGouge,
        maxInwardDepth,
        hasExcessiveOverhang,
        maxOverhangDistance,
        issues
    };
};
