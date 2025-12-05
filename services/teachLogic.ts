
import { generateId } from '../utils/helpers';
import { TeachCycle, Part, PlacedTool, Point, CycleSymmetry, PatternSegment, PatternPunch } from '../types';
import { ProcessedGeometry } from './geometry';

// ENABLE DEBUGGING HERE
const DEBUG_TEACH = true;

const debugLog = (msg: string, ...args: any[]) => {
    if (DEBUG_TEACH) console.log(`%c[TeachLogic] ${msg}`, 'color: #bada55', ...args);
};

const debugGroup = (label: string) => {
    if (DEBUG_TEACH) console.groupCollapsed(`%c[TeachLogic] ${label}`, 'color: #dda0dd');
};

const debugGroupEnd = () => {
    if (DEBUG_TEACH) console.groupEnd();
};

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

// Check if a point C is to the left of vector AB (2D Cross Product)
const isCenterLeft = (a: Point, b: Point, c: Point): boolean => {
    return ((b.x - a.x)*(c.y - a.y) - (b.y - a.y)*(c.x - a.x)) > 0;
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

    debugGroup(`Creating Cycle: ${name}`);

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
            if (distSq(candidate.seg.p2, tailPoint) < 0.1) {
                candidate.reverse = false;
                candidate.used = true;
                chain.unshift(candidate);
                tailPoint = candidate.seg.p1;
                found = true;
                break;
            } else if (distSq(candidate.seg.p1, tailPoint) < 0.1) {
                candidate.reverse = true; 
                candidate.used = true;
                chain.unshift(candidate);
                tailPoint = candidate.seg.p2;
                found = true;
                break;
            }
        }
        if (!found) break;
    }

    debugLog(`Chain built with ${chain.length} segments`);

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
    
    chain.forEach((item, idx) => {
        const p1 = item.reverse ? item.seg.p2 : item.seg.p1;
        const p2 = item.reverse ? item.seg.p1 : item.seg.p2;
        
        const len = dist(p1, p2);
        
        // Calculate vector direction change relative to base angle
        const segAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const angleDiff = normalizeAngle((segAngle - baseAngle) * 180 / Math.PI);

        // Calculate arc properties
        let arcCenterLeft: boolean | undefined = undefined;
        let isLargeArc = false;
        let sweepAngle = 0;

        if (item.seg.type === 'arc' && item.seg.center && item.seg.radius) {
            // Determine Side (Left or Right of chord)
            arcCenterLeft = isCenterLeft(p1, p2, item.seg.center);
            
            // Determine Large Arc flag using Original Entity data if available
            if (item.seg.originalEntity && item.seg.originalEntity.type === 'ARC') {
                const arc = item.seg.originalEntity;
                sweepAngle = arc.endAngle - arc.startAngle;
                if (sweepAngle < 0) sweepAngle += 360;
                isLargeArc = sweepAngle > 180;
            } else {
                // Fallback geometry check
                // This is less reliable but useful for generated geometry
                if (Math.abs(len - 2 * item.seg.radius) < 0.1) {
                    // ambiguous semicircle
                }
            }
        }

        debugLog(`Seg ${idx}: Type=${item.seg.type}, Len=${len.toFixed(2)}, AngChange=${angleDiff.toFixed(2)}, ArcLeft=${arcCenterLeft}, LargeArc=${isLargeArc}`);

        patternSegments.push({
            type: item.seg.type === 'arc' ? 'arc' : 'line',
            length: len, // For arcs, this is Chord Length
            angleChange: angleDiff, // Vector direction change
            radius: item.seg.type === 'arc' ? item.seg.radius : undefined,
            arcCenterLeft: arcCenterLeft,
            largeArc: isLargeArc,
            sweepAngle: sweepAngle > 0 ? sweepAngle : undefined
        });
    });

    // 5. Build Pattern Punches
    const patternPunches: PatternPunch[] = [];
    
    selectedPunchIds.forEach(pid => {
        const p = activePart.punches.find(x => x.id === pid);
        if (p) {
            const loc = toLocal({ x: p.x, y: p.y }, p.rotation);
            debugLog(`Punch ${pid}: Local X=${loc.x.toFixed(2)}, Y=${loc.y.toFixed(2)}, Rot=${loc.r.toFixed(2)}`);
            patternPunches.push({
                toolId: p.toolId,
                relX: loc.x,
                relY: loc.y,
                relRotation: loc.r
            });
        }
    });

    debugGroupEnd();

    return {
        id: generateId(),
        name,
        symmetry,
        segments: patternSegments,
        punches: patternPunches,
        baseAngle // Store original absolute angle
    };
};

