
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
 * Парсер файла CP специального инструмента (DRAWING / PART_SIZE).
 * Извлекает контур инструмента, строит SVG path (центрированный вокруг 0,0 или нормализованный),
 * считывает габариты PART_SIZE или рассчитывает по точкам.
 */
export const parseCpSpecialTool = (content: string, fileName: string): Partial<Tool> | null => {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    let toolName = fileName.replace(/\.(cp|CP)$/, '');
    if (lines[0].toUpperCase() === 'DRAWING' && lines.length > 1) {
        const potentialName = lines[1].split(/\s+/)[0];
        if (potentialName && !potentialName.startsWith('ALT') && !potentialName.startsWith('0')) {
            toolName = potentialName;
        }
    }

    const geometryPoints: { x: number; y: number; flag: number }[] = [];
    let partSizeW: number | null = null;
    let partSizeH: number | null = null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('PART_SIZE')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                const w = parseFloat(parts[1]);
                const h = parseFloat(parts[2]);
                if (!isNaN(w) && !isNaN(h)) {
                    partSizeW = w;
                    partSizeH = h;
                }
            }
            continue;
        }

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

    if (geometryPoints.length === 0 || minX === Infinity) return null;

    const width = partSizeW ?? (maxX - minX);
    const height = partSizeH ?? (maxY - minY);

    // Нормализация координат от 0 до width / height
    const normalize = (x: number, y: number) => ({
        x: x - minX,
        y: y - minY
    });

    let svgPath = '';

    for (let i = 0; i < geometryPoints.length; i++) {
        const pt = geometryPoints[i];
        const n = normalize(pt.x, pt.y);
        const prevRaw = i > 0 ? geometryPoints[i - 1] : null;

        if (pt.flag === 8 || pt.flag === 9) {
            svgPath += `M ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
        } else if (pt.flag === 0) {
            if (prevRaw && prevRaw.flag !== 1 && prevRaw.flag !== -1) {
                svgPath += `L ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
            }
        } else if (pt.flag === 1 || pt.flag === -1) {
            // Флаг 1  = центр дуги по часовой стрелке (CW, forcedIsCCW = false)
            // Флаг -1 = центр дуги против часовой стрелки (CCW, forcedIsCCW = true)
            if (i > 0 && i + 1 < geometryPoints.length) {
                const startRaw = geometryPoints[i - 1];
                const centerRaw = pt;
                const endRaw = geometryPoints[i + 1];

                let prevRawForTan = startRaw;
                if (i > 1 && geometryPoints[i - 1].flag === 0) {
                    prevRawForTan = geometryPoints[i - 2];
                }

                const isCCW = pt.flag === -1; // 1 -> false (CW), -1 -> true (CCW)
                const { largeArc, sweep, radius } = calculateArcParams(prevRawForTan, startRaw, centerRaw, endRaw, isCCW);
                const endN = normalize(endRaw.x, endRaw.y);

                svgPath += `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} ${sweep} ${endN.x.toFixed(3)} ${endN.y.toFixed(3)} `;
            }
        }
    }

    svgPath += 'Z';

    return {
        name: toolName,
        shape: ToolShape.Special,
        width: parseFloat(width.toFixed(3)),
        height: parseFloat(height.toFixed(3)),
        customPath: svgPath,
        toolSize: width > 50 || height > 50 ? 'D' : (width > 30 || height > 30 ? 'C' : 'B'),
        description: `Специнструмент ${toolName} из файла CP`,
        maxOverhang: 20,
        maxInwardGouge: 0.05,
        minSlugWidth: 1.0,
        preventLooseSlugs: true
    };
};

/**
 * Определяет параметры SVG дуги (Large Arc, Sweep) и углы.
 * В формате CP:
 *   флаг 1  = центр дуги по часовой стрелке (CW, Sweep = 0 в стандартной декартовой Y-up системе)
 *   флаг -1 = центр дуги против часовой стрелки (CCW, Sweep = 1 в стандартной декартовой Y-up системе)
 */
