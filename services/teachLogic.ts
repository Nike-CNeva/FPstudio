
import { TeachCycle, Part, PlacedTool, Tool, Point, CycleSymmetry, PatternSegment, PatternPunch } from '../types';
import { generateId } from '../utils/helpers';
import { ProcessedGeometry, Segment } from './geometry';

// Helper: Distance squared
const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
const dist = (p1: Point, p2: Point) => Math.sqrt(distSq(p1, p2));

/**
 * Helper to normalize angle to -180..180
 */
const normalizeAngle = (deg: number) => {
    let d = deg;
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    return d;
};

/**
 * Normalizes a selection of geometry and punches into a generic Pattern.
 * Automatically sorts and orients selected segments into a continuous chain.
 */
export const createTeachCycleFromSelection = (
    name: string,
    symmetry: CycleSymmetry,
    selectedSegmentIndices: number[],
    selectedPunchIds: string[],
    activePart: Part,
    processedGeometry: ProcessedGeometry
): TeachCycle | null => {
    if (selectedSegmentIndices.length === 0 || selectedPunchIds.length === 0) return null;

    // 1. Extract Segments
    const pool = selectedSegmentIndices.map(idx => ({ 
        seg: processedGeometry.segments[idx], 
        originalIndex: idx, 
        used: false,
        reverse: false 
    }));

    // 2. Build Chain (Greedy search for continuity)
    const chain: typeof pool = [];
    
    // Start with the first selected segment (arbitrary start)
    // We try to extend it both ways
    const seed = pool[0];
    seed.used = true;
    chain.push(seed);

    let headPoint = seed.seg.p2;
    let tailPoint = seed.seg.p1;

    // Extend Head (Forward)
    while(true) {
        let found = false;
        for (const candidate of pool) {
            if (candidate.used) continue;
            
            // Check connectivity to headPoint
            if (distSq(headPoint, candidate.seg.p1) < 0.1) {
                candidate.reverse = false;
                candidate.used = true;
                chain.push(candidate);
                headPoint = candidate.seg.p2;
                found = true;
                break;
            } else if (distSq(headPoint, candidate.seg.p2) < 0.1) {
                candidate.reverse = true;
                candidate.used = true;
                chain.push(candidate);
                headPoint = candidate.seg.p1; // Reversed
                found = true;
                break;
            }
        }
        if (!found) break;
    }

    // Extend Tail (Backward - Prepend)
    while(true) {
        let found = false;
        for (const candidate of pool) {
            if (candidate.used) continue;
            
            // Check connectivity to tailPoint
            // If candidate connects to tailPoint, it comes BEFORE current tail
            if (distSq(candidate.seg.p2, tailPoint) < 0.1) {
                candidate.reverse = false;
                candidate.used = true;
                chain.unshift(candidate);
                tailPoint = candidate.seg.p1;
                found = true;
                break;
            } else if (distSq(candidate.seg.p1, tailPoint) < 0.1) {
                candidate.reverse = true; // p2 is start, p1 is end (connecting to tail)
                candidate.used = true;
                chain.unshift(candidate);
                tailPoint = candidate.seg.p2;
                found = true;
                break;
            }
        }
        if (!found) break;
    }

    // NOTE: Any remaining unused segments in pool are disjoint and ignored.

    // 3. Define Coordinate System based on first segment of the chain
    const firstItem = chain[0];
    const baseP1 = firstItem.reverse ? firstItem.seg.p2 : firstItem.seg.p1;
    const baseP2 = firstItem.reverse ? firstItem.seg.p1 : firstItem.seg.p2;
    const origin = baseP1;
    const baseAngle = Math.atan2(baseP2.y - baseP1.y, baseP2.x - baseP1.x);

    // Transform function: World -> Local Pattern Space
    const toLocal = (p: Point, rot: number = 0): {x: number, y: number, r: number} => {
        // Translate
        const tx = p.x - origin.x;
        const ty = p.y - origin.y;
        // Rotate by -baseAngle
        const rx = tx * Math.cos(-baseAngle) - ty * Math.sin(-baseAngle);
        const ry = tx * Math.sin(-baseAngle) + ty * Math.cos(-baseAngle);
        return { x: rx, y: ry, r: rot - (baseAngle * 180 / Math.PI) };
    };

    // 4. Build Pattern Segments
    const patternSegments: PatternSegment[] = [];
    
    chain.forEach(item => {
        const p1 = item.reverse ? item.seg.p2 : item.seg.p1;
        const p2 = item.reverse ? item.seg.p1 : item.seg.p2;
        
        const len = dist(p1, p2);
        const segAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const angleDiff = normalizeAngle((segAngle - baseAngle) * 180 / Math.PI);

        patternSegments.push({
            type: item.seg.type === 'arc' ? 'arc' : 'line',
            length: len,
            angleChange: angleDiff,
            radius: item.seg.type === 'arc' ? item.seg.radius : undefined
        });
    });

    // 5. Build Pattern Punches
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
        punches: patternPunches
    };
};

