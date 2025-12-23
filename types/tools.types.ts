
import { ToolShape, PunchType } from './enums.types';

/**
 * Domain: Tools and Turret Layouts.
 * Includes tool definitions, turret stations, and placed tool instances.
 */

export interface Tool {
  id: string;
  name: string;
  
  // Basic Info
  shape: ToolShape;
  width: number; // X-dimension
  height: number; // Y-dimension
  cornerRadius: number;
  toolSize: string; // 'A', 'B', 'C', 'D'
  description: string;
  customPath?: string; // For Special tools loaded via DXF
  
  punchType: PunchType;

  // Turret Info
  stationNumber?: number; // 1-24 typically
  stationType?: string; // 'B', 'C', 'D', 'MT', etc.
  mtIndex?: number; // 1-20 if inside a MultiTool
  defaultRotation?: number;

  // Dies
  dies: {
    clearance: number;
  }[];
  
  // Settings
  stripperHeight: number;
  punchDepth: number;
  ramSpeed: number;
  acceleration: number;
  operatingMode: string; // e.g. 'PUNCHING'
  
  // Miscellaneous
  nibblingPriority: number;
  punchPriority: number;
  punchCount: number;
  isAutoIndex: boolean;
  
  // Key/slots
  keyAngles: number[];
  
  // Optimizing
  optimizingGroup: string;
  awayFromClamps: boolean;
  motionPrinciple: string; // e.g. 'Minimum distance'

  // Close to clamp tool
  relievedStripper: '1-sided' | '2-sided' | 'none';
  yProtectionArea: number;
  zoneWidth: number;

  // Extra
  onlyForC5: boolean;
}

export interface StationConfig {
    id: number;
    type: string; // 'A', 'B', 'C', 'D', 'MT'
    isAutoIndex: boolean;
}

export interface TurretLayout {
    id: string;
    name: string;
    // Mapping: Station Number -> Tool ID (or null)
    toolsSnapshot: Tool[]; 
    stations: StationConfig[];
}

export interface PlacedTool {
  id: string;
  toolId: string;
  x: number;
  y: number;
  rotation: number;
  
  // Grouping for script generation
  lineId?: string; // If present, this tool is part of a nibble line with this ID
}
