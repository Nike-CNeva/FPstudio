
import { PartGeometry, PlacedTool, Tool, AutoPunchSettings, TurretLayout, ToolShape, TeachCycle, Part, Point } from '../types';
import { isPointInsideContour, getGeometryFromEntities, getOuterLoopIndices, Segment, isToolGouging } from './geometry';
import { findTeachCycleMatches } from './teachLogic';
import { TOLERANCE, denormalizePoint, calculateScallopStep, getPointKey, getHitKey } from './punchingUtils';
import { getPreferredTools } from './punchingTools';
import { generateNibblePunches, generateDestructPunches, detectAndPunchShapes, detectLoopTools } from './punchingGenerators';

// Re-export generators for consumers (hooks)
export { generateNibblePunches, generateDestructPunches };

// --- HELPER: CHECK IF PUNCH IS ON SEGMENT ---
const isPunchOnSegment = (p: Omit<PlacedTool, 'id'>, seg: Segment, tools: Tool[]): boolean => {
    const tool = tools.find(t => t.id === p.toolId);
    
    // Determine a safe margin based on tool size.
    // Teach cycle punches might be offset from the line (e.g. nibbling with edge).
    // If tool is unknown, assume a generous default (e.g. 20mm).
    const maxDim = tool ? Math.max(tool.width, tool.height) : 20;
    
    // Margin = Half tool size + Tolerance. 
    // This defines a "corridor" around the segment. If punch center is in it, we consider it "on segment".
    const MARGIN = (maxDim / 2) + 2.0;

    // Quick BBox check with Margin
    const minX = Math.min(seg.p1.x, seg.p2.x) - MARGIN;
    const maxX = Math.max(seg.p1.x, seg.p2.x) + MARGIN;
    const minY = Math.min(seg.p1.y, seg.p2.y) - MARGIN;
    const maxY = Math.max(seg.p1.y, seg.p2.y) + MARGIN;
    
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;

    if (seg.type === 'line') {
        const l2 = (seg.p2.x - seg.p1.x)**2 + (seg.p2.y - seg.p1.y)**2;
        if (l2 === 0) return false;
        
        // Projection 't' of point P onto line segment AB
        const t = ((p.x - seg.p1.x) * (seg.p2.x - seg.p1.x) + (p.y - seg.p1.y) * (seg.p2.y - seg.p1.y)) / l2;
        
        // Check if strictly on segment (with slight tolerance for tool overhang at ends)
        if (t < -0.1 || t > 1.1) return false;
        
        // Coordinate of the projection point
        const projX = seg.p1.x + t * (seg.p2.x - seg.p1.x);
        const projY = seg.p1.y + t * (seg.p2.y - seg.p1.y);
        
        // Distance squared from punch center to the line
        const distSq = (p.x - projX)**2 + (p.y - projY)**2;
        
        return distSq < (MARGIN * MARGIN);
    } 
    else if (seg.type === 'arc' && seg.center && seg.radius) {
        const d = Math.sqrt((p.x - seg.center.x)**2 + (p.y - seg.center.y)**2);
        // Is distance from arc center within (Radius +/- Margin)?
        if (Math.abs(d - seg.radius) < MARGIN) {
            // Refined check: is the point actually within the arc's angular sweep?
            // For punch removal, we can be aggressive. BBox check above handles most outlier cases.
            return true;
        }
    }
    return false;
};

// --- SEGMENT HANDLERS ---

