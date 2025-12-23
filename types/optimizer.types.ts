
/**
 * Domain: Path Optimization and Post-Processing.
 * Types for sequence calculation and auto-punch generation.
 */

export interface OptimizerSettings {
    toolSequence: 'global-station' | 'part-by-part';
    pathOptimization: 'shortest-path' | 'x-axis' | 'y-axis'; // Updated
    startCorner: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
    sheetUnloadMode: 'manual' | 'automatic';
    
    // Updated Logic
    anglePriority: '0-90' | '90-0'; // Logic for angle sorting in Scan modes
    
    // G-Code Options
    useG76LinearPatterns: boolean; // Use G76 for lines
}

export interface PunchOp {
    type?: 'single' | 'move'; // 'move' for explicit rapid, 'single' for hit
    toolT?: number;
    toolId: string;
    x: number;
    y: number;
    rotation: number; 
    isToolChange?: boolean;
    description?: string; // Debug info
    lineId?: string; // Grouping ID for nibbling lines
    sourcePunchId?: string; // ID of the original punch object (from library part)
    compositeId?: string; // UNIQUE ID for this specific placed punch: `${placedPartId}_${punchId}`
}

export interface LinearPunchSettings {
    startOffset: number;
    endOffset: number;
    minOverlap: number;
}

export interface AreaNibblingSettings {
    overlapX: number;
    overlapY: number;
}

export interface AutoPunchSettings {
    // Tool Library Source
    toolSourceType: 'library' | 'turret';
    turretLayoutId?: string;

    // General
    useTeachCycles: boolean; // "Use teach cycles"

    // Punching/Nibbling Properties
    extension: number; // "Extension"
    overlap: number; // "Overlap length"
    scallopHeight: number; // "Scallop height"
    vertexTolerance: number; // "Vertex tolerance"

    // Tool utilization
    minToolUtilization: number; // "Minimum % of tool utilization"

    // Single hit tolerance
    toleranceRound: number; // "Round & Obround"
    toleranceRectLength: number; // "Rectangle length"
    toleranceRectWidth: number; // "Rectangle width"
    
    // Micro-joints
    microJointsEnabled: boolean; // "Use external micro-joints"
    microJointType: 'vertical' | 'horizontal' | 'auto'; // Updated from 'all' to 'auto'
    microJointLength: number; // "Micro-joint length"
    microJointDistance: number; // "Maximum micro-joint distance"
}
