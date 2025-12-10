
import { Point } from '../types';

// --- CONSTANTS ---
export const TOLERANCE = {
    MATCH: 0.1,
    GEO: 1.0,
    ANGLE: 0.01,
    TINY_LENGTH: 0.1
};

export const CONSTANTS = {
    DEFAULT_DIE_CLEARANCE: 0.2,
    ARC_PROBE_OFFSET: 0.1
};

// --- MATH HELPERS ---

export const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);
export const radiansToDegrees = (radians: number) => radians * (180 / Math.PI);

/**
 * Denormalize point from SVG coordinates back to Raw DXF coordinates for geometric checks.
 * Maps strictly by offset.
 */
export const denormalizePoint = (p: Point, bbox: { minX: number, minY: number }) => ({
    x: p.x + bbox.minX,
    y: p.y + bbox.minY
});

/**
 * Calculates optimal step size for nibbling an arc to maintain a maximum scallop height.
 */
export const calculateScallopStep = (toolRadius: number, scallopHeight: number): number => {
    const R = toolRadius;
    const h = scallopHeight;
    
    if (h <= 0) return R; 
    
    const term = 2 * R * h - h * h;
    if (term <= 0) return R * 0.5; 
    
    return 2 * Math.sqrt(term);
};

export const getPointKey = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
export const getHitKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