const processLineSegment = (
    seg: Segment, 
    geometry: PartGeometry,
    tools: Tool[], 
    settings: AutoPunchSettings,
    extension: { start: number, end: number },
    punches: Omit<PlacedTool, 'id'>[]
) => {
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    const candidates = getPreferredTools('line', len, 0, tools);
    if (candidates.length === 0) return;
    const tool = candidates[0];

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    let perpOffset = (tool.shape === ToolShape.Circle ? tool.width : tool.height) / 2;
    // Basic orientation logic for rectangular tools on angled lines
    if (tool.shape !== ToolShape.Circle) {
        // If we want tool along the line, rotation = angle. 
        // Then width is along line, height is perp.
        perpOffset = tool.height / 2;
    }

    const ux = dx/len; const uy = dy/len;
    const nx = -uy; const ny = ux;
    
    const midX = (seg.p1.x + seg.p2.x)/2;
    const midY = (seg.p1.y + seg.p2.y)/2;
    
    const testP = { x: midX + nx * perpOffset * 1.1, y: midY + ny * perpOffset * 1.1 };
    const rawTestP = denormalizePoint(testP, geometry.bbox);
    
    const isInside = isPointInsideContour(rawTestP, geometry);
    const sign = isInside ? -1 : 1;
    
    const segmentPunches = generateNibblePunches(
        seg.p1, 
        seg.p2, 
        tool, 
        {
            extensionStart: extension.start,
            extensionEnd: extension.end,
            minOverlap: settings.overlap,
            hitPointMode: 'offset',
            toolPosition: 'long'
        },
        angle,
        false,
        angle, 
        perpOffset * sign
    );

    // --- GOUGE CHECK AND CORRECTION ---
    // If any punch intersects neighboring segments, shift it along the line.
    
    const lineVector = { x: ux, y: uy };
    const SHIFT_STEP = 1.0; 
    const MAX_SHIFT = 20.0; // Limit shifting to avoid infinite loops or excessive moves

    // Sort punches by distance from start to handle ordered shifting
    const startPoint = seg.p1;
    segmentPunches.sort((a, b) => {
        const da = (a.x - startPoint.x)**2 + (a.y - startPoint.y)**2;
        const db = (b.x - startPoint.x)**2 + (b.y - startPoint.y)**2;
        return da - db;
    });

    const safePunches: typeof segmentPunches = [];

    segmentPunches.forEach((p, index) => {
        let currentX = p.x;
        let currentY = p.y;
        let shiftAccumulated = 0;
        let isGouging = isToolGouging(tool, currentX, currentY, p.rotation, geometry, geometry.bbox, seg);
        
        // 1. Try removing extension if gouging at ends
        if (isGouging) {
            let zeroExtX = currentX;
            let zeroExtY = currentY;
            let canTryZeroExt = false;

            // Check if this is a "Start" punch influenced by extension.start
            // Typically the first punch in the sorted list
            if (index === 0 && extension.start > 0) {
                // Determine direction: Extension moves OUT from P1. 
                // To remove it, we move IN towards P2 (along ux, uy).
                // generateNibblePunches logic: startX = p1.x - ux * extensionStart;
                // We want to simulate startX = p1.x (so add ux * extensionStart)
                zeroExtX += lineVector.x * extension.start;
                zeroExtY += lineVector.y * extension.start;
                canTryZeroExt = true;
            } 
            // Check if this is an "End" punch influenced by extension.end
            else if (index === segmentPunches.length - 1 && extension.end > 0) {
                // Extension moves OUT from P2. 
                // To remove it, we move IN towards P1 (negative ux, uy).
                zeroExtX -= lineVector.x * extension.end;
                zeroExtY -= lineVector.y * extension.end;
                canTryZeroExt = true;
            }

            if (canTryZeroExt) {
                // Check if the zero-extension position is safe
                const isZeroExtGouging = isToolGouging(tool, zeroExtX, zeroExtY, p.rotation, geometry, geometry.bbox, seg);
                if (!isZeroExtGouging) {
                    currentX = zeroExtX;
                    currentY = zeroExtY;
                    isGouging = false; // Fixed by removing extension
                }
            }
        }

        // 2. Determine shift direction if still gouging
        // Ideally, if it's closer to Start, shift towards End.
        // If closer to End, shift towards Start.
        const distFromStart = Math.sqrt((currentX - seg.p1.x)**2 + (currentY - seg.p1.y)**2);
        const shiftDir = distFromStart < (len / 2) ? 1 : -1; // 1 = Towards End, -1 = Towards Start

        // 3. Fallback Shift Loop
        while (isGouging && shiftAccumulated < MAX_SHIFT) {
            // Apply shift
            currentX += lineVector.x * SHIFT_STEP * shiftDir;
            currentY += lineVector.y * SHIFT_STEP * shiftDir;
            shiftAccumulated += SHIFT_STEP;
            
            isGouging = isToolGouging(tool, currentX, currentY, p.rotation, geometry, geometry.bbox, seg);
        }

        if (!isGouging) {
            safePunches.push({ ...p, x: currentX, y: currentY });
        }
    });

    punches.push(...safePunches);
};

