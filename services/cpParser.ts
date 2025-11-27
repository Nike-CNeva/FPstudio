
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
        // Ensure Horizontal Default (W > H)
        if (width < height) {
            const temp = width;
            width = height;
            height = temp;
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
        // Ensure Horizontal Default
        if (width < height) {
            const temp = width;
            width = height;
            height = temp;
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

// Calculates dot product of two vectors
const dot = (v1: Point, v2: Point) => v1.x * v2.x + v1.y * v2.y;

// Normalizes a vector
const normalizeVec = (v: Point) => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len === 0 ? {x:0, y:0} : {x: v.x/len, y: v.y/len};
};

/**
 * Determines SVG Arc parameters (Large Arc, Sweep) based on Tangent Continuity.
 * We use the RAW coordinates (Y-Up) to determine winding, then map to SVG.
 */
const calculateArcParams = (
    prev: Point, 
    start: Point, 
    center: Point, 
    end: Point,
    contourType: number // 8 (Outer), 9 (Inner)
): { largeArc: number, sweep: number, radius: number } => {
    
    const radius = Math.sqrt(Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2));
    
    // 1. Incoming Vector
    let vIn = { x: start.x - prev.x, y: start.y - prev.y };
    
    // If this is the first segment (vIn is zero), deduce direction from Contour Type
    // Outer (8) is usually CCW. Inner (9) is CW.
    // We can construct a fake vIn perpendicular to Radius to force that winding?
    // Better: If no history, use Shortest Arc logic + Contour Winding preference.
    const hasHistory = Math.abs(vIn.x) > 0.001 || Math.abs(vIn.y) > 0.001;

    // 2. Radial Vector at Start
    const vRad = { x: start.x - center.x, y: start.y - center.y };
    
    // 3. Tangent Vectors (perpendicular to Radius)
    // CCW Tangent: (-y, x)
    const tanCCW = { x: -vRad.y, y: vRad.x };
    // CW Tangent: (y, -x)
    const tanCW = { x: vRad.y, y: -vRad.x };
    
    let isCCW = true;

    if (hasHistory) {
        // Tangent Continuity: Which direction matches incoming vector?
        const dotCCW = dot(vIn, tanCCW);
        const dotCW = dot(vIn, tanCW);
        
        // If dotCCW > dotCW, we are turning CCW.
        isCCW = dotCCW >= dotCW;
    } else {
        // Fallback: Use Shortest Path, breaking ties with Contour Type
        // Calculate Cross Product of Start->End to find "Geometric Left/Right"
        const vSE = { x: end.x - start.x, y: end.y - start.y };
        // Cross: (Sx-Cx)(Ey-Cy) - ... is for sweep. 
        // Simpler: Cross Product of (Start-Center) and (End-Center)
        const cp = (start.x - center.x)*(end.y - center.y) - (start.y - center.y)*(end.x - center.x);
        
        // If CP > 0, End is "Left" (CCW) of Start.
        // If Contour is 8 (Outer/CCW), we prefer CCW.
        // This is heuristics. Assuming Short Arc for start is safer.
        const geometricIsCCW = cp > 0;
        
        // If the geometric short path aligns with contour type, great.
        // If not, we might be starting on a reflex corner? Unlikely.
        // Let's stick to Geometric Shortest for safety without tangent history.
        isCCW = geometricIsCCW;
    }

    // 4. Calculate Angles and Delta based on Decision
    const angStart = Math.atan2(start.y - center.y, start.x - center.x);
    const angEnd = Math.atan2(end.y - center.y, end.x - center.x);
    
    let delta = angEnd - angStart;
    // Normalize delta to -PI...PI? No, 0...2PI or -2PI...0
    
    if (isCCW) {
        // We need positive delta
        while (delta <= 0) delta += 2 * Math.PI;
        while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
    } else {
        // We need negative delta
        while (delta >= 0) delta -= 2 * Math.PI;
        while (delta < -2 * Math.PI) delta += 2 * Math.PI;
    }
    
    const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
    
    // 5. Map to SVG Flags
    // SVG Y is inverted.
    // World CCW (+Angle) -> SVG CW (-Angle relative to inverted Y).
    // SVG Sweep 0 = Negative Angle (CCW visual in standard SVG, which matches World CCW).
    // SVG Sweep 1 = Positive Angle.
    
    // Verification:
    // World (X, Y_up). CCW is X -> Y.
    // SVG (X, Y_down). X -> Y_down is Clockwise visually.
    // But SVG Arc Sweep 0 is "Counter Clockwise". 
    // Does SVG "Counter Clockwise" mean moving against the clock on the screen?
    // Yes. On screen (Y-down), CCW goes X -> Top(negative Y).
    // World CCW goes X -> Top(positive Y).
    // So World CCW maps to SVG CCW (Sweep 0).
    // Let's trust: World CCW -> Sweep 0. World CW -> Sweep 1.
    
    const sweep = isCCW ? 0 : 1;

    return { largeArc, sweep, radius };
};

