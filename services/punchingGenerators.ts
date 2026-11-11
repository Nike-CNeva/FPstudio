
import { Point, Tool, NibbleSettings, PlacedTool, ToolShape, PartGeometry, AutoPunchSettings, DestructSettings } from '../types';
import { generateId } from '../utils/helpers';
import { degreesToRadians } from './punchingUtils';
import { getPreferredTools } from './punchingTools';
import { findClosedLoops, validateToolPunchIntegrity } from './geometry';

export const generateNibblePunches = (
    p1: Point,
    p2: Point,
    tool: Tool,
    settings: NibbleSettings,
    angle: number,
    wasNormalized: boolean,
    punchOrientation: number,
    punchOffset: number
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const lineGroupId = `nibble_${generateId()}`;
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return [];
    
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;

    const extensionStart = settings.extensionStart;
    const extensionEnd = settings.extensionEnd;
    
    // Effective punching length
    const effectiveLength = length + extensionStart + extensionEnd;

    // If negative extensions (micro-joints) consume the whole line, skip
    if (effectiveLength <= 0.1) return [];

    const toolRad = degreesToRadians(punchOrientation);
    const lineRad = degreesToRadians(angle);
    const relativeAngle = Math.abs(lineRad - toolRad);
    
    let toolLength = 0;
    if (tool.shape === ToolShape.Circle) {
        toolLength = tool.width;
    } else {
        toolLength = tool.width * Math.abs(Math.cos(relativeAngle)) + tool.height * Math.abs(Math.sin(relativeAngle));
    }
    
    const step = Math.max(0.1, toolLength - settings.minOverlap);
    const halfProj = toolLength / 2;
    
    // Start position calculations
    const startX = p1.x - ux * extensionStart;
    const startY = p1.y - uy * extensionStart;

    const firstCenterX = startX + ux * halfProj + nx * punchOffset;
    const firstCenterY = startY + uy * halfProj + ny * punchOffset;
    
    let actualHits = 1;
    let adjustedStep = 0;
    let startDist = 0;

    const travelLength = effectiveLength - toolLength;

    if (travelLength <= 0) {
        // If tool fits once or overlaps bounds slightly, center it in effective area
        startDist = (effectiveLength / 2) - halfProj;
        actualHits = 1;
    } else {
        actualHits = Math.ceil(travelLength / step) + 1;
        adjustedStep = travelLength / (actualHits - 1);
    }

    for(let i=0; i<actualHits; i++) {
        const dist = startDist + i * adjustedStep;
        const px = firstCenterX + ux * dist;
        const py = firstCenterY + uy * dist;
        
        punches.push({
            toolId: tool.id,
            x: px,
            y: py,
            rotation: punchOrientation,
            lineId: lineGroupId
        });
    }
    return punches;
};

export const generateDestructPunches = (
    p1: Point,
    p2: Point,
    tool: Tool,
    settings: DestructSettings
): Omit<PlacedTool, 'id'>[] => {
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const width = maxX - minX;
    const height = maxY - minY;
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const groupID = `destruct_${generateId()}`;
    const toolW = tool.width;
    const toolH = tool.height;
    const stepX = Math.max(0.1, toolW - settings.overlap);
    const stepY = Math.max(0.1, toolH - settings.overlap);
    const travelX = Math.max(0, width - toolW);
    const travelY = Math.max(0, height - toolH);
    const countX = travelX > 0 ? Math.ceil(travelX / stepX) + 1 : 1;
    const countY = travelY > 0 ? Math.ceil(travelY / stepY) + 1 : 1;
    const adjStepX = countX > 1 ? travelX / (countX - 1) : 0;
    const adjStepY = countY > 1 ? travelY / (countY - 1) : 0;
    const startCenterX = minX + toolW / 2;
    const startCenterY = minY + toolH / 2;
    for(let r=0; r<countY; r++) {
        for(let c=0; c<countX; c++) {
            punches.push({
                toolId: tool.id,
                x: startCenterX + c * adjStepX,
                y: startCenterY + r * adjStepY,
                rotation: 0,
                lineId: groupID
            });
        }
    }
    return punches;
};

