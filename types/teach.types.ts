
import { CycleSymmetry } from './enums.types';

/**
 * Domain: Teach Cycles.
 * Pattern definitions for automated tool placement learning.
 */

export interface PatternSegment {
    type: 'line' | 'arc';
    length: number; // Chord Length for arc / Distance between p1 and p2
    angleChange: number; // Angle relative to previous segment (or 0 for first)
    // For arcs
    radius?: number; // Needed to distinguish arcs from lines
    sweepAngle?: number;
    arcCenterLeft?: boolean; // True if center is to the Left of vector P1->P2 (CCW turn)
    largeArc?: boolean; // True if arc spans > 180 degrees
}

export interface PatternPunch {
    toolId: string;
    // Relative coordinates to the start of the first segment
    relX: number;
    relY: number;
    relRotation: number;
}

export interface TeachCycle {
    id: string;
    name: string;
    symmetry: CycleSymmetry;
    segments: PatternSegment[];
    punches: PatternPunch[];
    baseAngle?: number; // Normalized absolute angle of the first segment (in radians)
}
