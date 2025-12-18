
import { generateId } from '../utils/helpers';
import { TeachCycle, Part, PlacedTool, Point, CycleSymmetry, PatternSegment, PatternPunch } from '../types';
import { ProcessedGeometry, Segment } from './geometry';

// ENABLE DEBUGGING HERE
const DEBUG_TEACH = false;

const debugLog = (msg: string, ...args: any[]) => {
    if (DEBUG_TEACH) console.log(`%c[TeachLogic] ${msg}`, 'color: #bada55', ...args);
};

// Helper: Distance squared
const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
const dist = (p1: Point, p2: Point) => Math.sqrt(distSq(p1, p2));

/**
 * Normalizes angle to -180..180
 */
const normalizeAngle = (deg: number) => {
    let d = deg;
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    return d;
};

// Check if a point C is to the left of vector AB (2D Cross Product)
const isCenterLeft = (a: Point, b: Point, c: Point): boolean => {
    return ((b.x - a.x)*(c.y - a.y) - (b.y - a.y)*(c.x - a.x)) > 0;
};

/**
 * Checks if a punch is aligned with a line segment for topology grouping.
 */
const isPunchAlignedWithSegment = (p: {x: number, y: number}, seg: Segment, maxLatDist: number = 50.0): { aligned: boolean, t: number, dist: number } => {
    if (seg.type !== 'line') return { aligned: false, t: 0, dist: 0 };
    
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const l2 = dx*dx + dy*dy;
    
    if (l2 === 0) return { aligned: false, t: 0, dist: 0 };

    const t = ((p.x - seg.p1.x) * dx + (p.y - seg.p1.y) * dy) / l2;
    if (t < -0.5 || t > 1.5) return { aligned: false, t, dist: 0 };

    const cross = dx * (p.y - seg.p1.y) - dy * (p.x - seg.p1.x);
    const distVal = cross / Math.sqrt(l2);

    if (Math.abs(distVal) > maxLatDist) return { aligned: false, t, dist: distVal };

    return { aligned: true, t, dist: distVal };
};

/**
 * Groups punches based on their adherence to the matched contour segments.
 */
const groupPunchesByTopology = (
    punches: Omit<PlacedTool, 'id'>[], 
    matchedSegments: Segment[],
    cycleName: string
): Omit<PlacedTool, 'id'>[] => {
    
    const assignments = new Map<Omit<PlacedTool, 'id'>, { segIdx: number, dist: number, signedOffset: number }>();
    const MAX_LATERAL_DIST = 20.0;

    punches.forEach(p => {
        let bestSegIdx = -1;
        let minAbsDist = Infinity;
        let bestSignedOffset = 0;

        matchedSegments.forEach((seg, sIdx) => {
            if (seg.type !== 'line') return;

            const res = isPunchAlignedWithSegment(p, seg, MAX_LATERAL_DIST);
            if (res.aligned) {
                const absDist = Math.abs(res.dist);
                if (absDist < minAbsDist) {
                    minAbsDist = absDist;
                    bestSegIdx = sIdx;
                    bestSignedOffset = res.dist;
                }
            }
        });

        if (bestSegIdx !== -1) {
            assignments.set(p, { segIdx: bestSegIdx, dist: minAbsDist, signedOffset: bestSignedOffset });
        }
    });

    const segmentGroups = new Map<number, Omit<PlacedTool, 'id'>[]>();
    assignments.forEach((info, p) => {
        if (!segmentGroups.has(info.segIdx)) segmentGroups.set(info.segIdx, []);
        segmentGroups.get(info.segIdx)!.push(p);
    });

    segmentGroups.forEach((groupPunches, segIdx) => {
        const seg = matchedSegments[segIdx];
        const subGroups = new Map<string, Omit<PlacedTool, 'id'>[]>();

        groupPunches.forEach(p => {
            const info = assignments.get(p)!;
            const offsetKey = Math.round(info.signedOffset * 10) / 10;
            const rotKey = Math.round(p.rotation * 100) / 100;
            const key = `${p.toolId}_${rotKey}_${offsetKey}`;
            
            if (!subGroups.has(key)) subGroups.set(key, []);
            subGroups.get(key)!.push(p);
        });

        subGroups.forEach(subGroup => {
            if (subGroup.length >= 2) {
                subGroup.sort((a, b) => distSq(a, seg.p1) - distSq(b, seg.p1));
                const lineId = `teach_${cycleName}_${generateId()}`;
                subGroup.forEach(p => {
                    p.lineId = lineId;
                });
            }
        });
    });

    return punches;
};