const calculateArcParams = (
    prev: Point | null, 
    start: Point, 
    center: Point, 
    end: Point,
    forcedIsCCW?: boolean
): { largeArc: number, sweep: number, radius: number, isCCW: boolean } => {
    
    // Средний радиус для устранения погрешностей округления центра в CP файле
    const r1 = Math.sqrt(Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2));
    const r2 = Math.sqrt(Math.pow(end.x - center.x, 2) + Math.pow(end.y - center.y, 2));
    const radius = (r1 + r2) / 2; 
    
    // Исходные углы (в радианах от -PI до PI)
    const angStart = Math.atan2(start.y - center.y, start.x - center.x);
    const angEnd = Math.atan2(end.y - center.y, end.x - center.x);
    
    // Направление обхода: если задано явно через CP флаг, берем его; иначе fallback на векторное произведение
    let isCCW: boolean;
    if (forcedIsCCW !== undefined) {
        isCCW = forcedIsCCW;
    } else if (prev) {
        const v1x = start.x - prev.x;
        const v1y = start.y - prev.y;
        const v2x = end.x - start.x;
        const v2y = end.y - start.y;
        const cross = v1x * v2y - v1y * v2x;
        isCCW = cross >= 0;
    } else {
        let tmpDiff = angEnd - angStart;
        while (tmpDiff <= -Math.PI) tmpDiff += 2 * Math.PI;
        while (tmpDiff > Math.PI) tmpDiff -= 2 * Math.PI;
        isCCW = tmpDiff > 0;
    }

    let diff = angEnd - angStart;
    if (isCCW) {
        // Против часовой стрелки: разность положительная (0 до 2PI)
        while (diff <= 0) diff += 2 * Math.PI;
    } else {
        // По часовой стрелке: разность отрицательная (-2PI до 0)
        while (diff >= 0) diff -= 2 * Math.PI;
    }

    // largeArc: 1 если дуга больше 180 градусов
    const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;

    // В декартовой системе Y-up:
    // CCW (против часовой) -> Sweep = 1
    // CW  (по часовой)    -> Sweep = 0
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

    let currentContourType: 'outer' | 'inner' = 'outer';

    for (let i = 0; i < geometryPoints.length; i++) {
        const pt = geometryPoints[i];
        const n = normalize(pt.x, pt.y);
        
        const prevRaw = i > 0 ? geometryPoints[i-1] : null;

        if (pt.flag === 9 || pt.flag === 8) {
            currentContourType = pt.flag === 9 ? 'inner' : 'outer';
            svgPath += `M ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
        } else if (pt.flag === 0) {
            if (prevRaw && prevRaw.flag !== 1 && prevRaw.flag !== -1) {
                svgPath += `L ${n.x.toFixed(3)} ${n.y.toFixed(3)} `;
                const prevN = normalize(prevRaw.x, prevRaw.y);
                entities.push({
                    type: 'LINE',
                    start: { x: prevN.x, y: prevN.y },
                    end: { x: n.x, y: n.y },
                    contourType: currentContourType
                });
            }
        } else if (pt.flag === 1 || pt.flag === -1) {
            // Флаг 1  = центр дуги по часовой стрелке (CW, forcedIsCCW = false)
            // Флаг -1 = центр дуги против часовой стрелки (CCW, forcedIsCCW = true)
            if (i > 0 && i + 1 < geometryPoints.length) {
                const startRaw = geometryPoints[i-1];
                const centerRaw = pt;
                const endRaw = geometryPoints[i+1];
                
                let prevRawForTan = startRaw;
                // Try to find the point BEFORE the start of the arc to determine tangency/direction
                if (i > 1 && geometryPoints[i-1].flag === 0) {
                    prevRawForTan = geometryPoints[i-2];
                }

                const isCCW = pt.flag === -1; // 1 -> CW, -1 -> CCW
                const { largeArc, sweep, radius } = calculateArcParams(prevRawForTan, startRaw, centerRaw, endRaw, isCCW);
                
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
                    endAngle: entityEnd,
                    contourType: currentContourType
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
