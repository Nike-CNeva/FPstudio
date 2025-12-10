
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

// --- HELPER: VECTOR CALCULATION FOR VERTEX ANGLE ---
const getVectorFromVertex = (seg: Segment, v: Point): {x:number, y:number} => {
    // Basic chord vector
    const other = (Math.abs(seg.p1.x - v.x) < 0.001 && Math.abs(seg.p1.y - v.y) < 0.001) ? seg.p2 : seg.p1;
    let vec = { x: other.x - v.x, y: other.y - v.y };
    
    // Refine for Arc
    if (seg.type === 'arc' && seg.center) {
        // We want the tangent vector at v.
        // Normal N = v - center
        const nx = v.x - seg.center.x;
        const ny = v.y - seg.center.y;
        // Tangent candidates: T1(-ny, nx), T2(ny, -nx)
        const t1 = { x: -ny, y: nx };
        // const t2 = { x: ny, y: -nx };
        
        // Pick the one that aligns somewhat with the chord vector (points towards other end)
        // Dot product with chord should be positive
        const dot1 = t1.x * vec.x + t1.y * vec.y;
        if (dot1 > 0) return t1;
        return { x: ny, y: -nx };
    }
    
    return vec;
};

// --- SEGMENT HANDLERS ---

const processLineSegment = (
    seg: Segment, 
    geometry: PartGeometry,
    tools: Tool[], 
    settings: AutoPunchSettings,
    punches: Omit<PlacedTool, 'id'>[],
    allSegments: Segment[],
    neighbors: { start: Segment | undefined, end: Segment | undefined },
    jointVertices: Set<string>
) => {
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    // --- SMART EXTENSION & TOLERANCE LOGIC ---
    // Calculate required range BEFORE tool selection
    const { bbox } = geometry;

    const isExtreme = (p: Point): boolean => {
        return Math.abs(p.x - bbox.minX) < TOLERANCE.GEO ||
               Math.abs(p.x - bbox.maxX) < TOLERANCE.GEO ||
               Math.abs(p.y - bbox.minY) < TOLERANCE.GEO ||
               Math.abs(p.y - bbox.maxY) < TOLERANCE.GEO;
    };

    const getExtRange = (vertex: Point, dir: {x: number, y: number}, neighbor: Segment | undefined): { min: number, max: number } => {
        // Priority 1: Micro-Joints
        if (jointVertices.has(getPointKey(vertex))) {
            const val = -settings.microJointLength;
            return { min: val, max: val };
        }

        const extreme = isExtreme(vertex);

        // Priority 2: Neighbor is Arc -> Fixed Extension
        if (neighbor && neighbor.type === 'arc') {
            return { min: settings.extension, max: settings.extension };
        }

        // Priority 3: Internal Corner
        const PROBE_DIST = 0.1;
        const probe = { x: vertex.x + dir.x * PROBE_DIST, y: vertex.y + dir.y * PROBE_DIST };
        const isInternal = isPointInsideContour(probe, geometry);

        if (isInternal) {
            return { min: 0, max: 0 };
        } 
        
        // Priority 4: External Corner
        if (extreme) {
            return { min: settings.extension, max: settings.extension };
        } else {
            // Cutout inside sheet -> Allow huge range up to Vertex Tolerance
            const tolerance = Math.max(settings.extension, settings.vertexTolerance);
            return { min: settings.extension, max: tolerance };
        }
    };

    const ux = dx/len; const uy = dy/len;
    const startRange = getExtRange(seg.p1, { x: -ux, y: -uy }, neighbors.start);
    const endRange = getExtRange(seg.p2, { x: ux, y: uy }, neighbors.end);

    const minReqLen = len + startRange.min + endRange.min;
    const maxAllowedLen = len + startRange.max + endRange.max;

    // --- TOOL SELECTION STRATEGY ---
    // 1. First, explicitly check if ANY tool fits as a "Single Hit".
    //    We prioritize this over "best fit for nibbling".
    
    let tool: Tool | undefined;
    let isSingleHit = false;
    
    // Filter candidates that physically fit the single hit slot
    const singleHitCandidates = tools.filter(t => {
        // Only consider straight-edge tools
        if (![ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape)) return false;
        
        // Check primary dimension (Width)
        // Note: We assume standard 0-rotation alignment for simplicity in auto-tooling lines.
        // A smarter check would allow 90-degree rotation if height matches, but keeping it consistent with nibble logic.
        const size = t.width; 
        
        // Allow tiny float margin
        return size >= (minReqLen - 0.01) && size <= (maxAllowedLen + 0.01);
    });

    if (singleHitCandidates.length > 0) {
        // Sort candidates:
        // 1. Shape Priority (Rect > Square > Oblong)
        // 2. Size (Smallest adequate size is better to minimize waste/overlap, 
        //    even though tolerance allows bigger)
        singleHitCandidates.sort((a, b) => {
            const getScore = (t: Tool) => {
                let s = 0;
                if (t.shape === ToolShape.Rectangle) s = 10;
                else if (t.shape === ToolShape.Square) s = 5;
                else if (t.shape === ToolShape.Oblong) s = 0;
                return s;
            };
            const sA = getScore(a);
            const sB = getScore(b);
            if (sA !== sB) return sB - sA; // Higher score first
            return a.width - b.width; // Smaller width first (closer to minReq)
        });

        tool = singleHitCandidates[0];
        isSingleHit = true;
    } else {
        // Fallback: Use standard nibbling selection (closest to line length)
        const candidates = getPreferredTools('line', len, 0, tools);
        if (candidates.length > 0) {
            tool = candidates[0];
            isSingleHit = false;
        }
    }

    if (!tool) return;

    // --- CALCULATE PLACEMENT ---
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const nx = -uy; const ny = ux;

    let perpOffset = (tool.shape === ToolShape.Circle ? tool.width : tool.height) / 2;
    if (tool.shape !== ToolShape.Circle) {
        perpOffset = tool.height / 2;
    }
    
    // Check material side
    const midX = (seg.p1.x + seg.p2.x)/2;
    const midY = (seg.p1.y + seg.p2.y)/2;
    const testP = { x: midX + nx * perpOffset * 1.1, y: midY + ny * perpOffset * 1.1 };
    const isInside = isPointInsideContour(testP, geometry);
    const sign = isInside ? -1 : 1;

    let activeStartExt = startRange.min;
    let activeEndExt = endRange.min;

    if (isSingleHit) {
        // Calculate centered extension for single hit
        const toolLength = tool.width;
        
        // We need:
        // startRange.min <= extStart <= startRange.max
        // endRange.min <= extEnd <= endRange.max
        // extStart + extEnd + len = toolLength  => extEnd = toolLength - len - extStart
        
        // Constraint intersection:
        const validMin = Math.max(startRange.min, toolLength - len - endRange.max);
        const validMax = Math.min(startRange.max, toolLength - len - endRange.min);
        
        // Prefer standard extension if valid, else mid-point, else min
        if (settings.extension >= validMin && settings.extension <= validMax) {
            activeStartExt = settings.extension;
        } else {
            activeStartExt = validMin;
        }
        activeEndExt = toolLength - len - activeStartExt;
    }

    const segmentPunches = generateNibblePunches(
        seg.p1, 
        seg.p2, 
        tool, 
        {
            extensionStart: activeStartExt,
            extensionEnd: activeEndExt,
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
    
    const lineVector = { x: ux, y: uy };
    const SHIFT_STEP = 1.0; 
    const MAX_SHIFT = 20.0; 

    const safePunches: typeof segmentPunches = [];

    segmentPunches.forEach((p, index) => {
        let currentX = p.x;
        let currentY = p.y;
        let shiftAccumulated = 0;
        let isGouging = isToolGouging(tool!, currentX, currentY, p.rotation, geometry, geometry.bbox, seg, allSegments);
        
        // 1. Try removing extension if gouging at ends
        if (isGouging) {
            let zeroExtX = currentX;
            let zeroExtY = currentY;
            let canTryZeroExt = false;

            if (index === 0 && activeStartExt > 0) {
                zeroExtX += lineVector.x * activeStartExt;
                zeroExtY += lineVector.y * activeStartExt;
                canTryZeroExt = true;
            } 
            else if (index === segmentPunches.length - 1 && activeEndExt > 0) {
                zeroExtX -= lineVector.x * activeEndExt;
                zeroExtY -= lineVector.y * activeEndExt;
                canTryZeroExt = true;
            }

            if (canTryZeroExt) {
                const isZeroExtGouging = isToolGouging(tool!, zeroExtX, zeroExtY, p.rotation, geometry, geometry.bbox, seg, allSegments);
                if (!isZeroExtGouging) {
                    currentX = zeroExtX;
                    currentY = zeroExtY;
                    isGouging = false;
                }
            }
        }

        // 2. Fallback Shift Loop
        if (isGouging) {
            const distFromStart = Math.sqrt((currentX - seg.p1.x)**2 + (currentY - seg.p1.y)**2);
            const shiftDir = distFromStart < (len / 2) ? 1 : -1; 

            while (isGouging && shiftAccumulated < MAX_SHIFT) {
                currentX += lineVector.x * SHIFT_STEP * shiftDir;
                currentY += lineVector.y * SHIFT_STEP * shiftDir;
                shiftAccumulated += SHIFT_STEP;
                
                isGouging = isToolGouging(tool!, currentX, currentY, p.rotation, geometry, geometry.bbox, seg, allSegments);
            }
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
    placedSingleHits: Set<string>,
    allSegments: Segment[]
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
        let isGouging = isToolGouging(tool, px, py, 0, geometry, geometry.bbox, seg, allSegments);
        
        if (isGouging) {
            const shiftDir = i < (adjustedSteps / 2) ? 1 : -1; // Towards middle
            const SHIFT_ANG = 0.05; // radians
            const MAX_SHIFTS = 10;
            
            let currentA = a;
            for(let s=0; s<MAX_SHIFTS; s++) {
                currentA += (diff > 0 ? SHIFT_ANG : -SHIFT_ANG) * shiftDir;
                const tx = center.x + punchRadius * Math.cos(currentA);
                const ty = center.y + punchRadius * Math.sin(currentA);
                if (!isToolGouging(tool, tx, ty, 0, geometry, geometry.bbox, seg, allSegments)) {
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

    // 4. Micro-Joints Classification (Topology-Aware)
    const jointVertices = new Set<string>();
    const { minX, minY, maxX, maxY } = processed.bbox;

    if (settings.microJointsEnabled && outerLoopIndices.size > 0) {
        
        const isPointOnLimit = (p: Point, axis: 'x'|'y', val: number) => 
            Math.abs((axis === 'x' ? p.x : p.y) - val) < TOLERANCE.GEO;

        if (settings.microJointType === 'auto') {
            const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
            const cornerTargets = [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: minY }, { x: minX, y: minY }];
            const isPointOnAnyLimit = (p: Point) => isPointOnLimit(p, 'x', minX) || isPointOnLimit(p, 'x', maxX) || isPointOnLimit(p, 'y', minY) || isPointOnLimit(p, 'y', maxY);

            cornerTargets.forEach(target => {
                let bestScore = -Infinity;
                let bestKey = null;

                vertexMap.forEach((data, key) => {
                    const dist = Math.sqrt(distSq(data.point, target));
                    const hasLine = data.segmentIndices.some(i => processed.segments[i].type === 'line');
                    const typePenalty = hasLine ? 0 : 1000; 
                    let minLen = Infinity;
                    
                    data.segmentIndices.forEach(idx => {
                        const s = processed.segments[idx];
                        const len = Math.sqrt(distSq(s.p1, s.p2));
                        if (len < minLen) minLen = len;
                    });
                    
                    // --- 90 Degree Priority Check ---
                    let angleBonus = 0;
                    if (data.segmentIndices.length === 2) {
                        const s1 = processed.segments[data.segmentIndices[0]];
                        const s2 = processed.segments[data.segmentIndices[1]];
                        const v1 = getVectorFromVertex(s1, data.point);
                        const v2 = getVectorFromVertex(s2, data.point);
                        const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y);
                        const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y);
                        
                        if (mag1 > 0 && mag2 > 0) {
                            const dot = v1.x * v2.x + v1.y * v2.y;
                            const angRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
                            const angDeg = angRad * 180 / Math.PI;
                            // Check for 90 degrees with tolerance
                            if (Math.abs(angDeg - 90) < 5.0) {
                                angleBonus = 1000; // Huge bonus to override distance
                            }
                        }
                    }

                    const stability = minLen === Infinity ? 0 : minLen;
                    const onLimitBonus = isPointOnAnyLimit(data.point) ? 5.0 : 0;
                    
                    const score = stability - (dist * 0.5) + onLimitBonus - typePenalty + angleBonus;

                    if (score > bestScore) { bestScore = score; bestKey = key; }
                });
                if (bestKey) jointVertices.add(bestKey);
            });

        } else if (settings.microJointType === 'vertical') {
            const leftPoints: Point[] = []; const rightPoints: Point[] = [];
            outerLoopIndices.forEach(idx => {
                const s = processed.segments[idx];
                [s.p1, s.p2].forEach(p => {
                    if (isPointOnLimit(p, 'x', minX)) leftPoints.push(p);
                    if (isPointOnLimit(p, 'x', maxX)) rightPoints.push(p);
                });
            });
            const addExtremes = (points: Point[]) => {
                if (points.length === 0) return;
                let minYPoint = points[0]; let maxYPoint = points[0];
                points.forEach(p => { if (p.y < minYPoint.y) minYPoint = p; if (p.y > maxYPoint.y) maxYPoint = p; });
                jointVertices.add(getPointKey(minYPoint)); jointVertices.add(getPointKey(maxYPoint));
            };
            addExtremes(leftPoints); addExtremes(rightPoints);

        } else if (settings.microJointType === 'horizontal') {
            const bottomPoints: Point[] = []; const topPoints: Point[] = [];
            outerLoopIndices.forEach(idx => {
                const s = processed.segments[idx];
                [s.p1, s.p2].forEach(p => {
                    if (isPointOnLimit(p, 'y', minY)) bottomPoints.push(p);
                    if (isPointOnLimit(p, 'y', maxY)) topPoints.push(p);
                });
            });
            const addExtremes = (points: Point[]) => {
                if (points.length === 0) return;
                let minXPoint = points[0]; let maxXPoint = points[0];
                points.forEach(p => { if (p.x < minXPoint.x) minXPoint = p; if (p.x > maxXPoint.x) maxXPoint = p; });
                jointVertices.add(getPointKey(minXPoint)); jointVertices.add(getPointKey(maxXPoint));
            };
            addExtremes(bottomPoints); addExtremes(topPoints);
        }
    }

    // 5. Teach Cycles
    if (settings.useTeachCycles && teachCycles && teachCycles.length > 0) {
        const matches = findTeachCycleMatches(processed, teachCycles);
        matches.matches.forEach(p => punches.push(p));
        matches.coveredSegmentIndices.forEach(i => coveredIndices.add(i));
    }

    // 5.5. OVERRIDE: Micro-Joint Priority
    if (settings.microJointsEnabled && jointVertices.size > 0 && punches.length > 0) {
        const linesToDelete = new Set<string>();
        const segmentsToUncover = new Set<number>();
        const jointPoints = Array.from(jointVertices).map(k => {
            const [x, y] = k.split(',').map(parseFloat);
            return { x, y, key: k };
        });

        punches.forEach(p => {
            const tool = tools.find(t => t.id === p.toolId);
            const toolRadius = tool ? Math.max(tool.width, tool.height) / 2 : 5;
            const safeDistance = settings.microJointLength + toolRadius;
            const safeDistSq = safeDistance * safeDistance;

            for (const jp of jointPoints) {
                const dSq = (p.x - jp.x)**2 + (p.y - jp.y)**2;
                if (dSq < safeDistSq) {
                    if (p.lineId) linesToDelete.add(p.lineId);
                    const connectedSegs = vertexMap.get(jp.key)?.segmentIndices || [];
                    connectedSegs.forEach(idx => segmentsToUncover.add(idx));
                }
            }
        });

        const keptPunches: typeof punches = [];
        for (const p of punches) {
            if (p.lineId && linesToDelete.has(p.lineId)) continue;
            let keepSingle = true;
            if (!p.lineId) {
                const tool = tools.find(t => t.id === p.toolId);
                const toolRadius = tool ? Math.max(tool.width, tool.height) / 2 : 5;
                const safeDistSq = (settings.microJointLength + toolRadius)**2;
                for (const jp of jointPoints) {
                    if (((p.x - jp.x)**2 + (p.y - jp.y)**2) < safeDistSq) { keepSingle = false; break; }
                }
            }
            if (keepSingle) keptPunches.push(p);
        }
        punches.length = 0;
        punches.push(...keptPunches);
        segmentsToUncover.forEach(idx => coveredIndices.delete(idx));
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

        if (seg.type === 'line') {
            // Topology Lookup for Smart Extension
            const neighbor1Idx = vertexMap.get(getPointKey(seg.p1))?.segmentIndices.find(i => i !== idx);
            const neighbor2Idx = vertexMap.get(getPointKey(seg.p2))?.segmentIndices.find(i => i !== idx);
            const neighbor1 = neighbor1Idx !== undefined ? processed.segments[neighbor1Idx] : undefined;
            const neighbor2 = neighbor2Idx !== undefined ? processed.segments[neighbor2Idx] : undefined;

            processLineSegment(
                seg, 
                geometry, 
                availableTools, 
                settings, 
                punches, 
                processed.segments,
                { start: neighbor1, end: neighbor2 }, // Pass neighbors for angle analysis
                jointVertices
            );
        } else if (seg.type === 'arc') {
            processArcSegment(seg, geometry, availableTools, settings, jointVertices, punches, placedSingleHits, processed.segments);
        }
    }

    return punches;
};
