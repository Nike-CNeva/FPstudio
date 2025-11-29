import { NestResultSheet, Part, Tool, MachineSettings, OptimizerSettings, ToolShape, PunchType } from '../types';

interface PunchOp {
    type?: 'single';
    toolT: number;
    toolId: string;
    x: number;
    y: number;
    rotation: number; 
    isToolChange?: boolean;
}

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

/**
 * Checks if a line segment (p1 -> p2) intersects with a protected clamp zone.
 * Clamps are located at Y=0 (bottom of sheet) with defined protection zones.
 * Coordinate System: Y-Up (0 is Bottom).
 */
const isPathSafe = (
    x1: number, y1: number, 
    x2: number, y2: number, 
    clamps: number[], 
    zoneX: number, 
    deadZoneY: number
): boolean => {
    // 1. If both points are safely above the dead zone, any straight move is safe
    // Dead Zone is from Y=0 to Y=deadZoneY.
    if (y1 > deadZoneY && y2 > deadZoneY) return true;

    // 2. If we are moving within the danger zone Y (y < deadZoneY), check X intersections
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    for (const clampX of clamps) {
        const clampMin = clampX - zoneX;
        const clampMax = clampX + zoneX;

        // Check if the X-range of movement overlaps with the Clamp X-range
        const xOverlap = Math.max(0, Math.min(maxX, clampMax) - Math.max(minX, clampMin));
        
        if (xOverlap > 0) {
            // We are crossing a clamp zone horizontally. 
            // Since we established at least one point is low (<= deadZoneY), 
            // this implies a collision with the clamp structure.
            return false;
        }
    }

    return true;
};

/**
 * Generates G-code for a Finn-Power machine.
 */
