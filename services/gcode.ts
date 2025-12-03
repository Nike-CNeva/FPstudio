import { NestResultSheet, Part, Tool, MachineSettings, OptimizerSettings, ToolShape, PunchType, PunchOp } from '../types';

interface G76Pattern {
    type: 'G76';
    start: PunchOp;
    angle: number; // J
    dist: number;  // I
    count: number; // K
    toolAngle: number; // C
}

// Order of operations priority
const PUNCH_TYPE_PRIORITY: Record<PunchType, number> = {
    [PunchType.Starting]: 1,
    [PunchType.General]: 2,
    [PunchType.Contour]: 3,
    [PunchType.Finishing]: 4,
};

// Represents an atomic unit of work: either a single hit or a complete nibble line
interface WorkUnit {
    id: string;
    ops: PunchOp[];
    center: { x: number, y: number };
    startPoint: { x: number, y: number }; // Entry point of the unit
    endPoint: { x: number, y: number };   // Exit point of the unit
    angle: number; // For sorting categorization
}

/**
 * Checks if a line segment (p1 -> p2) intersects with a protected clamp zone.
 */
const isPathSafe = (
    x1: number, y1: number, 
    x2: number, y2: number, 
    clamps: number[], 
    zoneX: number, 
    deadZoneY: number
): boolean => {
    if (y1 > deadZoneY && y2 > deadZoneY) return true;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    for (const clampX of clamps) {
        const clampMin = clampX - zoneX;
        const clampMax = clampX + zoneX;
        const xOverlap = Math.max(0, Math.min(maxX, clampMax) - Math.max(minX, clampMin));
        if (xOverlap > 0) return false;
    }
    return true;
};

/**
 * Calculates the Optimized Tool Path and Tool Sort Order.
 * Returns an array of operations ready for G-code generation or Simulation.
 */