export const parseCp = (content: string, fileName: string, existingTools: Tool[]): Part | null => {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    const geometryPoints: {x: number, y: number, flag: number}[] = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // 1. Parse Geometry
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
    
    const normalize = (x: number, y: number) => ({
        x: x - minX,
        y: maxY - y
    });

    let svgPath = "";
    let currentContourType = 8; // Default Outer
    
    // Store entities for script generation (Raw Coordinates)
    const entities: DxfEntity[] = [];

    for (let i = 0; i < geometryPoints.length; i++) {
        const pt = geometryPoints[i];
        const n = normalize(pt.x, pt.y);
        
        // Get previous point for entity construction
        const prevRaw = i > 0 ? geometryPoints[i-1] : null;

        if (pt.flag === 9 || pt.flag === 8) {
            svgPath += `M ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
            currentContourType = pt.flag;
        } else if (pt.flag === 0) {
            // NOTE: If previous point was an Arc Center (-1), this point (End of Arc)
            // was already reached by the Arc command. 
            // Do NOT draw a Line from Center, and do not add a zero-length Line command.
            if (prevRaw && prevRaw.flag !== -1) {
                svgPath += `L ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
                entities.push({
                    type: 'LINE',
                    start: { x: prevRaw.x, y: prevRaw.y },
                    end: { x: pt.x, y: pt.y }
                });
            }
        } else if (pt.flag === -1) {
            // Arc: Previous(Start) -> Current(Center) -> Next(End)
            if (i > 0 && i + 1 < geometryPoints.length) {
                const startRaw = geometryPoints[i-1];
                const centerRaw = pt;
                const endRaw = geometryPoints[i+1];
                
                // Get 'Prev' for tangent continuity (i-2)
                // If i-1 was a Move (flag 8/9), there is no prev vector, use startRaw as dummy
                let prevRawForTan = startRaw;
                if (i > 1 && geometryPoints[i-1].flag === 0) {
                    prevRawForTan = geometryPoints[i-2];
                }

                // Calculate in RAW coordinates (World Y-Up) for correct winding logic
                const { largeArc, sweep, radius } = calculateArcParams(prevRawForTan, startRaw, centerRaw, endRaw, currentContourType);
                
                const endN = normalize(endRaw.x, endRaw.y);
                
                svgPath += `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} ${sweep} ${endN.x.toFixed(3)} ${endN.y.toFixed(3)} `;
                
                // Populate Entity
                const startAngle = Math.atan2(startRaw.y - centerRaw.y, startRaw.x - centerRaw.x) * 180 / Math.PI;
                const endAngle = Math.atan2(endRaw.y - centerRaw.y, endRaw.x - centerRaw.x) * 180 / Math.PI;
                
                entities.push({
                    type: 'ARC',
                    center: { x: centerRaw.x, y: centerRaw.y },
                    radius: radius,
                    startAngle: startAngle,
                    endAngle: endAngle
                });
            }
        }
    }
    svgPath += "Z";

    // 2. Parse Material & Tooling
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
                currentRotation = parseFloat(lines[i+1]) || 0;
                i++;
            }
        } else if (line.startsWith('STRIKE')) {
            if (i + 1 < lines.length) {
                const coordsLine = lines[i+1];
                const parts = coordsLine.split(/\s+/);
                if (parts.length >= 2 && currentTool) {
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
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
            entities: entities, 
            bbox: { minX, minY, maxX, maxY }
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