/**
 * Finds occurrences of Teach Cycles in the target geometry.
 * Robust against segment direction and order.
 */
export const findTeachCycleMatches = (
    partGeometry: ProcessedGeometry,
    teachCycles: TeachCycle[]
): { matches: Omit<PlacedTool, 'id'>[], coveredSegmentIndices: Set<number> } => {
    
    const resultPunches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    
    const TOL_LEN = 0.5; // mm tolerance for length
    const TOL_ANG = 3.0; // degree tolerance for angles
    const TOL_CONN_SQ = 1.0; // squared distance tolerance for connectivity

    const targetSegments = partGeometry.segments;

    // Helper: Compare two values with tolerance
    const matchesVal = (v1: number, v2: number, tol: number) => Math.abs(v1 - v2) < tol;

    teachCycles.forEach(cycle => {
        if (cycle.segments.length === 0) return;

        // Generate Symmetry Variants
        const variants = [{ segments: cycle.segments, punches: cycle.punches, mirrorX: false, mirrorY: false }];
        
        if (cycle.symmetry === 'horizontal' || cycle.symmetry === 'full') {
            variants.push({
                segments: cycle.segments.map(s => ({ ...s, angleChange: -s.angleChange })),
                punches: cycle.punches.map(p => ({ ...p, relY: -p.relY, relRotation: -p.relRotation })),
                mirrorX: false, mirrorY: true
            });
        }
        if (cycle.symmetry === 'vertical' || cycle.symmetry === 'full') {
             variants.push({
                segments: cycle.segments.map(s => ({ ...s, angleChange: -s.angleChange })),
                punches: cycle.punches.map(p => ({ ...p, relX: -p.relX, relRotation: -p.relRotation })), 
                mirrorX: true, mirrorY: false
             });
        }

        // Search in target geometry
        for (let i = 0; i < targetSegments.length; i++) {
            if (coveredIndices.has(i)) continue;

            const startSeg = targetSegments[i];

            // A segment can be traversed P1->P2 or P2->P1. We try both as "Start Direction".
            // false = Normal (P1 start), true = Reverse (P2 start)
            const startDirections = [false, true];

            for (const startReverse of startDirections) {
                if (coveredIndices.has(i)) break; 

                // Define geometric properties of the start segment in this direction
                const startP1 = startReverse ? startSeg.p2 : startSeg.p1;
                const startP2 = startReverse ? startSeg.p1 : startSeg.p2;
                
                // Base Angle for this potential match's coordinate system
                const baseAngle = Math.atan2(startP2.y - startP1.y, startP2.x - startP1.x);
                const origin = startP1;

                // Try to match against all symmetry variants
                for (const variant of variants) {
                    if (coveredIndices.has(i)) break;

                    const patSegs = variant.segments;
                    const firstPat = patSegs[0];

                    // --- 1. Check FIRST Segment Match ---
                    if (startSeg.type !== (firstPat.type === 'arc' ? 'arc' : 'line')) continue;
                    if (!matchesVal(dist(startP1, startP2), firstPat.length, TOL_LEN)) continue;
                    if (firstPat.type === 'arc' && firstPat.radius) {
                        if (!startSeg.radius || !matchesVal(startSeg.radius, firstPat.radius, TOL_LEN)) continue;
                    }

                    // --- 2. Check Chain Continuity ---
                    const matchedIndices = [i];
                    let currentEndpoint = startP2;
                    let matchFound = true;

                    for (let k = 1; k < patSegs.length; k++) {
                        const patSeg = patSegs[k];
                        let foundNextIndex = -1;
                        let nextReverse = false;

                        // Search for next segment in the array
                        for(let t=0; t<targetSegments.length; t++) {
                            if (matchedIndices.includes(t) || coveredIndices.has(t)) continue;
                            
                            const candidate = targetSegments[t];
                            
                            // Type & Geom Check
                            if (candidate.type !== (patSeg.type === 'arc' ? 'arc' : 'line')) continue;
                            if (!matchesVal(dist(candidate.p1, candidate.p2), patSeg.length, TOL_LEN)) continue;
                            if (patSeg.type === 'arc' && patSeg.radius) {
                                if (!candidate.radius || !matchesVal(candidate.radius, patSeg.radius, TOL_LEN)) continue;
                            }

                            // Connectivity & Direction Check
                            // Does Candidate start at currentEndpoint?
                            // Try Normal (P1 at endpoint)
                            if (distSq(currentEndpoint, candidate.p1) < TOL_CONN_SQ) {
                                nextReverse = false;
                            } 
                            // Try Reverse (P2 at endpoint)
                            else if (distSq(currentEndpoint, candidate.p2) < TOL_CONN_SQ) {
                                nextReverse = true;
                            } else {
                                continue; // Not connected
                            }

                            // Angle Check
                            const candP1 = nextReverse ? candidate.p2 : candidate.p1;
                            const candP2 = nextReverse ? candidate.p1 : candidate.p2;
                            const candAngle = Math.atan2(candP2.y - candP1.y, candP2.x - candP1.x);
                            
                            const diff = normalizeAngle((candAngle - baseAngle) * 180 / Math.PI);

                            if (matchesVal(diff, patSeg.angleChange, TOL_ANG)) {
                                foundNextIndex = t;
                                break; // Found the next link
                            }
                        }

                        if (foundNextIndex !== -1) {
                            matchedIndices.push(foundNextIndex);
                            const chosen = targetSegments[foundNextIndex];
                            currentEndpoint = nextReverse ? chosen.p1 : chosen.p2;
                        } else {
                            matchFound = false;
                            break;
                        }
                    }

                    if (matchFound) {
                        // Match Confirmed! Apply Punches
                        variant.punches.forEach(p => {
                            // Rotate from Pattern Space to World Space
                            // x' = x*cos - y*sin
                            const rx = p.relX * Math.cos(baseAngle) - p.relY * Math.sin(baseAngle);
                            const ry = p.relX * Math.sin(baseAngle) + p.relY * Math.cos(baseAngle);
                            
                            // Translate
                            const wx = origin.x + rx;
                            const wy = origin.y + ry;
                            
                            // Absolute Rotation
                            const wr = p.relRotation + (baseAngle * 180 / Math.PI);

                            resultPunches.push({
                                toolId: p.toolId,
                                x: wx,
                                y: wy,
                                rotation: wr,
                                lineId: `teach_${cycle.name}_${generateId()}`
                            });
                        });

                        matchedIndices.forEach(idx => coveredIndices.add(idx));
                        break; // Stop checking variants for this start segment, move to next i
                    }
                }
            }
        }
    });

    return { matches: resultPunches, coveredSegmentIndices: coveredIndices };
};
