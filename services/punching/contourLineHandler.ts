
/**
 * ОТВЕТСТВЕННОСТЬ: Генерация ударов для LINE сегментов.
 */
import { Point, Tool, PlacedTool, ToolShape, PartGeometry, AutoPunchSettings } from '../../types';
import { isPointInsideContour, Segment, isToolGouging, validateToolPunchIntegrity } from '../geometry';
import { TOLERANCE, getPointKey } from '../punchingUtils';
import { getPreferredTools } from '../punchingTools';
import { generateNibblePunches } from '../punchingGenerators';

export const processLineSegment = (
    seg: Segment, 
    geometry: PartGeometry,
    tools: Tool[], 
    settings: AutoPunchSettings,
    punches: Omit<PlacedTool, 'id'>[],
    allSegments: Segment[],
    neighbors: { start: Segment | undefined, end: Segment | undefined },
    jointVertices: Set<string>
) => {
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const { bbox } = geometry;

    const isExtreme = (p: Point) => Math.abs(p.x - bbox.minX) < TOLERANCE.GEO || Math.abs(p.x - bbox.maxX) < TOLERANCE.GEO || 
                                  Math.abs(p.y - bbox.minY) < TOLERANCE.GEO || Math.abs(p.y - bbox.maxY) < TOLERANCE.GEO;

    const getExtRange = (vertex: Point, dir: {x: number, y: number}, neighbor: Segment | undefined) => {
        if (jointVertices.has(getPointKey(vertex))) return { min: -settings.microJointLength, max: -settings.microJointLength };
        if (neighbor && neighbor.type === 'arc') return { min: settings.extension, max: settings.extension };
        const probe = { x: vertex.x + dir.x * 0.1, y: vertex.y + dir.y * 0.1 };
        if (isPointInsideContour(probe, geometry)) return { min: 0, max: 0 };
        return isExtreme(vertex) ? { min: settings.extension, max: settings.extension } : { min: settings.extension, max: Math.max(settings.extension, settings.vertexTolerance) };
    };

    const ux = dx/len; const uy = dy/len;
    const startRange = getExtRange(seg.p1, { x: -ux, y: -uy }, neighbors.start);
    const endRange = getExtRange(seg.p2, { x: ux, y: uy }, neighbors.end);
    const minReqLen = len + startRange.min + endRange.min;
    const maxAllowedLen = len + startRange.max + endRange.max;

    // Подбор кандидатов инструментов в ПОРЯДКЕ УБЫВАНИЯ длины режущей кромки (для минимизации числа ударов)
    const lineToolCandidates = tools.filter(t => 
        [ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape)
    );

    if (lineToolCandidates.length === 0) return;

    lineToolCandidates.sort((a, b) => {
        const lenA = Math.max(a.width, a.height);
        const lenB = Math.max(b.width, b.height);
        if (Math.abs(lenB - lenA) > 0.01) {
            return lenB - lenA; // От большего к меньшему
        }
        const s = (t: Tool) => t.shape === ToolShape.Rectangle ? 10 : t.shape === ToolShape.Square ? 5 : 0;
        if (s(b) !== s(a)) return s(b) - s(a);
        return Math.min(a.width, a.height) - Math.min(b.width, b.height);
    });

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const mid = { x: (seg.p1.x + seg.p2.x) / 2, y: (seg.p1.y + seg.p2.y) / 2 };

    // Пробуем инструменты по очереди от самого широкого к более узким
    for (const candidateTool of lineToolCandidates) {
        const perpOffset = (candidateTool.shape === ToolShape.Circle ? candidateTool.width : candidateTool.height) / 2;
        
        // Определение стороны расположения инструмента (outer - снаружи детали, inner - внутри выреза)
        const probePointA = { x: mid.x - uy * perpOffset * 1.1, y: mid.y + ux * perpOffset * 1.1 };
        const isProbeAInMaterial = isPointInsideContour(probePointA, geometry);
        
        let sign: number;
        if (seg.contourType === 'inner') {
            sign = isProbeAInMaterial ? 1 : -1;
        } else {
            sign = isProbeAInMaterial ? -1 : 1;
        }

        const isSingleHit = candidateTool.width >= (minReqLen - 0.05) && candidateTool.width <= (maxAllowedLen + 10.0);

        let aStartExt = startRange.min;
        if (isSingleHit) {
            aStartExt = (settings.extension >= Math.max(startRange.min, candidateTool.width - len - endRange.max) && 
                         settings.extension <= Math.min(startRange.max, candidateTool.width - len - endRange.min)) 
                         ? settings.extension 
                         : Math.max(startRange.min, candidateTool.width - len - endRange.max);
        }
        const aEndExt = isSingleHit ? (candidateTool.width - len - aStartExt) : endRange.min;

        const segmentPunches = generateNibblePunches(
            seg.p1, 
            seg.p2, 
            candidateTool, 
            { extensionStart: aStartExt, extensionEnd: aEndExt, minOverlap: settings.overlap, hitPointMode: 'offset', toolPosition: 'long' }, 
            angle, 
            false, 
            angle, 
            perpOffset * sign
        );

        const checkPunchValid = (px: number, py: number, rot: number) => {
            return validateToolPunchIntegrity(candidateTool, px, py, rot, geometry, geometry.bbox, seg, allSegments, settings).isValid;
        };

        const validatedPunches: Omit<PlacedTool, 'id'>[] = [];
        let isCandidateFullyValid = true;

        for (let idx = 0; idx < segmentPunches.length; idx++) {
            const p = segmentPunches[idx];
            let curX = p.x, curY = p.y;
            
            if (!checkPunchValid(curX, curY, p.rotation)) {
                // Попытка микро-корректировки удлинения на углах
                if (idx === 0 && aStartExt > 0 && checkPunchValid(curX + ux * aStartExt, curY + uy * aStartExt, p.rotation)) {
                    curX += ux * aStartExt;
                    curY += uy * aStartExt;
                } else if (idx === segmentPunches.length - 1 && aEndExt > 0 && checkPunchValid(curX - ux * aEndExt, curY - uy * aEndExt, p.rotation)) {
                    curX -= ux * aEndExt;
                    curY -= uy * aEndExt;
                }
            }

            if (checkPunchValid(curX, curY, p.rotation)) {
                validatedPunches.push({ ...p, x: curX, y: curY });
            } else {
                isCandidateFullyValid = false;
                break;
            }
        }

        // Если все удары для данного широкого инструмента корректны, используем его!
        if (isCandidateFullyValid && validatedPunches.length > 0) {
            punches.push(...validatedPunches);
            return;
        }
    }

    // Резервный вариант: если ни один инструмент не прошёл 100% идеально, берем инструмент с лучшим совпадением и валидными ударами
    const fallbackTool = lineToolCandidates[lineToolCandidates.length - 1]; // Наинаименьший безопасный инструмент
    const perpOffset = (fallbackTool.shape === ToolShape.Circle ? fallbackTool.width : fallbackTool.height) / 2;
    const probePointA = { x: mid.x - uy * perpOffset * 1.1, y: mid.y + ux * perpOffset * 1.1 };
    const isProbeAInMaterial = isPointInsideContour(probePointA, geometry);
    const sign = (seg.contourType === 'inner') ? (isProbeAInMaterial ? 1 : -1) : (isProbeAInMaterial ? -1 : 1);

    const fallbackPunches = generateNibblePunches(
        seg.p1, 
        seg.p2, 
        fallbackTool, 
        { extensionStart: startRange.min, extensionEnd: endRange.min, minOverlap: settings.overlap, hitPointMode: 'offset', toolPosition: 'long' }, 
        angle, 
        false, 
        angle, 
        perpOffset * sign
    );

    fallbackPunches.forEach(p => {
        const valRes = validateToolPunchIntegrity(fallbackTool, p.x, p.y, p.rotation, geometry, geometry.bbox, seg, allSegments, settings);
        if (valRes.isValid) {
            punches.push(p);
        }
    });
};