export const calculateOptimizedPath = (
    sheet: NestResultSheet, 
    parts: Part[], 
    tools: Tool[], 
    optimizerSettings?: OptimizerSettings
): PunchOp[] => {
    
    const optimize = optimizerSettings || { 
        toolSequence: 'global-station', 
        pathOptimization: 'shortest-path', 
        startCorner: 'bottom-right',
        sheetUnloadMode: 'manual', 
        anglePriority: '0-90',
        useG76LinearPatterns: false 
    };

    const finalOps: PunchOp[] = [];
    
    // Starting Position (Park/Home)
    let lastX = 0; 
    let lastY = sheet.height;

    // Helper: Sort tools by Priority (PunchType) then Station Number
    const sortToolsByPriorityAndStation = (toolIds: string[]): string[] => {
        return toolIds.sort((a, b) => {
            const tA = tools.find(t => t.id === a);
            const tB = tools.find(t => t.id === b);
            if (!tA || !tB) return 0;

            // 1. Primary Sort: Punch Type
            const pA = PUNCH_TYPE_PRIORITY[tA.punchType] || 99;
            const pB = PUNCH_TYPE_PRIORITY[tB.punchType] || 99;
            if (pA !== pB) return pA - pB;

            // 2. Secondary Sort: Station Number
            const stA = tA.stationNumber || 999;
            const stB = tB.stationNumber || 999;
            if (stA !== stB) return stA - stB;

            // 3. Tertiary: MT Index
            const mtA = tA.mtIndex || 0;
            const mtB = tB.mtIndex || 0;
            return mtA - mtB;
        });
    };

    // Helper: Convert raw ops to WorkUnits (grouping nibbles)
    const createWorkUnits = (ops: PunchOp[]): WorkUnit[] => {
        const units: WorkUnit[] = [];
        const groupMap = new Map<string, PunchOp[]>();
        const singleOps: PunchOp[] = [];

        // 1. Separate singles and groups
        ops.forEach(op => {
            if (op.lineId) {
                if (!groupMap.has(op.lineId)) groupMap.set(op.lineId, []);
                groupMap.get(op.lineId)?.push(op);
            } else {
                singleOps.push(op);
            }
        });

        // 2. Create Units for Singles
        singleOps.forEach((op, idx) => {
            units.push({
                id: `single_${idx}`,
                ops: [op],
                center: { x: op.x, y: op.y },
                startPoint: { x: op.x, y: op.y },
                endPoint: { x: op.x, y: op.y },
                angle: op.rotation
            });
        });

        // 3. Create Units for Groups
        groupMap.forEach((groupOps, lineId) => {
            const first = groupOps[0];
            const last = groupOps[groupOps.length - 1];

            // Calculate centroid
            let sumX = 0, sumY = 0;
            groupOps.forEach(op => { sumX += op.x; sumY += op.y; });
            const cx = sumX / groupOps.length;
            const cy = sumY / groupOps.length;
            
            units.push({
                id: lineId,
                ops: groupOps, 
                center: { x: cx, y: cy },
                startPoint: { x: first.x, y: first.y },
                endPoint: { x: last.x, y: last.y },
                angle: first.rotation
            });
        });

        return units;
    };

    // Helper: Cluster nearby single hits regardless of angle
    const clusterCloseUnits = (units: WorkUnit[], threshold: number = 30): WorkUnit[] => {
        if (units.length < 2) return units;
        
        // Sort by X to optimize neighbor search
        units.sort((a, b) => a.center.x - b.center.x);
        
        const clustered: WorkUnit[] = [];
        const processed = new Set<string>();
        const thresholdSq = threshold * threshold;

        for (let i = 0; i < units.length; i++) {
            if (processed.has(units[i].id)) continue;
            
            let currentCluster = units[i];
            processed.add(currentCluster.id);
            
            let merged = true;
            while(merged) {
                merged = false;
                for (let j = i + 1; j < units.length; j++) {
                    if (processed.has(units[j].id)) continue;
                    
                    const u = units[j];
                    if (Math.abs(u.center.x - currentCluster.center.x) > threshold) {
                        continue; 
                    }

                    const dSq = (u.center.x - currentCluster.center.x)**2 + (u.center.y - currentCluster.center.y)**2;
                    if (dSq < thresholdSq) {
                        currentCluster.ops = [...currentCluster.ops, ...u.ops];
                        currentCluster.center.x = (currentCluster.center.x + u.center.x) / 2;
                        currentCluster.center.y = (currentCluster.center.y + u.center.y) / 2;
                        processed.add(u.id);
                        merged = true;
                    }
                }
            }
            clustered.push(currentCluster);
        }
        return clustered;
    };

    // Helper: Linear Scan Optimization for WorkUnits (Generic)
    const optimizeWorkUnits = (units: WorkUnit[], mode: 'x-axis' | 'y-axis' | 'shortest-path'): WorkUnit[] => {
        if (units.length === 0) return [];
        
        const result: WorkUnit[] = [];

        if (mode === 'shortest-path') {
            const remaining = [...units];
            while(remaining.length > 0) {
                let nearestIdx = -1;
                let minDistSq = Infinity;
                let bestIsReversed = false;

                for(let i=0; i<remaining.length; i++) {
                    const u = remaining[i];
                    const dStart = (u.startPoint.x - lastX)**2 + (u.startPoint.y - lastY)**2;
                    const dEnd = (u.endPoint.x - lastX)**2 + (u.endPoint.y - lastY)**2;

                    if (dStart < minDistSq) { minDistSq = dStart; nearestIdx = i; bestIsReversed = false; }
                    if (dEnd < minDistSq) { minDistSq = dEnd; nearestIdx = i; bestIsReversed = true; }
                }

                const next = remaining[nearestIdx];
                if (bestIsReversed && next.ops.length > 1) {
                    next.ops.reverse();
                    const temp = next.startPoint; next.startPoint = next.endPoint; next.endPoint = temp;
                }
                result.push(next);
                lastX = next.endPoint.x; lastY = next.endPoint.y;
                remaining.splice(nearestIdx, 1);
            }
            return result;
        } 
        
        const sortedUnits = [...units].sort((a, b) => {
            if (mode === 'x-axis') return a.center.y - b.center.y;
            return a.center.x - b.center.x; 
        });

        const bandTolerance = 50.0; 
        const bands: WorkUnit[][] = [];
        if (sortedUnits.length > 0) {
            let currentBand: WorkUnit[] = [sortedUnits[0]];
            let bandStartVal = mode === 'x-axis' ? sortedUnits[0].center.y : sortedUnits[0].center.x;

            for (let i = 1; i < sortedUnits.length; i++) {
                const u = sortedUnits[i];
                const uVal = mode === 'x-axis' ? u.center.y : u.center.x;
                if (Math.abs(uVal - bandStartVal) <= bandTolerance) {
                    currentBand.push(u);
                } else {
                    bands.push(currentBand);
                    currentBand = [u];
                    bandStartVal = uVal;
                }
            }
            bands.push(currentBand);
        }

        if (bands.length > 1) {
            const firstBandUnit = bands[0][0];
            const lastBandUnit = bands[bands.length - 1][0];
            
            const firstVal = mode === 'x-axis' ? firstBandUnit.center.y : firstBandUnit.center.x;
            const lastVal = mode === 'x-axis' ? lastBandUnit.center.y : lastBandUnit.center.x;
            
            let distToFirst = 0; let distToLast = 0;
            if (mode === 'x-axis') { distToFirst = Math.abs(firstVal - lastY); distToLast = Math.abs(lastVal - lastY); } 
            else { distToFirst = Math.abs(firstVal - lastX); distToLast = Math.abs(lastVal - lastX); }

            if (distToLast < distToFirst) { bands.reverse(); }
        }

        for (const bandUnits of bands) {
            bandUnits.sort((a, b) => {
                if (mode === 'x-axis') return a.center.x - b.center.x;
                return a.center.y - b.center.y;
            });

            if (bandUnits.length === 0) continue;

            const firstUnit = bandUnits[0];
            const lastUnit = bandUnits[bandUnits.length - 1];
            const distToStart = (firstUnit.startPoint.x - lastX)**2 + (firstUnit.startPoint.y - lastY)**2;
            const distToEnd = (lastUnit.endPoint.x - lastX)**2 + (lastUnit.endPoint.y - lastY)**2;

            if (distToEnd < distToStart) { bandUnits.reverse(); }

            for (const unit of bandUnits) {
                const dUStart = (unit.startPoint.x - lastX)**2 + (unit.startPoint.y - lastY)**2;
                const dUEnd = (unit.endPoint.x - lastX)**2 + (unit.endPoint.y - lastY)**2;
                
                if (dUEnd < dUStart && unit.ops.length > 1) {
                    unit.ops.reverse();
                    const temp = unit.startPoint; unit.startPoint = unit.endPoint; unit.endPoint = temp;
                }
                result.push(unit);
                lastX = unit.endPoint.x; lastY = unit.endPoint.y;
            }
        }
        return result;
    };

    // Main Routing Logic
    const processGroup = (ops: PunchOp[], tool?: Tool): PunchOp[] => {
        if (ops.length === 0) return [];

        let units = createWorkUnits(ops);

        // --- CONTOUR TOOL SPECIAL LOGIC (STRICT SNAKE) ---
        if (tool && tool.punchType === PunchType.Contour) {
            const verts: WorkUnit[] = [];
            const horz: WorkUnit[] = [];
            
            // Separate by orientation
            units.forEach(u => {
                const ang = Math.abs(u.angle % 180);
                if (ang > 45 && ang < 135) verts.push(u); // 90/270 (Vertical Lines)
                else horz.push(u); // 0/180 (Horizontal Lines)
            });

            // Band Clustering Helper
            const cluster = (list: WorkUnit[], axis: 'x'|'y') => {
                if(list.length === 0) return [];
                // Initial sort to group close values
                list.sort((a,b) => (axis==='x' ? a.center.x - b.center.x : a.center.y - b.center.y));
                const bands = [];
                let band = [list[0]];
                let ref = axis==='x' ? list[0].center.x : list[0].center.y;
                for(let i=1; i<list.length; i++) {
                    const val = axis==='x' ? list[i].center.x : list[i].center.y;
                    
                    // FIXED: Reduced tolerance from 10.0 to 1.0 to prevent jumping between parallel lines
                    if(Math.abs(val - ref) <= 1.0) { 
                        band.push(list[i]);
                    } else {
                        bands.push(band);
                        band = [list[i]];
                        ref = val;
                    }
                }
                bands.push(band);
                return bands;
            };

            const sortedOps: PunchOp[] = [];

            // --- 2. Process Verticals ---
            // Move along X axis (Left to Right), scan Y inside bands
            const vBands = cluster(verts, 'x');
            // Sort bands: Left to Right (Min X -> Max X)
            vBands.sort((a,b) => a[0].center.x - b[0].center.x); 
            
            vBands.forEach((band, index) => {
                // STRICT SNAKE: Even bands go Up (MinY->MaxY), Odd bands go Down (MaxY->MinY)
                const isUp = index % 2 === 0;

                band.sort((a, b) => {
                    return isUp ? (a.center.y - b.center.y) : (b.center.y - a.center.y);
                });

                for(const u of band) {
                    // Force internal line direction to match band direction
                    if (u.ops.length > 1) {
                        const startY = u.ops[0].y;
                        const endY = u.ops[u.ops.length - 1].y;
                        // If going Up, we want startY < endY. If not, flip.
                        if (isUp) {
                            if (startY > endY) u.ops.reverse();
                        } else {
                            if (startY < endY) u.ops.reverse();
                        }
                    }
                    sortedOps.push(...u.ops);
                    // Update head pos for next logic block (though strict snake ignores it for sorting)
                    const lastOp = u.ops[u.ops.length - 1];
                    lastX = lastOp.x; lastY = lastOp.y;
                }
            });

            // --- 3. Process Horizontals ---
            // Move along Y axis (Top to Bottom), scan X inside bands
            const hBands = cluster(horz, 'y');
            // Sort bands: Top to Bottom (Max Y -> Min Y)
            hBands.sort((a,b) => b[0].center.y - a[0].center.y);
            
            hBands.forEach((band, index) => {
                // STRICT SNAKE: Even bands go Right->Left (MaxX->MinX), Odd bands go Left->Right
                const isRightToLeft = index % 2 === 0;

                band.sort((a, b) => {
                    return isRightToLeft ? (b.center.x - a.center.x) : (a.center.x - b.center.x);
                });

                for(const u of band) {
                    // Force internal line direction
                    if (u.ops.length > 1) {
                        const startX = u.ops[0].x;
                        const endX = u.ops[u.ops.length - 1].x;
                        // If going RightToLeft, startX > endX
                        if (isRightToLeft) {
                            if (startX < endX) u.ops.reverse();
                        } else {
                            if (startX > endX) u.ops.reverse();
                        }
                    }
                    sortedOps.push(...u.ops);
                    const lastOp = u.ops[u.ops.length - 1];
                    lastX = lastOp.x; lastY = lastOp.y;
                }
            });
            
            return sortedOps;
        }

        // --- STANDARD TOOL LOGIC (unchanged) ---
        units = clusterCloseUnits(units, 30);

        if (optimize.pathOptimization === 'shortest-path') {
            const sortedUnits = optimizeWorkUnits(units, 'shortest-path');
            return sortedUnits.flatMap(u => u.ops);
        }

        // Standard Scanline: Split by Angle Priority
        const group0: WorkUnit[] = [];
        const group90: WorkUnit[] = [];

        units.forEach(u => {
            const r = Math.abs(u.ops[0].rotation % 180);
            if (r < 5.0 || r > 175.0) group0.push(u);
            else group90.push(u);
        });

        let firstGroup = group0;
        let secondGroup = group90;
        if (optimize.anglePriority === '90-0') {
            firstGroup = group90;
            secondGroup = group0;
        }

        const sortedFirst = optimizeWorkUnits(firstGroup, optimize.pathOptimization);
        const sortedSecond = optimizeWorkUnits(secondGroup, optimize.pathOptimization);

        return [...sortedFirst, ...sortedSecond].flatMap(u => u.ops);
    };

    // -------------------------------------------------------------------------
    // GENERATE OPERATIONS (Common for strategies)
    // -------------------------------------------------------------------------
    const generateRawOps = (partDef: Part, pp: any): PunchOp[] => {
        const rad = (pp.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        return partDef.punches.map(punch => {
            const rx = punch.x * cos - punch.y * sin;
            const ry = punch.x * sin + punch.y * cos;
            const punchX = pp.x + rx;
            const punchY = pp.y + ry;
            let punchRot = (punch.rotation + pp.rotation) % 360;
            if (punchRot < 0) punchRot += 360;

            const tool = tools.find(t => t.id === punch.toolId);
            let toolT = tool?.stationNumber || 0;
            if (tool?.mtIndex) toolT = 20 + tool.mtIndex;

            return {
                type: 'single',
                toolId: punch.toolId,
                toolT: toolT,
                x: punchX,
                y: punchY,
                rotation: punchRot,
                lineId: punch.lineId ? `${pp.id}_${punch.lineId}` : undefined,
                sourcePunchId: punch.id,
                compositeId: `${pp.id}_${punch.id}` // Unique composite ID for exact simulation matching
            };
        });
    };

    // -------------------------------------------------------------------------
    // STRATEGY 1: PART-BY-PART
    // -------------------------------------------------------------------------
    if (optimize.toolSequence === 'part-by-part') {
        // Sort parts by Y band then X (Snake over parts)
        const sortedPlacedParts = [...sheet.placedParts].sort((a, b) => {
            const bandHeight = 100;
            const bandA = Math.floor(a.y / bandHeight);
            const bandB = Math.floor(b.y / bandHeight);
            if (bandA !== bandB) return bandA - bandB;
            return bandA % 2 === 0 ? a.x - b.x : b.x - a.x;
        });

        for (const pp of sortedPlacedParts) {
            const partDef = parts.find(p => p.id === pp.partId);
            if (!partDef) continue;

            const partPunches = generateRawOps(partDef, pp);
            const toolsInPart = Array.from(new Set(partPunches.map(p => p.toolId)));
            const sortedToolsInPart = sortToolsByPriorityAndStation(toolsInPart);

            for (const tid of sortedToolsInPart) {
                const punchesForTool = partPunches.filter(p => p.toolId === tid);
                const toolDef = tools.find(t => t.id === tid);
                const optimizedPunches = processGroup(punchesForTool, toolDef);
                
                if (optimizedPunches.length > 0) {
                    optimizedPunches[0].isToolChange = true;
                    finalOps.push(...optimizedPunches);
                }
            }
        }
    } 
    
    // -------------------------------------------------------------------------
    // STRATEGY 2: GLOBAL STATION ORDER
    // -------------------------------------------------------------------------
    else {
        const allPunches: PunchOp[] = [];

        sheet.placedParts.forEach(pp => {
            const partDef = parts.find(p => p.id === pp.partId);
            if (partDef) {
                allPunches.push(...generateRawOps(partDef, pp));
            }
        });

        const punchesByTool = new Map<string, PunchOp[]>();
        allPunches.forEach(p => {
            if (!punchesByTool.has(p.toolId)) punchesByTool.set(p.toolId, []);
            punchesByTool.get(p.toolId)?.push(p);
        });

        const uniqueToolIds = Array.from(punchesByTool.keys());
        const sortedToolIds = sortToolsByPriorityAndStation(uniqueToolIds);

        for (const tid of sortedToolIds) {
            const group = punchesByTool.get(tid) || [];
            const toolDef = tools.find(t => t.id === tid);
            const optimizedGroup = processGroup(group, toolDef);

            if (optimizedGroup.length > 0) {
                optimizedGroup[0].isToolChange = true;
                finalOps.push(...optimizedGroup);
            }
        }
    }

    return finalOps;
};

/**
 * Generates G-code from an Optimized Operation List.
 */
export const generateGCode = (
    sheet: NestResultSheet, 
    parts: Part[], 
    tools: Tool[], 
    ncFilename: string,
    machineSettings?: MachineSettings,
    optimizerSettings?: OptimizerSettings,
    clampPositions: number[] = [420, 1010, 1550],
    programNumber: number = 1000,
    preCalculatedOps?: PunchOp[]
): string => {
    // Defaults
    const limits = machineSettings || { xTravelMax: 2500, xTravelMin: 0, yTravelMax: 1250, yTravelMin: 0, clampProtectionZoneX: 100, clampProtectionZoneY: 50, deadZoneY: 40 };
    const SAFE_Y = limits.deadZoneY + 25;
    const dateStr = new Date().toLocaleDateString('en-US');

    // Use pre-calc ops or calculate new
    const ops = preCalculatedOps || calculateOptimizedPath(sheet, parts, tools, optimizerSettings);

    // Build Header
    let gcode = `%\nO${programNumber.toString().padStart(4, '0')}(${ncFilename})\n`;
    gcode += `(SHEET ${sheet.width}x${sheet.height} QTY=${sheet.quantity} ${dateStr})\n`;
    const clampStr = clampPositions.map((c, i) => `CLAMP ${i+1}=${c}`).join(' ');
    gcode += `(${clampStr})\n`;

    // Tool List
    gcode += `(*** TOOL LIST ***)\n`;
    const usedToolsMap = new Map<string, number>();
    ops.forEach(op => {
        if(op.toolT && !usedToolsMap.has(op.toolId)) usedToolsMap.set(op.toolId, op.toolT);
    });
    
    const toolsInHeader = Array.from(usedToolsMap.entries()).sort((a,b) => a[1] - b[1]);
    
    toolsInHeader.forEach(([tid, code]) => {
        const tool = tools.find(t => t.id === tid);
        const name = tool ? tool.name.toUpperCase() : tid;
        const ang = tool ? tool.defaultRotation : 0;
        gcode += `(T${code} ${name} @${ang})\n`;
    });
    gcode += `(*** START ***)\n`;
    
    gcode += `G90 G21\n`;
    gcode += `G159 X${sheet.width} Y${sheet.height} T${sheet.thickness} V1\n`;
    gcode += `N908 G189 A${clampPositions[0]||0} B${clampPositions[1]||0} C${clampPositions[2]||0}\n`;
    gcode += `G54 F90000\n`;

    let nLine = 1;
    let lastX = 0; 
    let lastY = sheet.height; 
    
    let lastC = -999; 
    const getOptimizedC = (target: number, tool: Tool): number => {
        const symmetry = tool.shape === 'circle' ? 360 : (tool.shape === 'square' ? 90 : (tool.shape === 'rectangle' || tool.shape === 'oblong' ? 180 : 0));
        if (lastC === -999) return target;
        if (symmetry === 0) return target;
        if (symmetry === 360) return lastC; 
        const diff = Math.abs(target - lastC);
        const modDiff = diff % symmetry;
        if (modDiff < 0.1 || Math.abs(modDiff - symmetry) < 0.1) return lastC;
        return target;
    };

    // Iterate Ops
    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const tool = tools.find(t => t.id === op.toolId);
        
        const isUnsafeMove = !isPathSafe(lastX, lastY, op.x, op.y, clampPositions, limits.clampProtectionZoneX, limits.deadZoneY);
        
        if (isUnsafeMove) {
            gcode += `(SAFETY MOVE)\n`;
            if (lastY < SAFE_Y) gcode += `G70 Y${SAFE_Y.toFixed(2)}\n`;
            gcode += `G70 X${op.x.toFixed(2)}\n`;
            gcode += `G70 Y${op.y.toFixed(2)}\n`;
        }

        let cStr = '';
        if (tool) {
            const optC = getOptimizedC(op.rotation, tool);
            if (Math.abs(optC - lastC) > 0.01) {
                cStr = ` C${optC.toFixed(2)}`;
                lastC = optC;
            }
        }

        if (op.isToolChange) {
            gcode += `N${nLine} G70 T${op.toolT} X${op.x.toFixed(2)} Y${op.y.toFixed(2)}${cStr}\n`;
        } else {
            gcode += `X${op.x.toFixed(2)} Y${op.y.toFixed(2)}${cStr}\n`;
        }

        lastX = op.x;
        lastY = op.y;
        nLine++;
    }

    gcode += `G156\nM30\n%\n`;
    return gcode;
};