// --- GEOMETRY RECONSTRUCTION HELPERS ---

// Reconstruct explicit points of the pattern chain starting at (0,0)
const reconstructPatternGeometry = (segments: PatternSegment[]): { p1: Point, p2: Point }[] => {
    const result: { p1: Point, p2: Point }[] = [];
    let curX = 0; 
    let curY = 0;
    let curAngle = 0; // Radians. Segment 0 starts at angle 0 relative to itself.

    segments.forEach((seg, idx) => {
        // Apply angle change relative to previous segment vector
        if (idx > 0) {
            curAngle += seg.angleChange * (Math.PI / 180);
        }
        
        const dx = Math.cos(curAngle) * seg.length;
        const dy = Math.sin(curAngle) * seg.length;
        const nextX = curX + dx;
        const nextY = curY + dy;

        result.push({ 
            p1: { x: curX, y: curY }, 
            p2: { x: nextX, y: nextY } 
        });

        curX = nextX;
        curY = nextY;
    });
    return result;
};

// --- CREATE CYCLE ---
export const createTeachCycleFromSelection = (
    name: string,
    symmetry: CycleSymmetry,
    selectedSegmentIndices: number[],
    selectedPunchIds: string[],
    activePart: Part,
    processedGeometry: ProcessedGeometry
): TeachCycle | null => {
    if (selectedSegmentIndices.length === 0 || selectedPunchIds.length === 0) return null;

    // 1. Build Chain
    const pool = selectedSegmentIndices.map(idx => ({ 
        seg: processedGeometry.segments[idx], 
        originalIndex: idx, used: false, reverse: false 
    }));

    const chain: typeof pool = [];
    const seed = pool[0];
    seed.used = true;
    chain.push(seed);

    let headPoint = seed.seg.p2;
    let tailPoint = seed.seg.p1;

    // Greedy Chain Sort
    // Forward
    while(true) {
        let found = false;
        for (const candidate of pool) {
            if (candidate.used) continue;
            if (distSq(headPoint, candidate.seg.p1) < 0.1) {
                candidate.reverse = false; candidate.used = true;
                chain.push(candidate); headPoint = candidate.seg.p2; found = true; break;
            } else if (distSq(headPoint, candidate.seg.p2) < 0.1) {
                candidate.reverse = true; candidate.used = true;
                chain.push(candidate); headPoint = candidate.seg.p1; found = true; break;
            }
        }
        if (!found) break;
    }
    // Backward
    while(true) {
        let found = false;
        for (const candidate of pool) {
            if (candidate.used) continue;
            if (distSq(candidate.seg.p2, tailPoint) < 0.1) {
                candidate.reverse = false; candidate.used = true;
                chain.unshift(candidate); tailPoint = candidate.seg.p1; found = true; break;
            } else if (distSq(candidate.seg.p1, tailPoint) < 0.1) {
                candidate.reverse = true; candidate.used = true;
                chain.unshift(candidate); tailPoint = candidate.seg.p2; found = true; break;
            }
        }
        if (!found) break;
    }

    // 2. Define Local Coordinate System (Origin at start of first segment, aligned with first segment)
    const firstItem = chain[0];
    const baseP1 = firstItem.reverse ? firstItem.seg.p2 : firstItem.seg.p1;
    const baseP2 = firstItem.reverse ? firstItem.seg.p1 : firstItem.seg.p2;
    const origin = baseP1;
    const baseAngle = Math.atan2(baseP2.y - baseP1.y, baseP2.x - baseP1.x);

    const toLocal = (p: Point, rot: number = 0): {x: number, y: number, r: number} => {
        const tx = p.x - origin.x;
        const ty = p.y - origin.y;
        const rx = tx * Math.cos(-baseAngle) - ty * Math.sin(-baseAngle);
        const ry = tx * Math.sin(-baseAngle) + ty * Math.cos(-baseAngle);
        return { x: rx, y: ry, r: rot - (baseAngle * 180 / Math.PI) };
    };

    // 3. Build Segments
    const patternSegments: PatternSegment[] = [];
    chain.forEach((item, idx) => {
        const p1 = item.reverse ? item.seg.p2 : item.seg.p1;
        const p2 = item.reverse ? item.seg.p1 : item.seg.p2;
        const len = dist(p1, p2);
        
        // Calculate relative angle change
        // For idx 0, angle change is 0 (it defines the baseline)
        let angleDiff = 0;
        if (idx > 0) {
            // Vector of previous segment
            const prevItem = chain[idx-1];
            const pp1 = prevItem.reverse ? prevItem.seg.p2 : prevItem.seg.p1;
            const pp2 = prevItem.reverse ? prevItem.seg.p1 : prevItem.seg.p2;
            const prevAngle = Math.atan2(pp2.y - pp1.y, pp2.x - pp1.x);
            const currAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            angleDiff = normalizeAngle((currAngle - prevAngle) * 180 / Math.PI);
        }

        let arcCenterLeft: boolean | undefined = undefined;
        let isLargeArc = false;
        let sweepAngle = 0;

        if (item.seg.type === 'arc' && item.seg.center && item.seg.radius) {
            arcCenterLeft = isCenterLeft(p1, p2, item.seg.center);
            if (item.seg.originalEntity && item.seg.originalEntity.type === 'ARC') {
                const arc = item.seg.originalEntity;
                sweepAngle = arc.endAngle - arc.startAngle;
                if (sweepAngle < 0) sweepAngle += 360;
                isLargeArc = sweepAngle > 180;
            }
        }

        patternSegments.push({
            type: item.seg.type === 'arc' ? 'arc' : 'line',
            length: len,
            angleChange: angleDiff,
            radius: item.seg.type === 'arc' ? item.seg.radius : undefined,
            arcCenterLeft,
            largeArc: isLargeArc,
            sweepAngle: sweepAngle > 0 ? sweepAngle : undefined
        });
    });

    // 4. Build Punches
    const patternPunches: PatternPunch[] = [];
    selectedPunchIds.forEach(pid => {
        const p = activePart.punches.find(x => x.id === pid);
        if (p) {
            const loc = toLocal({ x: p.x, y: p.y }, p.rotation);
            patternPunches.push({
                toolId: p.toolId,
                relX: loc.x,
                relY: loc.y,
                relRotation: loc.r
            });
        }
    });

    return {
        id: generateId(),
        name,
        symmetry,
        segments: patternSegments,
        punches: patternPunches,
        baseAngle
    };
};

