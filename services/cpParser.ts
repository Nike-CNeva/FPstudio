
import { Part, Tool, PlacedTool, Point, ToolShape, PunchType, DxfEntity } from '../types';
import { generateId } from '../utils/helpers';

const parseToolName = (rawName: string): string => {
    return rawName.split(' ')[0].trim();
};

const findOrCreateTool = (name: string, library: Tool[]): Tool => {
    const exact = library.find(t => t.name.toUpperCase() === name.toUpperCase());
    if (exact) return exact;

    let shape = ToolShape.Circle;
    let width = 10;
    let height = 10;
    const upperName = name.toUpperCase();
    
    if (upperName.includes('RECT') || upperName.includes('SQ')) {
        shape = upperName.includes('SQ') ? ToolShape.Square : ToolShape.Rectangle;
        const dims = upperName.match(/(\d+)[X|x](\d+)/);
        if (dims) {
            width = parseFloat(dims[1]);
            height = parseFloat(dims[2]);
        }
    } else if (upperName.includes('RND') || upperName.includes('RO')) {
        shape = ToolShape.Circle;
        const dim = upperName.match(/(\d+)/);
        if (dim) width = height = parseFloat(dim[1]);
    } else if (upperName.includes('OBR')) {
        shape = ToolShape.Oblong;
        const dims = upperName.match(/(\d+)[X|x](\d+)/);
        if (dims) {
            width = parseFloat(dims[1]);
            height = parseFloat(dims[2]);
        }
    }

    return {
        id: `temp_${name}_${generateId()}`,
        name: name,
        shape,
        width,
        height,
        cornerRadius: 0,
        toolSize: 'B',
        description: 'Imported from CP',
        punchType: PunchType.General,
        dies: [],
        stripperHeight: 0,
        punchDepth: 0,
        ramSpeed: 0,
        acceleration: 0,
        operatingMode: 'PUNCHING',
        nibblingPriority: 0,
        punchPriority: 0,
        punchCount: 0,
        isAutoIndex: false,
        keyAngles: [],
        optimizingGroup: '',
        awayFromClamps: false,
        motionPrinciple: '',
        relievedStripper: 'none',
        yProtectionArea: 0,
        zoneWidth: 0,
        onlyForC5: false
    };
};

/**
 * Determines SVG Arc parameters (Large Arc, Sweep).
 * Handles direction detection (CW vs CCW) correctly based on contour winding.
 */
const calculateArcParams = (
    prev: Point | null, 
    start: Point, 
    center: Point, 
    end: Point
): { largeArc: number, sweep: number, radius: number, isCCW: boolean } => {
    
    // Average radius to mitigate center point precision errors in CP files
    const r1 = Math.sqrt(Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2));
    const r2 = Math.sqrt(Math.pow(end.x - center.x, 2) + Math.pow(end.y - center.y, 2));
    const radius = (r1 + r2) / 2; 
    
    // Calculate Raw Angles (in Radians -PI to PI)
    const angStart = Math.atan2(start.y - center.y, start.x - center.x);
    const angEnd = Math.atan2(end.y - center.y, end.x - center.x);
    
    // Determine Winding Direction (CCW or CW) based on "Turn" from previous segment
    // This resolves the ambiguity of which arc segment to draw (short vs long).
    let isCCW = true;

    if (prev) {
        const v1x = start.x - prev.x;
        const v1y = start.y - prev.y;
        const v2x = end.x - start.x;
        const v2y = end.y - start.y;
        
        // Cross Product (2D): determines turn direction relative to previous path
        // Positive = Left Turn (CCW in standard Cartesian)
        const cross = v1x * v2y - v1y * v2x;
        isCCW = cross >= 0;
    } else {
        // Fallback if no previous point (rare for valid CP contours): assume shortest path
        let tmpDiff = angEnd - angStart;
        while (tmpDiff <= -Math.PI) tmpDiff += 2 * Math.PI;
        while (tmpDiff > Math.PI) tmpDiff -= 2 * Math.PI;
        isCCW = tmpDiff > 0;
    }

    // Calculate angular difference based on the FORCED winding direction
    let diff = angEnd - angStart;

    if (isCCW) {
        // If Counter-Clockwise, difference must be Positive (0 to 2PI)
        while (diff <= 0) diff += 2 * Math.PI;
    } else {
        // If Clockwise, difference must be Negative (-2PI to 0)
        while (diff >= 0) diff -= 2 * Math.PI;
    }

    // largeArc flag: 1 if the arc spans more than 180 degrees
    const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;

    // Sweep flag: 1 for Positive angle direction (CCW), 0 for Negative (CW)
    const sweep = isCCW ? 1 : 0;

    return { largeArc, sweep, radius, isCCW };
};

