
import { Tool, Part, DxfEntity, Point, PlacedTool } from '../types';
import { generateId } from '../utils/helpers';

// Helper to find tool by partial name from script string (e.g. "RECT_3X10 3 32128")
const findToolByPattern = (tools: Tool[], pattern: string): Tool | undefined => {
    if (!pattern) return undefined;
    const cleanName = pattern.split(' ')[0].trim().toUpperCase();
    // Try exact match first (case-insensitive)
    const exact = tools.find(t => t.name.toUpperCase() === cleanName);
    if (exact) return exact;
    
    // Fallback to partial match if needed
    return tools.find(t => t.name.toUpperCase().includes(cleanName));
};

type DrawOp = 
    | { type: 'move', x: number, y: number }
    | { type: 'line', x: number, y: number }
    | { type: 'arc', endX: number, endY: number, centerX: number, centerY: number, clockwise: boolean };

export const executeParametricScript = (
    basePart: Part, 
    scriptCode: string, 
    tools: Tool[], 
    targetWidth: number, 
    targetHeight: number,
    params: Record<string, any> = {}
): Part => {
    
    const ops: DrawOp[] = [];
    // Temporary storage for raw punches (before normalization)
    const rawPunches: { toolId: string, x: number, y: number, rotation: number, lineId?: string }[] = [];

    const PartBuilder = {
        SetMaterial: (code: string, thickness: number) => {
            // Could store metadata if needed
        },
        SetControllerIndex: () => {}, 
        
        StartContour: (x: number, y: number) => {
            ops.push({ type: 'move', x, y });
        },
        LineTo: (x: number, y: number) => {
            ops.push({ type: 'line', x, y });
        },
        ArcTo: (endX: number, endY: number, centerX: number, centerY: number, clockwise: boolean) => {
            ops.push({ type: 'arc', endX, endY, centerX, centerY, clockwise });
        },
        NibbleLine: (toolPattern: string, x1: number, y1: number, x2: number, y2: number, angle: number, pitch: number) => {
            const tool = findToolByPattern(tools, toolPattern);
            if (!tool) return;

            const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            const count = Math.max(1, Math.ceil(dist / pitch));
            const dx = (x2 - x1) / count;
            const dy = (y2 - y1) / count;
            
            const lineId = `script_nibble_${generateId()}`;

            for (let i = 0; i <= count; i++) {
                rawPunches.push({
                    toolId: tool.id,
                    x: x1 + dx * i,
                    y: y1 + dy * i,
                    rotation: angle,
                    lineId: lineId
                });
            }
        },
        Strike: (toolPattern: string, x: number, y: number, angle: number) => {
            const tool = findToolByPattern(tools, toolPattern);
            if (!tool) return;
            rawPunches.push({ toolId: tool.id, x, y, rotation: angle });
        }
    };

    // Execute Script
    try {
        const generateFunc = new Function('Part', 'Length', 'Width', 'width', 'height', 'tools', 'Params', scriptCode);
        generateFunc(PartBuilder, targetWidth, targetHeight, targetWidth, targetHeight, tools, params);
    } catch (err: any) {
        throw new Error(`Runtime Error in Script: ${err.message}`);
    }

    if (ops.length === 0) {
        throw new Error("Скрипт не сгенерировал геометрию (Part.StartContour ...)");
    }

    // --- 1. Calculate Bounding Box of Generated Geometry ---
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let curX = 0, curY = 0;

    const checkPoint = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };

    // We must track current pen position to calculate arc bbox correctly
    ops.forEach(op => {
        if (op.type === 'move') {
            curX = op.x; curY = op.y;
            checkPoint(op.x, op.y);
        } else if (op.type === 'line') {
            checkPoint(op.x, op.y);
            curX = op.x; curY = op.y;
        } else if (op.type === 'arc') {
            checkPoint(op.endX, op.endY);
            
            // Calculate extrema of the arc
            const { centerX, centerY, endX, endY, clockwise } = op;
            const r = Math.sqrt((curX - centerX)**2 + (curY - centerY)**2);
            
            const startAng = Math.atan2(curY - centerY, curX - centerX);
            let endAng = Math.atan2(endY - centerY, endX - centerX);
            
            let start = startAng;
            let end = endAng;

            if (clockwise) {
                if (end < start) end += Math.PI * 2;
            } else {
                if (end > start) end -= Math.PI * 2;
            }

            const cardinals = [0, Math.PI/2, Math.PI, 3*Math.PI/2, 2*Math.PI, -Math.PI/2, -Math.PI];
            
            cardinals.forEach(ang => {
                let within = false;
                if (clockwise) {
                    if (ang > start && ang < end) within = true;
                    if ((ang + 2*Math.PI) > start && (ang + 2*Math.PI) < end) within = true;
                } else {
                    if (ang < start && ang > end) within = true;
                    if ((ang - 2*Math.PI) < start && (ang - 2*Math.PI) > end) within = true;
                }

                if (within) {
                    const px = centerX + r * Math.cos(ang);
                    const py = centerY + r * Math.sin(ang);
                    checkPoint(px, py);
                }
            });

            curX = endX; curY = endY;
        }
    });

    if (minX === Infinity) {
        minX = 0; maxX = targetWidth; minY = 0; maxY = targetHeight;
    }

    const actualWidth = maxX - minX;
    const actualHeight = maxY - minY;

    // --- 2. Normalization Helpers ---
    // Shift everything so minX, minY becomes 0, 0
    const normX = (x: number) => x - minX;
    const normY = (y: number) => y - minY;

    // --- 3. Generate Path and Normalized Entities ---
    
    let path = "";
    const entities: DxfEntity[] = [];
    curX = 0; curY = 0;

    // Restart traversal for generation with normalized coords
    ops.forEach(op => {
        if (op.type === 'move') {
            const nx = normX(op.x);
            const ny = normY(op.y);
            path += `M ${nx.toFixed(3)} ${ny.toFixed(3)} `;
            curX = nx; curY = ny;
        } else if (op.type === 'line') {
            const nx = normX(op.x);
            const ny = normY(op.y);
            path += `L ${nx.toFixed(3)} ${ny.toFixed(3)} `;
            
            entities.push({ 
                type: 'LINE', 
                start: { x: curX, y: curY }, 
                end: { x: nx, y: ny } 
            });
            
            curX = nx; curY = ny;
        } else if (op.type === 'arc') {
            const nx = normX(op.endX);
            const ny = normY(op.endY);
            const ncx = normX(op.centerX);
            const ncy = normY(op.centerY);
            const { clockwise } = op;

            const r = Math.sqrt((curX - ncx)**2 + (curY - ncy)**2);
            
            const startA = Math.atan2(curY - ncy, curX - ncx);
            const endA = Math.atan2(ny - ncy, nx - ncx);
            let diff = endA - startA;
            
            if (clockwise) {
                while (diff < 0) diff += Math.PI*2;
            } else {
                while (diff > 0) diff -= Math.PI*2;
            }
            
            const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
            const sweep = clockwise ? 1 : 0; 
            
            path += `A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${largeArc} ${sweep} ${nx.toFixed(3)} ${ny.toFixed(3)} `;
            
            // Standard CAD Angle (Counter-Clockwise)
            // If SVG sweep=1 (CW visual, +Angle math), math holds.
            const cadStartAng = startA * 180 / Math.PI;
            const cadEndAng = endA * 180 / Math.PI;

            // Note: If clockwise draw, start/end angles are physically correct relative to center
            // but for Entity 'start' and 'end' usually imply CCW order. 
            // DxfEntity ARC implies CCW traversal from startAngle to endAngle.
            let eStart = cadStartAng;
            let eEnd = cadEndAng;
            if (!clockwise) {
                // CCW Draw: Matches entity definition directly
            } else {
                // CW Draw: Entity should swap start/end to be represented as CCW arc 
                // OR we accept that start->end is the visual arc.
                // However, our DxfParser treats ARC as CCW.
                // If we drew P1->P2 Clockwise, the entity is the "Long" way around if we strictly say start=P1.
                // Actually, standard is: ARC entity goes CCW from start to end.
                // If we drew P1->P2 CW, the CCW arc is P2->P1.
                eStart = cadEndAng;
                eEnd = cadStartAng;
            }

            entities.push({
                type: 'ARC',
                center: { x: ncx, y: ncy },
                radius: r,
                startAngle: eStart,
                endAngle: eEnd
            });

            curX = nx; curY = ny;
        }
    });

    const finalPath = path + " Z";

    // --- 4. Normalize Punches ---
    const generatedPunches: PlacedTool[] = rawPunches.map(p => ({
        ...p,
        id: generateId(),
        x: normX(p.x),
        y: normY(p.y)
    }));

    return {
        ...basePart,
        id: generateId(),
        name: `${basePart.name}_${targetWidth}x${targetHeight}`,
        faceWidth: targetWidth,
        faceHeight: targetHeight,
        // The Geometry is now fully normalized to (0,0) based on actual extents
        geometry: {
            path: finalPath,
            width: actualWidth,
            height: actualHeight,
            entities: entities,
            // BBox is always 0-based for normalized geometry
            bbox: { minX: 0, minY: 0, maxX: actualWidth, maxY: actualHeight }
        },
        punches: generatedPunches,
        script: scriptCode
    };
};