/**
 * Pre-scans geometry for recognizable shapes (Rectangles, Oblongs, Circles) 
 * that match available tools exactly.
 */
export const detectAndPunchShapes = (
    geometry: PartGeometry,
    processed: any,
    tools: Tool[],
    settings: AutoPunchSettings,
    coveredIndices: Set<number>
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const entities = geometry.entities || [];
    const bbox = geometry.bbox;

    const normalize = (p: Point) => ({ x: p.x - bbox.minX, y: p.y - bbox.minY });

    entities.forEach((entity) => {
        if (entity.type === 'CIRCLE') {
            const d = entity.radius * 2;
            const matches = getPreferredTools('circle', d, 0, tools, settings.toleranceRound);
            if (matches.length > 0) {
                const tool = matches[0];
                const center = normalize(entity.center);
                const seg = processed.segments.find((s: any) => s.originalEntity === entity);
                if (!seg || validateToolPunchIntegrity(tool, center.x, center.y, 0, geometry, bbox, seg, processed.segments, settings).isValid) {
                    punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: 0 });
                    processed.segments.forEach((s: any, idx: number) => {
                        if (s.originalEntity === entity) coveredIndices.add(idx);
                    });
                }
            }
        } else if (entity.type === 'LWPOLYLINE' && entity.closed) {
            const v = entity.vertices;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            v.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });
            const w = maxX - minX;
            const h = maxY - minY;
            const center = normalize({ x: (minX + maxX)/2, y: (minY + maxY)/2 });

            const isAxisAligned = v.every(p => (Math.abs(p.x - minX) < 0.01 || Math.abs(p.x - maxX) < 0.01) && (Math.abs(p.y - minY) < 0.01 || Math.abs(p.y - maxY) < 0.01));

            // Проверка специнструментов (Special): совпадение габаритов и пропорций полилинии
            const specialTools = tools.filter(t => t.shape === ToolShape.Special);
            for (const sTool of specialTools) {
                const rotAngles = [0, 90, 180, 270];
                for (const rot of rotAngles) {
                    const effW = (rot === 90 || rot === 270) ? sTool.height : sTool.width;
                    const effH = (rot === 90 || rot === 270) ? sTool.width : sTool.height;
                    if (Math.abs(effW - w) <= settings.toleranceRound && Math.abs(effH - h) <= settings.toleranceRound) {
                        const seg = processed.segments.find((s: any) => s.originalEntity === entity);
                        if (!seg || validateToolPunchIntegrity(sTool, center.x, center.y, rot, geometry, bbox, seg, processed.segments, settings).isValid) {
                            punches.push({ toolId: sTool.id, x: center.x, y: center.y, rotation: rot });
                            processed.segments.forEach((s: any, idx: number) => { if (s.originalEntity === entity) coveredIndices.add(idx); });
                            return;
                        }
                    }
                }
            }

            if (isAxisAligned) {
                const rectMatches = getPreferredTools('rect', w, h, tools, settings.toleranceRectLength);
                if (rectMatches.length > 0) {
                    const tool = rectMatches[0];
                    let rot = 0;
                    if (Math.abs(tool.width - h) < 0.1 && Math.abs(tool.height - w) < 0.1) rot = 90;
                    const seg = processed.segments.find((s: any) => s.originalEntity === entity);
                    if (!seg || validateToolPunchIntegrity(tool, center.x, center.y, rot, geometry, bbox, seg, processed.segments, settings).isValid) {
                        punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: rot });
                        processed.segments.forEach((s: any, idx: number) => { if (s.originalEntity === entity) coveredIndices.add(idx); });
                        return;
                    }
                }
            }

            const oblongMatches = getPreferredTools('oblong', w, h, tools, settings.toleranceRound); 
            if (oblongMatches.length > 0) {
                const tool = oblongMatches[0];
                let rot = 0;
                if (Math.abs(tool.width - h) < 0.1 && Math.abs(tool.height - w) < 0.1) rot = 90;
                const seg = processed.segments.find((s: any) => s.originalEntity === entity);
                if (!seg || validateToolPunchIntegrity(tool, center.x, center.y, rot, geometry, bbox, seg, processed.segments, settings).isValid) {
                    punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: rot });
                    processed.segments.forEach((s: any, idx: number) => { if (s.originalEntity === entity) coveredIndices.add(idx); });
                    return;
                }
            }
        }
    });

    return punches;
};

