


import { TeachCycle, Part, PlacedTool, Tool, Point, CycleSymmetry, PatternSegment, PatternPunch } from '../types';
import { generateId } from '../utils/helpers';
import { ProcessedGeometry } from './geometry';

// Helper: Distance squared
const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
const dist = (p1: Point, p2: Point) => Math.sqrt(distSq(p1, p2));

/**
 * Normalizes a selection of geometry and punches into a generic Pattern.
 * The first segment defines the local coordinate system (Origin at P1, X-axis along P1->P2).
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

    // 1. Sort segments to ensure topological continuity
    // Simple heuristic: Find the chain.
    const rawSegments = selectedSegmentIndices.map(idx => processedGeometry.segments[idx]);
    
    // We assume the user selected a connected chain. If not, this simple logic takes the order of selection or index.
    // For robust chaining, we'd need a pathfinding algo here. Let's assume contiguous selection for now.
    // We normalize everything relative to the FIRST selected segment.
    
    const baseSeg = rawSegments[0];
    const origin = baseSeg.p1;
    
    // Vector of base segment
    const dx = baseSeg.p2.x - baseSeg.p1.x;
    const dy = baseSeg.p2.y - baseSeg.p1.y;
    const baseLen = Math.sqrt(dx*dx + dy*dy);
    const baseAngle = Math.atan2(dy, dx); // Radians

    // Transform function: World -> Local Pattern Space
    const toLocal = (p: Point, rot: number = 0): {x: number, y: number, r: number} => {
        // Translate to Origin
        const tx = p.x - origin.x;
        const ty = p.y - origin.y;
        // Rotate by -baseAngle
        const rx = tx * Math.cos(-baseAngle) - ty * Math.sin(-baseAngle);
        const ry = tx * Math.sin(-baseAngle) + ty * Math.cos(-baseAngle);
        return { x: rx, y: ry, r: rot - (baseAngle * 180 / Math.PI) };
    };

    // 2. Build Pattern Segments
    const patternSegments: PatternSegment[] = [];
    
    // We store segments as sequence of Type, Length, and Relative Angle change from previous
    // For matching, it's easier to store them as a canonical list.
    // We store: Type, Length, and Angle relative to BASE SEGMENT.
    
    rawSegments.forEach((seg, i) => {
        const len = dist(seg.p1, seg.p2);
        const segAngle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);
        let angleDiff = segAngle - baseAngle;
        
        // Normalize angle -PI to PI
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff <= -Math.PI) angleDiff += 2 * Math.PI;

        patternSegments.push({
            type: seg.type === 'arc' ? 'arc' : 'line',
            length: len,
            angleChange: angleDiff * 180 / Math.PI, // Store in degrees
            radius: seg.type === 'arc' ? seg.radius : undefined
        });
    });

    // 3. Build Pattern Punches
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
 */
