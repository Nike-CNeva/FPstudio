
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
    const punches: { toolId: string, x: number, y: number, rotation: number, lineId?: string }[] = [];

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
                punches.push({
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
            punches.push({ toolId: tool.id, x, y, rotation: angle });
        }
    };

    // Execute Script
    // Safe-ish evaluation using new Function
    try {
        const generateFunc = new Function('Part', 'Length', 'Width', 'width', 'height', 'tools', 'Params', scriptCode);
        generateFunc(PartBuilder, targetWidth, targetHeight, targetWidth, targetHeight, tools, params);
    } catch (err: any) {
        throw new Error(`Runtime Error in Script: ${err.message}`);
    }

    if (ops.length === 0) {
        throw new Error("Скрипт не сгенерировал геометрию (Part.StartContour ...)");
    }

    // --- 1. Calculate Bounding Box ---
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let curX = 0, curY = 0;

    const checkPoint = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };

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
            
            // Check cardinal points (0, 90, 180, 270)
            // Angles in SVG coords (Y-Down): 
            // 0 = Right, 90 = Down, 180 = Left, 270 (-90) = Up.
            
            const startAng = Math.atan2(curY - centerY, curX - centerX);
            let endAng = Math.atan2(endY - centerY, endX - centerX);
            
            let start = startAng;
            let end = endAng;

            // Normalize range for checking containment
            if (clockwise) {
                // Visual CW (Y-Down) means angle INCREASES
                if (end < start) end += Math.PI * 2;
            } else {
                // Visual CCW (Y-Down) means angle DECREASES
                if (end > start) end -= Math.PI * 2;
            }

            // Check 4 cardinals: 0, PI/2, PI, 3PI/2 (and their periodic equivalents)
            const cardinals = [0, Math.PI/2, Math.PI, 3*Math.PI/2, 2*Math.PI, -Math.PI/2, -Math.PI];
            
            cardinals.forEach(ang => {
                // Check if ang is between start and end
                let within = false;
                if (clockwise) {
                    // increasing
                    if (ang > start && ang < end) within = true;
                    // Check shifted by 2PI
                    if ((ang + 2*Math.PI) > start && (ang + 2*Math.PI) < end) within = true;
                } else {
                    // decreasing
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

    // --- 2. Generate Path and Entities ---
    
    let path = "";
    const entities: DxfEntity[] = [];
    curX = 0; curY = 0;

    // We assume the script generates coordinates relative to (0,0) being the top-left of the flat pattern
    // or at least consistent. We use minX/minY to normalize if needed, but typically scripts start at 0.
    // If minX is negative (e.g. chamfer start), we might want to shift?
    // For now, we trust the script coordinates are what the user intends to see in the SVG.
    // But for CAD entities, we must flip Y based on `actualHeight`.

    ops.forEach(op => {
        if (op.type === 'move') {
            path += `M ${op.x.toFixed(3)} ${op.y.toFixed(3)} `;
            curX = op.x; curY = op.y;
        } else if (op.type === 'line') {
            path += `L ${op.x.toFixed(3)} ${op.y.toFixed(3)} `;
            
            entities.push({ 
                type: 'LINE', 
                start: { x: curX, y: actualHeight - curY }, 
                end: { x: op.x, y: actualHeight - op.y } 
            });
            
            curX = op.x; curY = op.y;
        } else if (op.type === 'arc') {
            const { endX, endY, centerX, centerY, clockwise } = op;
            const r = Math.sqrt((curX - centerX)**2 + (curY - centerY)**2);
            
            // SVG Params
            const startA = Math.atan2(curY - centerY, curX - centerX);
            const endA = Math.atan2(endY - centerY, endX - centerX);
            let diff = endA - startA;
            
            if (clockwise) {
                while (diff < 0) diff += Math.PI*2;
            } else {
                while (diff > 0) diff -= Math.PI*2;
            }
            
            const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
            const sweep = clockwise ? 1 : 0; // SVG sweep: 1=CW (Positive angle direction in std math, but SVG Y-down logic applies) 
            // Note: In SVG (Y-Down), Sweep=1 draws "Positive angle" direction relative to X axis? 
            // Standard SVG: Sweep 1 is Clockwise. Sweep 0 is Counter-Clockwise.
            
            path += `A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${largeArc} ${sweep} ${endX.toFixed(3)} ${endY.toFixed(3)} `;
            
            // CAD Entity (Y-Up)
            const cadStartY = actualHeight - curY;
            const cadEndY = actualHeight - endY;
            const cadCenterX = centerX;
            const cadCenterY = actualHeight - centerY;
            
            const cadStartAng = Math.atan2(cadStartY - cadCenterY, curX - cadCenterX) * 180 / Math.PI;
            const cadEndAng = Math.atan2(cadEndY - cadCenterY, endX - cadCenterX) * 180 / Math.PI;

            entities.push({
                type: 'ARC',
                center: { x: cadCenterX, y: cadCenterY },
                radius: r,
                startAngle: cadStartAng,
                endAngle: cadEndAng
            });

            curX = endX; curY = endY;
        }
    });

    const finalPath = path + " Z";
    const generatedPunches: PlacedTool[] = punches.map(p => ({ ...p, id: generateId() }));

    return {
        ...basePart,
        id: generateId(),
        name: `${basePart.name}_${targetWidth}x${targetHeight}`,
        // Store User Input Dimensions for reference
        faceWidth: targetWidth,
        faceHeight: targetHeight,
        // Store Actual Flat Pattern Dimensions for Geometry
        geometry: {
            path: finalPath,
            width: actualWidth,
            height: actualHeight,
            entities: entities,
            bbox: { minX, minY, maxX, maxY }
        },
        punches: generatedPunches,
        script: scriptCode
    };
};