export const parseCp = (content: string, fileName: string, existingTools: Tool[]): Part | null => {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    const geometryPoints: {x: number, y: number, flag: number}[] = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // 1. Parse Geometry Raw
    let lineIdx = 2;
    for (; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (line.startsWith('UNITS') || line.startsWith('PART_SIZE')) break;
        
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            const flag = parseInt(parts[2]);
            if (flag === 99) break;

            if (!isNaN(x) && !isNaN(y) && !isNaN(flag)) {
                geometryPoints.push({ x, y, flag });
                if (flag !== -1) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
    }
    
    if (minX === Infinity) return null;

    const width = maxX - minX;
    const height = maxY - minY;
    
    // Normalization Function: Shifts so bounding box min is (0,0)
    // IMPORTANT: CP coordinates are typically Y-Up. 
    // We normalize to a Cartesian 0,0 frame.
    const normalize = (x: number, y: number) => ({
        x: x - minX,
        y: y - minY 
    });

    let svgPath = "";
    const entities: DxfEntity[] = [];

    for (let i = 0; i < geometryPoints.length; i++) {
        const pt = geometryPoints[i];
        const n = normalize(pt.x, pt.y);
        
        const prevRaw = i > 0 ? geometryPoints[i-1] : null;

        if (pt.flag === 9 || pt.flag === 8) {
            svgPath += `M ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
        } else if (pt.flag === 0) {
            if (prevRaw && prevRaw.flag !== -1) {
                svgPath += `L ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
                const prevN = normalize(prevRaw.x, prevRaw.y);
                entities.push({
                    type: 'LINE',
                    start: { x: prevN.x, y: prevN.y },
                    end: { x: n.x, y: n.y }
                });
            }
        } else if (pt.flag === -1) {
            if (i > 0 && i + 1 < geometryPoints.length) {
                const startRaw = geometryPoints[i-1];
                const centerRaw = pt;
                const endRaw = geometryPoints[i+1];
                
                let prevRawForTan = startRaw;
                // Try to find the point BEFORE the start of the arc to determine tangency/direction
                if (i > 1 && geometryPoints[i-1].flag === 0) {
                    prevRawForTan = geometryPoints[i-2];
                }

                const { largeArc, sweep, radius, isCCW } = calculateArcParams(prevRawForTan, startRaw, centerRaw, endRaw);
                
                const endN = normalize(endRaw.x, endRaw.y);
                const centerN = normalize(centerRaw.x, centerRaw.y);
                
                svgPath += `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} ${sweep} ${endN.x.toFixed(3)} ${endN.y.toFixed(3)} `;
                
                const startAngle = Math.atan2(startRaw.y - centerRaw.y, startRaw.x - centerRaw.x) * 180 / Math.PI;
                const endAngle = Math.atan2(endRaw.y - centerRaw.y, endRaw.x - centerRaw.x) * 180 / Math.PI;
                
                // For DXF Entities (Internal Geometry Model):
                // 'ARC' entities are strictly CCW.
                // If the move is CW, we swap Start/End angles to represent the same physical curve 
                // in a CCW definition (Start=EndVisual, End=StartVisual).
                const entityStart = isCCW ? startAngle : endAngle;
                const entityEnd = isCCW ? endAngle : startAngle;

                entities.push({
                    type: 'ARC',
                    center: { x: centerN.x, y: centerN.y },
                    radius: radius,
                    startAngle: entityStart,
                    endAngle: entityEnd
                });
            }
        }
    }
    svgPath += "Z";

    // 2. Parse Tooling
    let materialCode = 'St-3';
    let materialThick = 1.0;
    const punches: PlacedTool[] = [];
    const tempTools: Tool[] = [];
    
    let currentTool: Tool | null = null;
    let currentRotation = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('MATERIAL')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                materialCode = parts[1];
                materialThick = parseFloat(parts[2]);
            }
        } else if (line.startsWith('TOOL')) {
            if (i + 1 < lines.length) {
                const nameLine = lines[i+1];
                const toolName = parseToolName(nameLine);
                let tool = existingTools.find(t => t.name === toolName) || tempTools.find(t => t.name === toolName);
                if (!tool) {
                    tool = findOrCreateTool(toolName, existingTools);
                    tempTools.push(tool);
                }
                currentTool = tool;
                i++;
            }
        } else if (line.startsWith('ROTATION')) {
            if (i + 1 < lines.length) {
                // CP files usually follow standard Cartesian CCW rotation.
                // Since our app uses Y-Up (standard Cartesian), no negation is needed.
                currentRotation = (parseFloat(lines[i+1]) || 0);
                i++;
            }
        } else if (line.startsWith('STRIKE')) {
            if (i + 1 < lines.length) {
                const coordsLine = lines[i+1];
                const parts = coordsLine.split(/\s+/);
                if (parts.length >= 2 && currentTool) {
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    // Normalize Punch Coords
                    const n = normalize(x, y);
                    punches.push({
                        id: generateId(),
                        toolId: currentTool.id,
                        x: n.x,
                        y: n.y,
                        rotation: currentRotation
                    });
                }
                i++;
            }
        } else if (line.startsWith('NIBBLE')) {
            if (i + 4 < lines.length) {
                const stepLine = lines[i+1].trim();
                const step = parseFloat(stepLine) || 10;
                
                const startParts = lines[i+2].split(/\s+/);
                const endParts = lines[i+3].split(/\s+/);
                
                if (startParts.length >= 2 && endParts.length >= 2 && currentTool) {
                    const x1 = parseFloat(startParts[0]);
                    const y1 = parseFloat(startParts[1]);
                    const x2 = parseFloat(endParts[0]);
                    const y2 = parseFloat(endParts[1]);
                    
                    const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
                    const count = Math.ceil(dist / step);
                    const dx = (x2 - x1) / count;
                    const dy = (y2 - y1) / count;
                    
                    const lineId = `cp_nibble_${generateId()}`;
                    
                    for(let k=0; k<=count; k++) {
                        const rx = x1 + dx*k;
                        const ry = y1 + dy*k;
                        // Normalize Nibble Coords
                        const n = normalize(rx, ry);
                        punches.push({
                            id: generateId(),
                            toolId: currentTool.id,
                            x: n.x,
                            y: n.y,
                            rotation: currentRotation,
                            lineId
                        });
                    }
                }
                i += 4;
            }
        }
    }

    return {
        id: generateId(),
        name: fileName.replace(/\.(cp|CP)$/, ''),
        faceWidth: width,
        faceHeight: height,
        geometry: {
            path: svgPath,
            width,
            height,
            entities: entities, // Normalized
            bbox: { minX: 0, minY: 0, maxX: width, maxY: height } // Normalized BBox
        },
        material: {
            code: materialCode,
            thickness: materialThick,
            dieClearance: 0.2
        },
        nesting: {
            allow0_180: true,
            allow90_270: true,
            initialRotation: 0,
            commonLine: false,
            canMirror: false
        },
        punches: punches
    };
};