export const findTeachCycleMatches = (
    partGeometry: ProcessedGeometry,
    teachCycles: TeachCycle[]
): { matches: Omit<PlacedTool, 'id'>[], coveredSegmentIndices: Set<number> } => {
    
    const resultPunches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    
    const TOL_LEN = 0.5; // mm tolerance for lengths
    const TOL_ANG = 2.0; // degree tolerance for angles

    const targetSegments = partGeometry.segments;

    // Helper: Compare two values with tolerance
    const matchesVal = (v1: number, v2: number, tol: number) => Math.abs(v1 - v2) < tol;

    teachCycles.forEach(cycle => {
        if (cycle.segments.length === 0) return;

        // Generate Symmetry Variants of the cycle
        // 1. Original
        const variants = [{ segments: cycle.segments, punches: cycle.punches, mirrorX: false, mirrorY: false }];
        
        if (cycle.symmetry === 'horizontal' || cycle.symmetry === 'full') {
            // Mirror Y (Flip vertically relative to pattern local X axis)
            // In local space: y -> -y, rotation -> -rotation
            variants.push({
                segments: cycle.segments.map(s => ({ ...s, angleChange: -s.angleChange })),
                punches: cycle.punches.map(p => ({ ...p, relY: -p.relY, relRotation: -p.relRotation })),
                mirrorX: false, mirrorY: true
            });
        }
        if (cycle.symmetry === 'vertical' || cycle.symmetry === 'full') {
             // Mirror X (Flip horizontally). x -> -x, rotation -> 180 - rot?
             // Mirroring X in 2D is tricky with rotation. 
             // Angle changes flip relative to base.
             variants.push({
                segments: cycle.segments.map(s => ({ ...s, angleChange: -s.angleChange })), // Angles flip in mirror
                punches: cycle.punches.map(p => ({ ...p, relX: -p.relX, relRotation: -p.relRotation })), 
                mirrorX: true, mirrorY: false
             });
        }

        // Search for this pattern in the target geometry
        // Brute force: Try starting at every segment
        for (let i = 0; i < targetSegments.length; i++) {
            if (coveredIndices.has(i)) continue;

            // Try to match chain starting at i
            for (const variant of variants) {
                const patSegs = variant.segments;
                
                // Check first segment length & type
                const firstTarget = targetSegments[i];
                if (firstTarget.type !== (patSegs[0].type === 'arc' ? 'arc' : 'line')) continue;
                if (!matchesVal(dist(firstTarget.p1, firstTarget.p2), patSegs[0].length, TOL_LEN)) continue;
                if (patSegs[0].type === 'arc' && patSegs[0].radius) {
                    if (!firstTarget.radius || !matchesVal(firstTarget.radius, patSegs[0].radius, TOL_LEN)) continue;
                }

                let matchFound = true;
                const matchedIndices = [i];
                
                // We need to trace connectivity.
                // Simple version: Assumes connectivity in array order in target geometry.
                
                for (let k = 1; k < patSegs.length; k++) {
                    const nextTargetIdx = (i + k) % targetSegments.length;
                    const nextTarget = targetSegments[nextTargetIdx];
                    const patSeg = patSegs[k];

                    // Check Type
                    const expectedType = patSeg.type === 'arc' ? 'arc' : 'line';
                    if (nextTarget.type !== expectedType) {
                        matchFound = false; break;
                    }

                    // Check Length
                    if (!matchesVal(dist(nextTarget.p1, nextTarget.p2), patSeg.length, TOL_LEN)) {
                        matchFound = false; break;
                    }
                    
                    // Check Radius (for Arcs)
                    if (patSeg.type === 'arc' && patSeg.radius) {
                        if (!nextTarget.radius || !matchesVal(nextTarget.radius, patSeg.radius, TOL_LEN)) {
                             matchFound = false; break;
                        }
                    }

                    // Check Relative Angle
                    // Angle of nextTarget relative to firstTarget
                    const baseAngle = Math.atan2(firstTarget.p2.y - firstTarget.p1.y, firstTarget.p2.x - firstTarget.p1.x);
                    const currAngle = Math.atan2(nextTarget.p2.y - nextTarget.p1.y, nextTarget.p2.x - nextTarget.p1.x);
                    let diff = (currAngle - baseAngle) * 180 / Math.PI;
                    while (diff > 180) diff -= 360;
                    while (diff <= -180) diff += 360;

                    if (!matchesVal(diff, patSeg.angleChange, TOL_ANG)) {
                        matchFound = false; break;
                    }
                    matchedIndices.push(nextTargetIdx);
                }

                if (matchFound) {
                    // Match Confirmed! Apply Punches
                    // Transform Pattern Space -> World Space
                    // Origin = firstTarget.p1
                    // Base Angle = angle of firstTarget
                    const baseAngle = Math.atan2(firstTarget.p2.y - firstTarget.p1.y, firstTarget.p2.x - firstTarget.p1.x);
                    const origin = firstTarget.p1;

                    variant.punches.forEach(p => {
                        // Rotate
                        const rx = p.relX * Math.cos(baseAngle) - p.relY * Math.sin(baseAngle);
                        const ry = p.relX * Math.sin(baseAngle) + p.relY * Math.cos(baseAngle);
                        
                        // Translate
                        const wx = origin.x + rx;
                        const wy = origin.y + ry;
                        
                        // Rotation
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
                    // Move outer loop if we found a match to avoid overlapping matches on same segments?
                    // We continue to find other patterns, but these segments are now 'covered'.
                    break; // Break variant loop
                }
            }
        }
    });

    return { matches: resultPunches, coveredSegmentIndices: coveredIndices };
};