/**
 * Finds occurrences of Teach Cycles in the target geometry.
 */
export const findTeachCycleMatches = (
    partGeometry: ProcessedGeometry,
    teachCycles: TeachCycle[]
): { matches: Omit<PlacedTool, 'id'>[], coveredSegmentIndices: Set<number> } => {
    
    debugGroup('Searching Teach Cycles');
    
    const resultPunches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    
    const TOL_LEN = 1.0; 
    const TOL_ANG = 5.0; 
    const TOL_CONN_SQ = 2.0;
    const TOL_DUP_SQ = 0.2;

    const targetSegments = partGeometry.segments;

    const matchesVal = (v1: number, v2: number, tol: number) => Math.abs(v1 - v2) < tol;

    const markCovered = (idx: number) => {
        if (coveredIndices.has(idx)) return;
        coveredIndices.add(idx);
        // Mark duplicates
        const source = targetSegments[idx];
        for(let j=0; j<targetSegments.length; j++) {
            if(j === idx || coveredIndices.has(j)) continue;
            const cand = targetSegments[j];
            if(cand.type !== source.type) continue;
            const dSq = Math.min(
                distSq(source.p1, cand.p1) + distSq(source.p2, cand.p2),
                distSq(source.p1, cand.p2) + distSq(source.p2, cand.p1)
            );
            if (dSq < TOL_DUP_SQ * 2) {
                coveredIndices.add(j);
            }
        }
    };

    teachCycles.forEach(cycle => {
        if (cycle.segments.length === 0) return;
        debugGroup(`Cycle: ${cycle.name} (Sym: ${cycle.symmetry})`);

        // Generate Variants based on Symmetry
        const variants: { 
            name: string, 
            segments: PatternSegment[], 
            punches: PatternPunch[], 
            isMirrored: boolean // True if chirality is flipped (e.g. Left turns become Right turns)
        }[] = [];

        // 1. Original (Chirality Normal)
        variants.push({ 
            name: "Original",
            segments: cycle.segments, 
            punches: cycle.punches, 
            isMirrored: false
        });
        
        // 2. Mirrored (Chirality Flipped)
        // If "Full Symmetry" or "Horizontal" or "Vertical", we generate the mirrored variant.
        if (cycle.symmetry !== 'none') {
             const flippedSegments = cycle.segments.map(s => ({ 
                 ...s, 
                 angleChange: -s.angleChange, // Flip turn direction (Left -> Right)
                 arcCenterLeft: s.arcCenterLeft !== undefined ? !s.arcCenterLeft : undefined // Flip arc side
             }));
             
             // Flip Tooling across the path axis (X-axis of pattern)
             const flippedPunches = cycle.punches.map(p => ({ 
                ...p, 
                // Flip Y coordinate (Lateral distance from path)
                relY: -p.relY, 
                // Flip Rotation direction (e.g. +45 becomes -45 relative to path)
                relRotation: -p.relRotation 
             }));
             
             variants.push({
                name: "Mirrored",
                segments: flippedSegments,
                punches: flippedPunches, 
                isMirrored: true
             });
        }

        // Search in target geometry
        for (let i = 0; i < targetSegments.length; i++) {
            if (coveredIndices.has(i)) continue;

            const startSeg = targetSegments[i];

            // Start Directions (Normal vs Reverse)
            // Reverse detection is necessary for detecting mirrored shapes (flipped chirality) 
            // and 180-degree rotated shapes in some contexts.
            // If symmetry is 'none', strictly traversing forward on a specific feature (oriented) 
            // might theoretically suffice, but to handle general matching robustly, checking both directions
            // is safer, relying on the Angle Check (below) to filter out unwanted orientations.
            const startDirections = (cycle.symmetry !== 'none') ? [false, true] : [false, true];

            for (const startReverse of startDirections) {
                if (coveredIndices.has(i)) break; 

                const startP1 = startReverse ? startSeg.p2 : startSeg.p1;
                const startP2 = startReverse ? startSeg.p1 : startSeg.p2;
                
                // Define Local Coordinate System for this candidate match
                const baseAngle = Math.atan2(startP2.y - startP1.y, startP2.x - startP1.x);
                const origin = startP1;

                // --- STRICT ANGLE CHECK FOR SYMMETRY CONTROL ---
                const cycleAngleDeg = (cycle.baseAngle || 0) * 180 / Math.PI;
                const matchAngleDeg = baseAngle * 180 / Math.PI;
                
                for (const variant of variants) {
                    if (coveredIndices.has(i)) break;

                    // 1. Angle Filter based on Symmetry Mode
                    if (!variant.isMirrored) {
                        // Original Variant (Rotation Group)
                        const diff = normalizeAngle(matchAngleDeg - cycleAngleDeg);
                        
                        if (cycle.symmetry === 'none') {
                             // Strict: diff ~ 0. Prevents matching 180 deg rotated features (e.g. Bottom-Right corner)
                             if (Math.abs(diff) > TOL_ANG) continue;
                        } else if (cycle.symmetry === 'full') {
                             // Full: Allow 0 and 180 rotations
                             if (Math.abs(diff) > TOL_ANG && Math.abs(diff - 180) > TOL_ANG && Math.abs(diff + 180) > TOL_ANG) continue;
                        } else {
                             // Horizontal/Vertical (Original variant)
                             // Usually implies strict orientation for the un-mirrored instances
                             if (Math.abs(diff) > TOL_ANG) continue;
                        }
                    } else {
                        // Mirrored Variant (Reflection Group)
                        // Verify if the angle matches a valid reflection for the active symmetry
                        let targetAngles: number[] = [];
                        
                        // Mirror Y (Horizontal): Angle -> -Angle
                        if (cycle.symmetry === 'horizontal' || cycle.symmetry === 'full') targetAngles.push(-cycleAngleDeg);
                        
                        // Mirror X (Vertical): Angle -> 180 - Angle
                        if (cycle.symmetry === 'vertical' || cycle.symmetry === 'full') targetAngles.push(180 - cycleAngleDeg);
                        
                        const matchesAny = targetAngles.some(t => Math.abs(normalizeAngle(matchAngleDeg - t)) < TOL_ANG);
                        if (!matchesAny) continue;
                    }

                    const patSegs = variant.segments;
                    const firstPat = patSegs[0];

                    // --- 2. Check FIRST Segment Match ---
                    if (startSeg.type !== firstPat.type) continue;
                    
                    const actualLen = dist(startP1, startP2);
                    if (!matchesVal(actualLen, firstPat.length, TOL_LEN)) continue;
                    
                    // Arc Check (First Segment)
                    if (firstPat.type === 'arc') {
                        if (!startSeg.radius || !firstPat.radius || !matchesVal(startSeg.radius, firstPat.radius, TOL_LEN)) continue;
                        
                        // Strict Large Arc Check
                        let isActualLarge = false;
                        if (startSeg.originalEntity && startSeg.originalEntity.type === 'ARC') {
                            let sweep = startSeg.originalEntity.endAngle - startSeg.originalEntity.startAngle;
                            if (sweep < 0) sweep += 360;
                            isActualLarge = sweep > 180;
                        }
                        
                        if (firstPat.largeArc !== undefined && isActualLarge !== firstPat.largeArc) {
                            continue;
                        }

                        if (firstPat.arcCenterLeft !== undefined && startSeg.center) {
                            const isActualLeft = isCenterLeft(startP1, startP2, startSeg.center);
                            const expectedLeft = firstPat.arcCenterLeft;

                            if (isActualLeft !== expectedLeft) {
                                continue;
                            }
                        }
                    }

                    // --- 3. Check Chain Continuity ---
                    const matchedIndices = [i];
                    let currentEndpoint = startP2;
                    let matchFound = true;

                    for (let k = 1; k < patSegs.length; k++) {
                        const patSeg = patSegs[k];
                        let foundNextIndex = -1;
                        let nextReverse = false;

                        for(let t=0; t<targetSegments.length; t++) {
                            if (matchedIndices.includes(t) || coveredIndices.has(t)) continue;
                            const candidate = targetSegments[t];
                            
                            if (candidate.type !== patSeg.type) continue;
                            if (!matchesVal(dist(candidate.p1, candidate.p2), patSeg.length, TOL_LEN)) continue;
                            
                            // Check endpoints connectivity
                            let isReverseCand = false;
                            if (distSq(currentEndpoint, candidate.p1) < TOL_CONN_SQ) {
                                isReverseCand = false;
                            } else if (distSq(currentEndpoint, candidate.p2) < TOL_CONN_SQ) {
                                isReverseCand = true;
                            } else {
                                continue; 
                            }

                            const candP1 = isReverseCand ? candidate.p2 : candidate.p1;
                            const candP2 = isReverseCand ? candidate.p1 : candidate.p2;

                            let isGeoMatch = false;

                            if (patSeg.type === 'line') {
                                const candAngle = Math.atan2(candP2.y - candP1.y, candP2.x - candP1.x);
                                const diff = normalizeAngle((candAngle - baseAngle) * 180 / Math.PI);
                                
                                if (matchesVal(diff, patSeg.angleChange, TOL_ANG)) {
                                    isGeoMatch = true;
                                }
                            } else if (patSeg.type === 'arc') {
                                if (candidate.radius && patSeg.radius && matchesVal(candidate.radius, patSeg.radius, TOL_LEN)) {
                                    // Large Arc Check
                                    let isCandLarge = false;
                                    if (candidate.originalEntity && candidate.originalEntity.type === 'ARC') {
                                        let sweep = candidate.originalEntity.endAngle - candidate.originalEntity.startAngle;
                                        if (sweep < 0) sweep += 360;
                                        isCandLarge = sweep > 180;
                                    }
                                    if (patSeg.largeArc !== undefined && isCandLarge !== patSeg.largeArc) {
                                        continue;
                                    }

                                    if (patSeg.arcCenterLeft !== undefined && candidate.center) {
                                        const isActualLeft = isCenterLeft(candP1, candP2, candidate.center);
                                        const expectedLeft = patSeg.arcCenterLeft;

                                        if (isActualLeft === expectedLeft) {
                                            isGeoMatch = true;
                                        }
                                    }
                                }
                            }

                            if (isGeoMatch) {
                                foundNextIndex = t;
                                nextReverse = isReverseCand;
                                break;
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
                        debugLog(`MATCH FOUND! Segs: [${matchedIndices.join(', ')}]. Var: ${variant.name}, StartRev: ${startReverse}`);
                        
                        variant.punches.forEach(p => {
                            const rx = p.relX * Math.cos(baseAngle) - p.relY * Math.sin(baseAngle);
                            const ry = p.relX * Math.sin(baseAngle) + p.relY * Math.cos(baseAngle);
                            const wx = origin.x + rx;
                            const wy = origin.y + ry;
                            const wr = p.relRotation + (baseAngle * 180 / Math.PI);

                            resultPunches.push({
                                toolId: p.toolId,
                                x: wx,
                                y: wy,
                                rotation: wr,
                                lineId: `teach_${cycle.name}_${generateId()}`
                            });
                        });

                        matchedIndices.forEach(idx => markCovered(idx));
                        break; 
                    }
                }
            }
        }
        debugGroupEnd();
    });

    debugGroupEnd();
    return { matches: resultPunches, coveredSegmentIndices: coveredIndices };
};