// --- FIND MATCHES (Matrix Method) ---

export const findTeachCycleMatches = (
    partGeometry: ProcessedGeometry,
    teachCycles: TeachCycle[]
): { matches: Omit<PlacedTool, 'id'>[], coveredSegmentIndices: Set<number> } => {
    
    const resultPunches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    
    const TOL_LEN = 1.0; 
    const TOL_POS = 1.5; 

    // Match Helper
    const isSamePoint = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2 < TOL_POS;

    const targetSegments = partGeometry.segments;

    teachCycles.forEach(cycle => {
        if (cycle.segments.length === 0) return;

        // 1. Reconstruct Abstract Chain Points in Local Pattern Space
        const patternChain = reconstructPatternGeometry(cycle.segments);
        const patternSeg0 = patternChain[0]; // Baseline segment from (0,0) to (L, 0)

        // 2. Define Transformations based on Symmetry
        type Transform = { scaleX: number, scaleY: number, rotation: number, name: string };
        const transforms: Transform[] = [];

        // Always add Identity
        transforms.push({ scaleX: 1, scaleY: 1, rotation: 0, name: 'Original' });

        if (cycle.symmetry === 'full') {
            transforms.push({ scaleX: -1, scaleY: 1, rotation: 0, name: 'Mirror X' }); // Vertical Mirror
            transforms.push({ scaleX: 1, scaleY: -1, rotation: 0, name: 'Mirror Y' }); // Horizontal Mirror
            transforms.push({ scaleX: -1, scaleY: -1, rotation: 0, name: 'Rot 180' });
        } else if (cycle.symmetry === 'vertical') {
            // Vertical symmetry = Left/Right flip = Mirror X
            transforms.push({ scaleX: -1, scaleY: 1, rotation: 0, name: 'Mirror X' });
        } else if (cycle.symmetry === 'horizontal') {
            // Horizontal symmetry = Top/Bottom flip = Mirror Y
            transforms.push({ scaleX: 1, scaleY: -1, rotation: 0, name: 'Mirror Y' });
        }

        // 3. Scan Target Segments
        for (let i = 0; i < targetSegments.length; i++) {
            if (coveredIndices.has(i)) continue;
            const targetSeg = targetSegments[i];

            // Filter by Type and Length immediately
            if (targetSeg.type !== cycle.segments[0].type) continue;
            if (Math.abs(dist(targetSeg.p1, targetSeg.p2) - cycle.segments[0].length) > TOL_LEN) continue;

            // Try both directions of target segment
            const directions = [
                { start: targetSeg.p1, end: targetSeg.p2 },
                { start: targetSeg.p2, end: targetSeg.p1 }
            ];

            for (const dir of directions) {
                const targetStart = dir.start;
                const targetEnd = dir.end;
                const targetAngle = Math.atan2(targetEnd.y - targetStart.y, targetEnd.x - targetStart.x);

                // Try all allowed Symmetry Transforms
                for (const trans of transforms) {
                    if (coveredIndices.has(i)) break;

                    // --- ALIGNMENT ---
                    // 1. Apply Symmetry Transform to Pattern Seg 0
                    // Original Seg0 is (0,0) -> (Len, 0)
                    // Transformed Seg0 Vector:
                    const p0_vec_x = patternSeg0.p2.x - patternSeg0.p1.x; // Len
                    const p0_vec_y = patternSeg0.p2.y - patternSeg0.p1.y; // 0
                    
                    // Apply Scale
                    const sx = p0_vec_x * trans.scaleX;
                    const sy = p0_vec_y * trans.scaleY; // Still 0
                    
                    // Angle of the transformed pattern baseline in Pattern Space
                    const patBaseAngle = Math.atan2(sy, sx);

                    // 2. Determine Required Rotation to align Transformed Pattern to Target
                    // We want patBaseAngle + globalRotation = targetAngle
                    const globalRotation = targetAngle - patBaseAngle;
                    const cosG = Math.cos(globalRotation);
                    const sinG = Math.sin(globalRotation);

                    // Transform Function: Pattern Local -> Target World
                    const transformPoint = (px: number, py: number): Point => {
                        // 1. Symmetry Scale
                        const scaledX = px * trans.scaleX;
                        const scaledY = py * trans.scaleY;
                        // 2. Rotate to align with target
                        const rx = scaledX * cosG - scaledY * sinG;
                        const ry = scaledX * sinG + scaledY * cosG;
                        // 3. Translate to target start
                        return { x: rx + targetStart.x, y: ry + targetStart.y };
                    };

                    // --- VERIFICATION ---
                    // Project all pattern segments into world space and look for matches
                    const matchedIndices: number[] = [i];
                    let allMatched = true;

                    for (let k = 1; k < patternChain.length; k++) {
                        const pSeg = patternChain[k];
                        const patType = cycle.segments[k].type;
                        const patRad = cycle.segments[k].radius;

                        // Calculate Expected World Coordinates
                        const expectedP1 = transformPoint(pSeg.p1.x, pSeg.p1.y);
                        const expectedP2 = transformPoint(pSeg.p2.x, pSeg.p2.y);

                        // Find a target segment that connects P1->P2
                        let foundK = -1;
                        
                        // Optimization: Check only segments starting near expectedP1
                        // This implies O(N^2) worst case but N is small per cycle.
                        // Can iterate all or use spatial hash if needed. Simple loop is fine for < 1000 segs.
                        for (let t = 0; t < targetSegments.length; t++) {
                            if (matchedIndices.includes(t) || coveredIndices.has(t)) continue;
                            const cand = targetSegments[t];
                            
                            if (cand.type !== patType) continue;
                            if (patType === 'arc' && patRad && cand.radius && Math.abs(cand.radius - patRad) > TOL_LEN) continue;

                            // Check connectivity (Allow reverse)
                            const matchForward = isSamePoint(cand.p1, expectedP1) && isSamePoint(cand.p2, expectedP2);
                            const matchReverse = isSamePoint(cand.p2, expectedP1) && isSamePoint(cand.p1, expectedP2);

                            if (matchForward || matchReverse) {
                                // For arcs, verify center side if needed
                                // (If mirrored, 'Left' becomes 'Right')
                                if (patType === 'arc' && cycle.segments[k].arcCenterLeft !== undefined && cand.center) {
                                    const expectedLeft = cycle.segments[k].arcCenterLeft;
                                    // Flip expectation if scaled X * scaled Y is negative (determinant < 0 => chirality flip)
                                    const det = trans.scaleX * trans.scaleY;
                                    const finalExpectedLeft = det < 0 ? !expectedLeft : expectedLeft;
                                    
                                    // Actual check: P1->P2 vector vs Center
                                    // Note: If matched Reverse, vector is P2->P1.
                                    const start = matchReverse ? cand.p2 : cand.p1;
                                    const end = matchReverse ? cand.p1 : cand.p2;
                                    const actualLeft = isCenterLeft(start, end, cand.center);
                                    
                                    if (actualLeft !== finalExpectedLeft) continue;
                                }

                                foundK = t;
                                break;
                            }
                        }

                        if (foundK !== -1) {
                            matchedIndices.push(foundK);
                        } else {
                            allMatched = false;
                            break;
                        }
                    }

                    if (allMatched) {
                        debugLog(`Matched Cycle '${cycle.name}' Variant '${trans.name}'`);
                        
                        // Collect Punches
                        const instancePunches: Omit<PlacedTool, 'id'>[] = [];
                        cycle.punches.forEach(p => {
                            const worldPos = transformPoint(p.relX, p.relY);
                            
                            // Rotation:
                            // 1. Symmetry flip affects rotation direction.
                            //    If determinant < 0, rotation direction flips.
                            //    Angle A becomes -A.
                            //    Also, Mirror X (scaleX=-1) on 0 deg is 180 deg (flip).
                            //    Logic: Transform unit vector of punch rotation.
                            const punchCos = Math.cos(p.relRotation * Math.PI / 180);
                            const punchSin = Math.sin(p.relRotation * Math.PI / 180);
                            
                            // Apply Scale
                            const scCos = punchCos * trans.scaleX;
                            const scSin = punchSin * trans.scaleY;
                            
                            // Apply Global Rotation
                            const finalCos = scCos * cosG - scSin * sinG;
                            const finalSin = scCos * sinG + scSin * cosG;
                            
                            const finalRotRad = Math.atan2(finalSin, finalCos);
                            let finalRotDeg = finalRotRad * 180 / Math.PI;
                            
                            instancePunches.push({
                                toolId: p.toolId,
                                x: worldPos.x,
                                y: worldPos.y,
                                rotation: normalizeAngle(finalRotDeg)
                            });
                        });

                        // Add to results
                        const grouped = groupPunchesByTopology(instancePunches, matchedIndices.map(mi => targetSegments[mi]), cycle.name);
                        resultPunches.push(...grouped);
                        
                        matchedIndices.forEach(mi => coveredIndices.add(mi));
                        break; // Stop checking transforms for this starting segment
                    }
                }
            }
        }
    });

    return { matches: resultPunches, coveredSegmentIndices: coveredIndices };
};