export const generateGCode = (
    sheet: NestResultSheet, 
    parts: Part[], 
    tools: Tool[],
    nestName: string,
    machineSettings?: MachineSettings,
    optimizerSettings?: OptimizerSettings,
    clampPositions: number[] = [420, 1010, 1550],
    programNumber: number = 1000 // Default if not provided
): string => {
    // Defaults
    const limits = machineSettings || { xTravelMax: 2500, xTravelMin: 0, yTravelMax: 1250, yTravelMin: 0, clampProtectionZoneX: 100, clampProtectionZoneY: 50, deadZoneY: 40 };
    const optimize = optimizerSettings || { 
        toolSequence: 'station-order', 
        pathOptimization: 'shortest-path', 
        sheetUnloadMode: 'manual', 
        enableCommonLineCuts: false, 
        prioritizeContourTools: false, 
        startCorner: 'bottom-right',
        useG76LinearPatterns: false 
    };

    const SAFE_Y = limits.deadZoneY + 25; // Height to traverse over clamps

    const dateStr = new Date().toLocaleDateString('en-US');
    // programNumber is now passed in (equals Sheet Number)
    
    // --- 1. DATA PREPARATION ---

    const usedToolIds = new Set<string>();
    const toolObjects = new Map<string, Tool>();

    sheet.placedParts.forEach(pp => {
        const part = parts.find(p => p.id === pp.partId);
        part?.punches.forEach(punch => {
            usedToolIds.add(punch.toolId);
            const tool = tools.find(t => t.id === punch.toolId);
            if (tool) toolObjects.set(punch.toolId, tool);
        });
    });

    // Sort Tools by Type then Station
    const sortedToolIds = Array.from(usedToolIds).sort((a, b) => {
        const tA = toolObjects.get(a);
        const tB = toolObjects.get(b);
        if (!tA || !tB) return 0;
        
        // 1. Priority by Punch Type
        const pA = PUNCH_TYPE_PRIORITY[tA.punchType] || 99;
        const pB = PUNCH_TYPE_PRIORITY[tB.punchType] || 99;
        
        if (pA !== pB) return pA - pB;

        // 2. Secondary Sort by User Preference
        if (optimize.toolSequence === 'station-order') {
            return (tA.stationNumber || 999) - (tB.stationNumber || 999);
        }
        if (optimize.toolSequence === 'tool-size-desc') {
            return (tB.width * tB.height) - (tA.width * tA.height);
        }
        return (tA.stationNumber || 999) - (tB.stationNumber || 999);
    });

    // Assign Station Numbers
    const usedStations: { station: number, tool: Tool }[] = [];
    let autoStationIndex = 1;

    sortedToolIds.forEach(id => {
        const tool = toolObjects.get(id);
        if (tool) {
            let station = tool.stationNumber;
            if (!station || station === 0) {
                while (usedStations.find(s => s.station === autoStationIndex)) autoStationIndex++;
                station = autoStationIndex;
            }
            usedStations.push({ station, tool });
        }
    });
    
    // --- 2. HEADER ---
    let gcode = `%\n`;
    gcode += `O${programNumber.toString().padStart(4, '0')}(${nestName.toUpperCase()})\n`;
    gcode += `(SHEET_LAYOUT ${sheet.width}x${sheet.height}_QTY=${sheet.quantity})\n`;
    gcode += `(DATE ${dateStr})\n`;
    gcode += `(PLATE ${sheet.stockSheetId.substr(0,8)})\n`;
    gcode += `(INSERT SHEET-${sheet.material} ${sheet.thickness}X${sheet.width}X${sheet.height})\n`;
    
    // Format Clamps
    const clampStr = clampPositions.map((c, i) => `CLAMP ${i+1}=${c}`).join(' ');
    gcode += `(${clampStr} PIN=1)\n`;

    // Tool List Table
    gcode += `(*** IN STATION ORDER TOOL LIST ***)\n`;
    const toolsForTable = [...usedStations].sort((a,b) => a.station - b.station);
    toolsForTable.forEach(({ station, tool }) => {
        let shapeStr = tool.name;
        // Simplify name for readability if it's a generated ID
        if (tool.name.startsWith('New Tool')) {
             if (tool.shape === 'circle') shapeStr = `RND_${tool.width}`;
             else if (tool.shape === 'rectangle') shapeStr = `RECT_${tool.width}X${tool.height}`;
             else shapeStr = tool.shape.toUpperCase();
        }
        
        // Correct T-code display for header
        let finalToolCode = station;
        if (tool.mtIndex && tool.mtIndex > 0) {
            finalToolCode = 20 + tool.mtIndex;
        }
        let stStr = finalToolCode.toString().padStart(3, '0');

        const angle = tool.defaultRotation || 0;
        gcode += `(ST_${stStr},  ${shapeStr.toUpperCase()} @${angle})\n`;
    });
    gcode += `(*** END OF LIST ***)\n`;

    gcode += `G90\n`;
    gcode += `G21\n`;
    gcode += `G159 X${sheet.width} Y${sheet.height} T${sheet.thickness || 1.0} V1\n`;
    gcode += `G174 A11 X${sheet.width} Y${sheet.height} S5 C0 W${sheet.width}\n`;
    gcode += `N908\n`;
    gcode += `G189 A${clampPositions[0] || 0} B${clampPositions[1] || 0} C${clampPositions[2] || 0}\n`;
    gcode += `G151 A99\n`;
    gcode += `G152 R100\n`;
    gcode += `G54 F90000 S68\n`;

    // --- 3. BODY ---

    let nLine = 1;
    let lastX = 2000; // Park position assumption or previous tool pos
    let lastY = 1000;
    
    // Iterate in the execution order (sorted by type)
    for (const toolId of sortedToolIds) {
        const stationEntry = usedStations.find(s => s.tool.id === toolId);
        if (!stationEntry) continue;
        
        const { station, tool } = stationEntry;
        
        // DETERMINE T-CODE NUMBER
        // Rule: If MT (mtIndex > 0), T = 20 + Index. 
        // e.g. Slot 1 -> T21. Slot 24 -> T44.
        let finalToolCode = station;
        if (tool.mtIndex && tool.mtIndex > 0) {
            finalToolCode = 20 + tool.mtIndex;
        }

        // Collect hits
        const toolOps: PunchOp[] = [];

        sheet.placedParts.forEach(placedPart => {
            const part = parts.find(p => p.id === placedPart.partId);
            if (!part) return;

            const rad = (placedPart.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            part.punches.forEach(punch => {
                if (punch.toolId !== toolId) return;

                const rx = punch.x * cos - punch.y * sin;
                const ry = punch.x * sin + punch.y * cos;
                
                const punchX = placedPart.x + rx;
                const punchY = placedPart.y + ry;
                
                let punchRot = (punch.rotation + placedPart.rotation) % 360;
                if (punchRot < 0) punchRot += 360;

                toolOps.push({
                    toolT: finalToolCode,
                    toolId: toolId,
                    x: punchX,
                    y: punchY,
                    rotation: punchRot
                });
            });
        });

        if (toolOps.length === 0) continue;

        // Path Optimization (Simple Nearest Neighbor)
        const optimizedOps: PunchOp[] = [];
        let currentX = lastX; 
        let currentY = lastY;
        
        const remaining = [...toolOps];
        
        while (remaining.length > 0) {
            let nearestIdx = -1;
            let minDistSq = Infinity;

            for(let i=0; i<remaining.length; i++) {
                const d2 = (remaining[i].x - currentX)**2 + (remaining[i].y - currentY)**2;
                if (d2 < minDistSq) {
                    minDistSq = d2;
                    nearestIdx = i;
                }
            }
            
            const next = remaining[nearestIdx];
            optimizedOps.push(next);
            currentX = next.x;
            currentY = next.y;
            remaining.splice(nearestIdx, 1);
        }

        // --- G76 PATTERN RECOGNITION ---
        const finalCommands: (PunchOp | G76Pattern)[] = [];
        
        if (optimize.useG76LinearPatterns) {
            let i = 0;
            while (i < optimizedOps.length) {
                const p1 = optimizedOps[i];
                let patternFound = false;

                if (i + 2 < optimizedOps.length) {
                    const p2 = optimizedOps[i+1];
                    
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI; 
                    
                    const TOL_DIST = 0.1; 
                    const TOL_ANG = 0.5;

                    let k = 2;
                    while (i + k < optimizedOps.length) {
                        const prev = optimizedOps[i + k - 1];
                        const curr = optimizedOps[i + k];
                        
                        const dNext = Math.sqrt((curr.x - prev.x)**2 + (curr.y - prev.y)**2);
                        const angNext = Math.atan2(curr.y - prev.y, curr.x - prev.x) * 180 / Math.PI;
                        
                        let angDiff = Math.abs(angNext - angle);
                        if (angDiff > 180) angDiff = 360 - angDiff;
                        
                        if (Math.abs(dNext - dist) < TOL_DIST && angDiff < TOL_ANG && 
                            Math.abs(curr.rotation - p1.rotation) < TOL_ANG) {
                            k++;
                        } else {
                            break;
                        }
                    }

                    if (k >= 3) {
                        finalCommands.push({
                            type: 'G76',
                            start: p1,
                            dist: dist,
                            angle: angle,
                            count: k,
                            toolAngle: p1.rotation
                        });
                        i += k;
                        patternFound = true;
                    }
                }

                if (!patternFound) {
                    finalCommands.push(p1);
                    i++;
                }
            }
        } else {
            optimizedOps.forEach(op => finalCommands.push(op));
        }

        // --- EMIT CODE FOR TOOL ---
        
        const startCmd = finalCommands[0];
        const startOp = startCmd.type === 'G76' ? (startCmd as G76Pattern).start : (startCmd as PunchOp);
        
        // Tool Change
        gcode += `N${nLine} G70 T${finalToolCode} X${startOp.x.toFixed(2)} Y${startOp.y.toFixed(2)}\n`;
        
        // Update Last Pos immediately after tool change move
        lastX = startOp.x;
        lastY = startOp.y;

        if (tool.punchType === PunchType.Finishing) {
            gcode += `F30000\n`;
        }

        // Rotation Optimization State for this tool
        let lastC = -999; 
        const symmetry = tool.shape === 'circle' ? 360 : 
                         (tool.shape === 'square' ? 90 : 
                         (tool.shape === 'rectangle' || tool.shape === 'oblong' ? 180 : 0));

        const getOptimizedC = (target: number): number => {
            if (lastC === -999) return target;
            if (symmetry === 0) return target;
            if (symmetry === 360) return lastC; 
            
            const diff = Math.abs(target - lastC);
            const modDiff = diff % symmetry;
            
            if (modDiff < 0.1 || Math.abs(modDiff - symmetry) < 0.1) {
                return lastC;
            }
            return target;
        };

        // Iterate Commands
        finalCommands.forEach((cmd, idx) => {
            if (cmd.type === 'G76') {
                const pat = cmd as G76Pattern;
                
                // Move to start with Safety Check
                if (Math.abs(lastX - pat.start.x) > 0.01 || Math.abs(lastY - pat.start.y) > 0.01) {
                    if (!isPathSafe(lastX, lastY, pat.start.x, pat.start.y, clampPositions, limits.clampProtectionZoneX, limits.deadZoneY)) {
                        gcode += `(NO_HIT_MOTION)\n`;
                        gcode += `G70 X${lastX.toFixed(2)} Y${SAFE_Y.toFixed(2)}\n`; // Move Y away
                        gcode += `(NO_HIT_MOTION)\n`;
                        gcode += `G70 X${pat.start.x.toFixed(2)} Y${SAFE_Y.toFixed(2)}\n`; // Traverse X
                    }
                    // Final approach to start point
                    gcode += `G70 X${pat.start.x.toFixed(2)} Y${pat.start.y.toFixed(2)}\n`;
                }

                // Prepare C
                const optC = getOptimizedC(pat.toolAngle);
                let cStr = '';
                if (Math.abs(optC - lastC) > 0.01) {
                    cStr = ` C${optC.toFixed(2)}`;
                    lastC = optC;
                }

                let patAng = pat.angle; 
                if (patAng < 0) patAng += 360;

                gcode += `G76 I${pat.dist.toFixed(2)} J${patAng.toFixed(2)} K${pat.count}${cStr}\n`;
                
                // Update last pos to end of pattern
                const rad = pat.angle * Math.PI / 180;
                lastX = pat.start.x + (pat.count - 1) * pat.dist * Math.cos(rad);
                lastY = pat.start.y + (pat.count - 1) * pat.dist * Math.sin(rad);

            } else {
                const op = cmd as PunchOp;
                
                // Safety Check for Move
                const distSq = (op.x - lastX)**2 + (op.y - lastY)**2;
                
                if (distSq > 100 || lastY < limits.deadZoneY || op.y < limits.deadZoneY) {
                    if (!isPathSafe(lastX, lastY, op.x, op.y, clampPositions, limits.clampProtectionZoneX, limits.deadZoneY)) {
                        gcode += `(NO_HIT_MOTION)\n`;
                        // 1. Move Y Up safe
                        gcode += `G70 X${lastX.toFixed(2)} Y${SAFE_Y.toFixed(2)}\n`;
                        // 2. Move X Across
                        gcode += `(NO_HIT_MOTION)\n`;
                        gcode += `G70 X${op.x.toFixed(2)} Y${SAFE_Y.toFixed(2)}\n`;
                    }
                }

                // Prepare C
                const optC = getOptimizedC(op.rotation);
                let cStr = '';
                if (Math.abs(optC - lastC) > 0.01) {
                    cStr = ` C${optC.toFixed(2)}`;
                    lastC = optC;
                }

                gcode += `X${op.x.toFixed(2)} Y${op.y.toFixed(2)}${cStr}\n`;
                lastX = op.x;
                lastY = op.y;
            }
        });

        if (tool.punchType === PunchType.Finishing) {
            gcode += `F90000\n`;
        }

        nLine++;
    }

    // --- 4. FOOTER ---
    gcode += `G156\n`;
    gcode += `M31\n`;
    gcode += `M11\n`;
    gcode += `M30\n`;
    gcode += `%\n`;

    return gcode;
};