export const detectLoopTools = (
    processed: any,
    tools: Tool[],
    settings: AutoPunchSettings,
    coveredIndices: Set<number>
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const loops = findClosedLoops(processed.segments);
    const geometry = { bbox: processed.bbox, entities: processed.segments.map((s: any) => s.originalEntity).filter(Boolean) } as PartGeometry;

    loops.forEach(loop => {
        if (loop.segmentIndices.some(idx => coveredIndices.has(idx))) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        loop.vertices.forEach(v => {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        });

        loop.segmentIndices.forEach(idx => {
            const seg = processed.segments[idx];
            if (seg.type === 'arc' && seg.center && seg.radius) {
                const cx = seg.center.x; const cy = seg.center.y; const r = seg.radius;
                const check = (ax: number, ay: number) => {
                    if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
                    if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
                }
                check(cx - r, cy); check(cx + r, cy);
                check(cx, cy - r); check(cx, cy + r);
            }
        });

        const w = maxX - minX;
        const h = maxY - minY;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const targetSeg = processed.segments[loop.segmentIndices[0]];

        const oblongMatches = getPreferredTools('oblong', w, h, tools, settings.toleranceRound);
        if (oblongMatches.length > 0) {
            const tool = oblongMatches[0];
            let rot = 0;
            const match0 = Math.abs(tool.width - w) < settings.toleranceRound && Math.abs(tool.height - h) < settings.toleranceRound;
            const match90 = Math.abs(tool.width - h) < settings.toleranceRound && Math.abs(tool.height - w) < settings.toleranceRound;

            if (match0 || match90) {
                if (match90) rot = 90;
                if (validateToolPunchIntegrity(tool, cx, cy, rot, geometry, processed.bbox, targetSeg, processed.segments, settings).isValid) {
                    punches.push({ toolId: tool.id, x: cx, y: cy, rotation: rot });
                    loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                    return; 
                }
            }
        }

        const specialTools = tools.filter(t => t.shape === ToolShape.Special);
        for (const sTool of specialTools) {
            const rotAngles = [0, 90, 180, 270];
            for (const rot of rotAngles) {
                const effW = (rot === 90 || rot === 270) ? sTool.height : sTool.width;
                const effH = (rot === 90 || rot === 270) ? sTool.width : sTool.height;
                const matchW = Math.abs(effW - w) <= settings.toleranceRound;
                const matchH = Math.abs(effH - h) <= settings.toleranceRound;
                if (matchW && matchH) {
                    if (validateToolPunchIntegrity(sTool, cx, cy, rot, geometry, processed.bbox, targetSeg, processed.segments, settings).isValid) {
                        punches.push({ toolId: sTool.id, x: cx, y: cy, rotation: rot });
                        loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                        return;
                    }
                }
            }
        }

        const rectMatches = getPreferredTools('rect', w, h, tools, settings.toleranceRectLength);
        if (rectMatches.length > 0) {
            const tool = rectMatches[0];
            let rot = 0;
            const match0 = Math.abs(tool.width - w) < settings.toleranceRectLength && Math.abs(tool.height - h) < settings.toleranceRectWidth;
            const match90 = Math.abs(tool.width - h) < settings.toleranceRectLength && Math.abs(tool.height - w) < settings.toleranceRectWidth;

            if (match0 || match90) {
                if (match90) rot = 90;
                if (validateToolPunchIntegrity(tool, cx, cy, rot, geometry, processed.bbox, targetSeg, processed.segments, settings).isValid) {
                    punches.push({ toolId: tool.id, x: cx, y: cy, rotation: rot });
                    loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                    return;
                }
            }
        }
    });

    return punches;
};

/**
 * Подбор неполных совпадений элементов для специнструментов (Special):
 * 1. Треугольный/угловой специнструмент (по совпадению 2 сопряженных отрезков/угла)
 * 2. Дуговой специнструмент типа "банан" (по совпадению радиуса дуги)
 * Все найденные удары проходят обязательную валидацию через validateToolPunchIntegrity!
 */
