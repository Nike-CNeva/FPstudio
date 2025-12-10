
import { Point, Tool, NibbleSettings, PlacedTool, ToolShape, PartGeometry, AutoPunchSettings, DestructSettings } from '../types';
import { generateId } from '../utils/helpers';
import { degreesToRadians } from './punchingUtils';
import { getPreferredTools } from './punchingTools';
import { findClosedLoops } from './geometry';

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

    // Normalization helper
    const normalize = (p: Point) => ({ x: p.x - bbox.minX, y: p.y - bbox.minY });

    entities.forEach((entity) => {
        if (entity.type === 'CIRCLE') {
            const d = entity.radius * 2;
            const matches = getPreferredTools('circle', d, 0, tools, settings.toleranceRound);
            if (matches.length > 0) {
                const center = normalize(entity.center);
                punches.push({ toolId: matches[0].id, x: center.x, y: center.y, rotation: 0 });
                processed.segments.forEach((seg: any, idx: number) => {
                    if (seg.originalEntity === entity) coveredIndices.add(idx);
                });
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

            if (isAxisAligned) {
                const rectMatches = getPreferredTools('rect', w, h, tools, settings.toleranceRectLength);
                if (rectMatches.length > 0) {
                    const tool = rectMatches[0];
                    let rot = 0;
                    if (Math.abs(tool.width - h) < 0.1 && Math.abs(tool.height - w) < 0.1) rot = 90;
                    punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: rot });
                    processed.segments.forEach((seg: any, idx: number) => { if (seg.originalEntity === entity) coveredIndices.add(idx); });
                    return;
                }
            }

            const oblongMatches = getPreferredTools('oblong', w, h, tools, settings.toleranceRound); 
            if (oblongMatches.length > 0) {
                const tool = oblongMatches[0];
                let rot = 0;
                if (Math.abs(tool.width - h) < 0.1 && Math.abs(tool.height - w) < 0.1) rot = 90;
                punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: rot });
                processed.segments.forEach((seg: any, idx: number) => { if (seg.originalEntity === entity) coveredIndices.add(idx); });
                return;
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

    loops.forEach(loop => {
        if (loop.segmentIndices.some(idx => coveredIndices.has(idx))) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        loop.vertices.forEach(v => {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        });

        // Ensure arc bounds check included
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

        const oblongMatches = getPreferredTools('oblong', w, h, tools, settings.toleranceRound);
        if (oblongMatches.length > 0) {
            const tool = oblongMatches[0];
            let rot = 0;
            const match0 = Math.abs(tool.width - w) < settings.toleranceRound && Math.abs(tool.height - h) < settings.toleranceRound;
            const match90 = Math.abs(tool.width - h) < settings.toleranceRound && Math.abs(tool.height - w) < settings.toleranceRound;

            if (match0 || match90) {
                if (match90) rot = 90;
                punches.push({ toolId: tool.id, x: cx, y: cy, rotation: rot });
                loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                return; 
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
                punches.push({ toolId: tool.id, x: cx, y: cy, rotation: rot });
                loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                return;
            }
        }

        if (Math.abs(w - h) < 0.1) {
            const circleMatches = getPreferredTools('circle', w, 0, tools, settings.toleranceRound);
            if (circleMatches.length > 0) {
                const tool = circleMatches[0];
                if (Math.abs(tool.width - w) < settings.toleranceRound) {
                    punches.push({ toolId: tool.id, x: cx, y: cy, rotation: 0 });
                    loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                    return;
                }
            }
        }
    });

    return punches;
};