const processArcSegment = (
    seg: Segment,
    geometry: PartGeometry,
    tools: Tool[],
    settings: AutoPunchSettings,
    jointVertices: Set<string>,
    punches: Omit<PlacedTool, 'id'>[],
    placedSingleHits: Set<string>
) => {
    const r = seg.radius || 0;
    const center = seg.center || {x:0,y:0};
    if (r <= 0) return;

    const diam = r * 2;
    const ang1 = Math.atan2(seg.p1.y - center.y, seg.p1.x - center.x);
    let ang2 = Math.atan2(seg.p2.y - center.y, seg.p2.x - center.x);
    
    let diff = ang2 - ang1;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    
    const midAng = ang1 + diff / 2;
    const probeR = r + 0.1;
    const probeX = center.x + probeR * Math.cos(midAng);
    const probeY = center.y + probeR * Math.sin(midAng);
    const rawProbe = denormalizePoint({x: probeX, y: probeY}, geometry.bbox);
    const isProbeInMaterial = isPointInsideContour(rawProbe, geometry);
    
    // 1. Single Hit Check
    const exactTools = getPreferredTools('circle', diam, 0, tools, settings.toleranceRound);
    if (exactTools.length > 0) {
        const bestTool = exactTools[0];
        if (Math.abs(bestTool.width - diam) <= settings.toleranceRound) {
            const k = getHitKey(center.x, center.y);
            if (!placedSingleHits.has(k)) {
                punches.push({
                    toolId: bestTool.id,
                    x: center.x,
                    y: center.y,
                    rotation: 0
                });
                placedSingleHits.add(k);
            }
            return; 
        }
    }

    // 2. Nibble Check
    let nibbleCandidates = tools.filter(t => t.shape === ToolShape.Circle);
    // If nibbling inside, tool must be smaller than radius
    if (isProbeInMaterial) {
        nibbleCandidates = nibbleCandidates.filter(t => (t.width / 2) < (r - 0.1));
    }
    nibbleCandidates.sort((a,b) => b.width - a.width);
    
    if (nibbleCandidates.length === 0) return; 
    
    const tool = nibbleCandidates[0];
    const punchRadius = isProbeInMaterial ? (r - tool.width/2) : (r + tool.width/2);
    
    if (punchRadius <= 0) return; 

    // Arc Joint Logic (Angular Retraction)
    let activeDiff = Math.abs(diff);
    let activeAng1 = ang1;
    const isClosedCircle = Math.abs(diff) > (2 * Math.PI - 0.01);
    
    if (!isClosedCircle) {
        let reduceStart = 0;
        let reduceEnd = 0;
        const marginDist = settings.vertexTolerance;
        const marginAngle = marginDist / r; 

        // Apply joint retraction if vertex is flagged
        reduceStart = jointVertices.has(getPointKey(seg.p1)) ? (settings.microJointLength / r) : marginAngle;
        reduceEnd = jointVertices.has(getPointKey(seg.p2)) ? (settings.microJointLength / r) : marginAngle;

        if (activeDiff <= (reduceStart + reduceEnd)) return; // Too short to punch
        
        const direction = diff > 0 ? 1 : -1;
        activeAng1 += direction * reduceStart;
        activeDiff -= (reduceStart + reduceEnd);
    }

    const stepLen = calculateScallopStep(tool.width/2, settings.scallopHeight);
    const angularStep = stepLen / punchRadius;
    
    const steps = Math.ceil(activeDiff / angularStep);
    const realStep = (diff > 0 ? activeDiff : -activeDiff) / steps;
    
    const adjustedSteps = isClosedCircle ? steps : steps;

    for(let i=0; i<=adjustedSteps; i++) {
        if (isClosedCircle && i === adjustedSteps) continue;
        const a = activeAng1 + i * realStep;
        
        let px = center.x + punchRadius * Math.cos(a);
        let py = center.y + punchRadius * Math.sin(a);
        
        // --- ARC GOUGE CHECK ---
        // Simplified shift: rotate angle slightly inwards if gouging
        let isGouging = isToolGouging(tool, px, py, 0, geometry, geometry.bbox, seg);
        
        if (isGouging) {
            // Try shifting angle slightly towards center of arc
            // Direction depends on 'i' (start vs end)
            const shiftDir = i < (adjustedSteps / 2) ? 1 : -1; // Towards middle
            const SHIFT_ANG = 0.05; // radians
            const MAX_SHIFTS = 10;
            
            let currentA = a;
            for(let s=0; s<MAX_SHIFTS; s++) {
                currentA += (diff > 0 ? SHIFT_ANG : -SHIFT_ANG) * shiftDir;
                const tx = center.x + punchRadius * Math.cos(currentA);
                const ty = center.y + punchRadius * Math.sin(currentA);
                if (!isToolGouging(tool, tx, ty, 0, geometry, geometry.bbox, seg)) {
                    px = tx; py = ty; isGouging = false;
                    break;
                }
            }
        }

        if (!isGouging) {
            punches.push({
                toolId: tool.id,
                x: px,
                y: py,
                rotation: 0
            });
        }
    }
};