export const detectSpecialFeatureTools = (
    geometry: PartGeometry,
    processed: any,
    tools: Tool[],
    settings: AutoPunchSettings,
    coveredIndices: Set<number>
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const specialTools = tools.filter(t => t.shape === ToolShape.Special);
    if (specialTools.length === 0) return punches;

    const segments = processed.segments;

    // 1. Проверка бананообразных и дугообразных специнструментов по дуговым сегментам
    segments.forEach((seg: any, idx: number) => {
        if (coveredIndices.has(idx)) return;
        if (seg.type === 'arc' && seg.radius && seg.center) {
            for (const sTool of specialTools) {
                const toolRadius = (sTool as any).radius ?? (Math.min(sTool.width, sTool.height) / 2);
                if (Math.abs(toolRadius - seg.radius) <= settings.toleranceRound) {
                    const cx = seg.center.x;
                    const cy = seg.center.y;
                    const rot = seg.startAngle ?? 0;

                    const valRes = validateToolPunchIntegrity(
                        sTool, cx, cy, rot, geometry, processed.bbox, seg, segments, settings
                    );
                    if (valRes.isValid) {
                        punches.push({ toolId: sTool.id, x: cx, y: cy, rotation: rot });
                        coveredIndices.add(idx);
                        break;
                    }
                }
            }
        }
    });

    // 2. Проверка треугольных/угловых специнструментов по 2 сопряженным отрезкам (угол/выемка)
    for (let i = 0; i < segments.length; i++) {
        if (coveredIndices.has(i)) continue;
        const seg1 = segments[i];
        if (seg1.type !== 'line') continue;

        for (let j = i + 1; j < segments.length; j++) {
            if (coveredIndices.has(j)) continue;
            const seg2 = segments[j];
            if (seg2.type !== 'line') continue;

            const p1Key = `${seg1.p1.x.toFixed(3)},${seg1.p1.y.toFixed(3)}`;
            const p2Key = `${seg1.p2.x.toFixed(3)},${seg1.p2.y.toFixed(3)}`;
            const q1Key = `${seg2.p1.x.toFixed(3)},${seg2.p1.y.toFixed(3)}`;
            const q2Key = `${seg2.p2.x.toFixed(3)},${seg2.p2.y.toFixed(3)}`;

            let sharedPoint: Point | null = null;
            if (p1Key === q1Key || p1Key === q2Key) sharedPoint = seg1.p1;
            else if (p2Key === q1Key || p2Key === q2Key) sharedPoint = seg1.p2;

            if (sharedPoint) {
                const len1 = Math.sqrt((seg1.p2.x - seg1.p1.x)**2 + (seg1.p2.y - seg1.p1.y)**2);
                const len2 = Math.sqrt((seg2.p2.x - seg2.p1.x)**2 + (seg2.p2.y - seg2.p1.y)**2);

                for (const sTool of specialTools) {
                    const rotAngles = [0, 90, 180, 270];
                    for (const rot of rotAngles) {
                        const effW = (rot === 90 || rot === 270) ? sTool.height : sTool.width;
                        const effH = (rot === 90 || rot === 270) ? sTool.width : sTool.height;

                        const matchNormal = Math.abs(effW - len1) <= settings.toleranceRectLength && Math.abs(effH - len2) <= settings.toleranceRectWidth;
                        const matchRotated = Math.abs(effW - len2) <= settings.toleranceRectLength && Math.abs(effH - len1) <= settings.toleranceRectWidth;

                        if (matchNormal || matchRotated) {
                            const px = sharedPoint.x;
                            const py = sharedPoint.y;

                            const valRes = validateToolPunchIntegrity(
                                sTool, px, py, rot, geometry, processed.bbox, seg1, segments, settings
                            );
                            if (valRes.isValid) {
                                punches.push({ toolId: sTool.id, x: px, y: py, rotation: rot });
                                coveredIndices.add(i);
                                coveredIndices.add(j);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    return punches;
};