// --- MAIN GENERATOR ---

export const generateContourPunches = (
    geometry: PartGeometry,
    tools: Tool[],
    settings: AutoPunchSettings,
    turretLayouts: TurretLayout[],
    teachCycles: TeachCycle[]
): Omit<PlacedTool, 'id'>[] => {
    // 1. Process Geometry
    const processed = getGeometryFromEntities({ geometry } as Part); 
    if (!processed) return [];

    const punches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    const placedSingleHits = new Set<string>();

    // 2. Build Topology Map (Vertex -> Segment Indices)
    // This is used for Micro-Joint strategy and conflict resolution
    const vertexMap = new Map<string, { point: Point, segmentIndices: number[] }>();
    processed.segments.forEach((seg, idx) => {
        [seg.p1, seg.p2].forEach(p => {
            const k = getPointKey(p);
            if (!vertexMap.has(k)) vertexMap.set(k, { point: p, segmentIndices: [] });
            vertexMap.get(k)!.segmentIndices.push(idx);
        });
    });

    // 3. Identify Outer Contour Indices
    const outerLoopIndices = getOuterLoopIndices(processed.segments);

    // 4. Topology-Aware Micro-Joints Classification
    const jointVertices = new Set<string>();
    const { minX, minY, maxX, maxY } = processed.bbox;

    if (settings.microJointsEnabled && outerLoopIndices.size > 0) {
        
        const isPointOnLimit = (p: Point, axis: 'x'|'y', val: number) => 
            Math.abs((axis === 'x' ? p.x : p.y) - val) < TOLERANCE.GEO;

        if (settings.microJointType === 'auto') {
            // AUTO STRATEGY: Prioritize stable corners (longer arms) near BB corners
            const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
            
            const cornerTargets = [
                { x: minX, y: maxY }, // TL
                { x: maxX, y: maxY }, // TR
                { x: maxX, y: minY }, // BR
                { x: minX, y: minY }  // BL
            ];

            const isPointOnAnyLimit = (p: Point) => 
                isPointOnLimit(p, 'x', minX) || isPointOnLimit(p, 'x', maxX) ||
                isPointOnLimit(p, 'y', minY) || isPointOnLimit(p, 'y', maxY);

            cornerTargets.forEach(target => {
                let bestScore = -Infinity;
                let bestKey = null;

                vertexMap.forEach((data, key) => {
                    const dist = Math.sqrt(distSq(data.point, target));
                    
                    // Priority 1: Check for Line segments (Nibbling requirement)
                    const hasLine = data.segmentIndices.some(i => processed.segments[i].type === 'line');
                    const typePenalty = hasLine ? 0 : 1000; // Large penalty if corner consists only of arcs

                    // Priority 2: Stability (Length of the shortest leg)
                    // Helper to get stability score
                    let minLen = Infinity;
                    data.segmentIndices.forEach(idx => {
                        const s = processed.segments[idx];
                        const len = Math.sqrt(distSq(s.p1, s.p2));
                        if (len < minLen) minLen = len;
                    });
                    const stability = minLen === Infinity ? 0 : minLen;

                    // Composite Score:
                    // Maximize Stability, Minimize Distance.
                    const onLimitBonus = isPointOnAnyLimit(data.point) ? 5.0 : 0;
                    const score = stability - (dist * 0.5) + onLimitBonus - typePenalty;

                    if (score > bestScore) {
                        bestScore = score;
                        bestKey = key;
                    }
                });

                if (bestKey) {
                    jointVertices.add(bestKey);
                }
            });

        } else if (settings.microJointType === 'vertical') {
            // VERTICAL STRATEGY
            const leftPoints: Point[] = [];
            const rightPoints: Point[] = [];

            outerLoopIndices.forEach(idx => {
                const s = processed.segments[idx];
                [s.p1, s.p2].forEach(p => {
                    if (isPointOnLimit(p, 'x', minX)) leftPoints.push(p);
                    if (isPointOnLimit(p, 'x', maxX)) rightPoints.push(p);
                });
            });

            const addExtremes = (points: Point[]) => {
                if (points.length === 0) return;
                let minYPoint = points[0];
                let maxYPoint = points[0];
                points.forEach(p => {
                    if (p.y < minYPoint.y) minYPoint = p;
                    if (p.y > maxYPoint.y) maxYPoint = p;
                });
                jointVertices.add(getPointKey(minYPoint));
                jointVertices.add(getPointKey(maxYPoint));
            };

            addExtremes(leftPoints);
            addExtremes(rightPoints);

        } else if (settings.microJointType === 'horizontal') {
            // HORIZONTAL STRATEGY
            const bottomPoints: Point[] = [];
            const topPoints: Point[] = [];

            outerLoopIndices.forEach(idx => {
                const s = processed.segments[idx];
                [s.p1, s.p2].forEach(p => {
                    if (isPointOnLimit(p, 'y', minY)) bottomPoints.push(p);
                    if (isPointOnLimit(p, 'y', maxY)) topPoints.push(p);
                });
            });

            const addExtremes = (points: Point[]) => {
                if (points.length === 0) return;
                let minXPoint = points[0];
                let maxXPoint = points[0];
                points.forEach(p => {
                    if (p.x < minXPoint.x) minXPoint = p;
                    if (p.x > maxXPoint.x) maxXPoint = p;
                });
                jointVertices.add(getPointKey(minXPoint));
                jointVertices.add(getPointKey(maxXPoint));
            };

            addExtremes(bottomPoints);
            addExtremes(topPoints);
        }
    }

    // 5. Teach Cycles
    if (settings.useTeachCycles && teachCycles && teachCycles.length > 0) {
        const matches = findTeachCycleMatches(processed, teachCycles);
        matches.matches.forEach(p => punches.push(p));
        matches.coveredSegmentIndices.forEach(i => coveredIndices.add(i));
    }

    // 5.5. OVERRIDE: Micro-Joint Priority (SMART CONFLICT RESOLUTION)
    // If we have Teach Cycle punches that conflict with Micro-Joint locations:
    // 1. Identify punches near micro-joints.
    // 2. If punch is part of a Nibble Group (lineId), remove entire group.
    // 3. If punch is single, remove closest punch.
    // 4. Force RE-PROCESSING of affected segments by removing them from coveredIndices.
    if (settings.microJointsEnabled && jointVertices.size > 0 && punches.length > 0) {
        
        const punchesToDelete = new Set<string>(); // Keep track by reference/ID not ideal as IDs are generated. Use object ref.
        const linesToDelete = new Set<string>();
        const segmentsToUncover = new Set<number>();

        // Pre-parse joint points for distance check
        const jointPoints = Array.from(jointVertices).map(k => {
            const [x, y] = k.split(',').map(parseFloat);
            return { x, y, key: k };
        });

        punches.forEach(p => {
            const tool = tools.find(t => t.id === p.toolId);
            // Default radius 5 if unknown
            const toolRadius = tool ? Math.max(tool.width, tool.height) / 2 : 5;
            
            // Safety margin: Joint Length + Tool Radius
            const safeDistance = settings.microJointLength + toolRadius;
            const safeDistSq = safeDistance * safeDistance;

            for (const jp of jointPoints) {
                const dSq = (p.x - jp.x)**2 + (p.y - jp.y)**2;
                if (dSq < safeDistSq) {
                    // Conflict detected!
                    
                    // Logic: Is it a group or single?
                    if (p.lineId) {
                        linesToDelete.add(p.lineId);
                    } else {
                        // Mark specific punch for deletion
                        // Since `punches` items don't have stable IDs yet (generateId called in loop usually),
                        // we can't rely on `p.id` if it was generated inside `findTeachCycleMatches` but not assigned uniquely?
                        // `findTeachCycleMatches` returns Omit<PlacedTool, 'id'>? No, wait. 
                        // It returns objects. We can use object reference if we filter carefully, 
                        // but adding a temp ID or using reference is better.
                        // Actually `punches` here is `Omit<PlacedTool, 'id'>[]`.
                        // We will use object reference in a Set.
                        // However, to simplify, let's just assume we can filter by reference.
                        // Or add a temp ID. 
                    }

                    // Mark segments connected to this vertex for Auto-Processing
                    const connectedSegs = vertexMap.get(jp.key)?.segmentIndices || [];
                    connectedSegs.forEach(idx => segmentsToUncover.add(idx));
                }
            }
        });

        // Second pass: Filter punches
        const keptPunches: typeof punches = [];
        
        // We need to re-run the distance check to filter specific single punches, 
        // OR rely on the set logic. 
        // Let's re-run distance check during filter for singles, and check lineID for groups.
        
        for (const p of punches) {
            // Check Group Removal
            if (p.lineId && linesToDelete.has(p.lineId)) {
                continue; // Skip (Remove)
            }

            // Check Single Removal
            let keepSingle = true;
            if (!p.lineId) {
                const tool = tools.find(t => t.id === p.toolId);
                const toolRadius = tool ? Math.max(tool.width, tool.height) / 2 : 5;
                const safeDistSq = (settings.microJointLength + toolRadius)**2;

                for (const jp of jointPoints) {
                    const dSq = (p.x - jp.x)**2 + (p.y - jp.y)**2;
                    if (dSq < safeDistSq) {
                        keepSingle = false;
                        break;
                    }
                }
            }

            if (keepSingle) {
                keptPunches.push(p);
            }
        }

        // Replace punch list
        punches.length = 0;
        punches.push(...keptPunches);

        // Uncover segments
        // If we removed tools from a segment, we MUST allow the auto-puncher (Step 8) to see it.
        segmentsToUncover.forEach(idx => {
            coveredIndices.delete(idx);
        });
    }

    // 6. Filter Tools
    let availableTools = tools;
    if (settings.toolSourceType === 'turret' && settings.turretLayoutId) {
        const layout = turretLayouts.find(l => l.id === settings.turretLayoutId);
        if (layout) {
            availableTools = layout.toolsSnapshot.filter(t => !!t.stationNumber);
        }
    }

    // 7. Detect Shapes & Loops
    const shapePunches = detectAndPunchShapes(geometry, processed, availableTools, settings, coveredIndices);
    punches.push(...shapePunches);
    const loopPunches = detectLoopTools(processed, availableTools, settings, coveredIndices);
    punches.push(...loopPunches);

    // 8. Process Remaining Segments
    for (let idx = 0; idx < processed.segments.length; idx++) {
        if (coveredIndices.has(idx)) continue;
        const seg = processed.segments[idx];

        // --- Joint Logic Application ---
        let extStart = settings.extension;
        let extEnd = settings.extension;

        if (outerLoopIndices.has(idx)) {
            // Apply micro-joints if the segment vertices are flagged in jointVertices
            if (jointVertices.has(getPointKey(seg.p1))) extStart = -settings.microJointLength;
            if (jointVertices.has(getPointKey(seg.p2))) extEnd = -settings.microJointLength;
        }

        if (seg.type === 'line') {
            processLineSegment(seg, geometry, availableTools, settings, { start: extStart, end: extEnd }, punches);
        } else if (seg.type === 'arc') {
            processArcSegment(seg, geometry, availableTools, settings, jointVertices, punches, placedSingleHits);
        }
    }

    return punches;
};
