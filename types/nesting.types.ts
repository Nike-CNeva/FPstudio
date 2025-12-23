
import { PlacedPart, NestingConstraints } from './parts.types';
import { SheetUtilizationStrategy } from './enums.types';

/**
 * Domain: Nesting Operations and Sheet Management.
 * Types for sheet stocks, nesting settings, and resulting layouts.
 */

export interface SheetStock {
    id: string;
    width: number;
    height: number;
    quantity: number; // "Reserved" count
    material: string;
    thickness: number;
    cost: number;
    useInNesting: boolean; // For 'selected-only' strategy
}

export interface NestingSettings {
  availableSheets: SheetStock[];
  activeSheetId: string | null; // Currently selected for editing or primary use
  
  // Global Sheet Params
  defaultMaterial: string;
  defaultThickness: number;

  // General Params
  partSpacingX: number;
  partSpacingY: number;
  sheetMarginTop: number;
  sheetMarginBottom: number;
  sheetMarginLeft: number;
  sheetMarginRight: number;
  nestingDirection: number; // 0-8 for a 3x3 grid, representing start corner/edge
  clampPositions: number[];
  nestUnderClamps: boolean;
  loadingStopId: number; // 0 = Auto, 1, 2, 3, 4
  
  // Strategy
  utilizationStrategy: SheetUtilizationStrategy;

  // Optimization
  useCommonLine: boolean;
  vertexSnapping: boolean; // Auto alignment
  
  // New Flag
  nestAsRectangle: boolean; 
}

export interface ScheduledPart {
    partId: string;
    quantity: number;
    priority?: number; 
    nesting: NestingConstraints; // Modified to store full nesting config per scheduled item
}

export interface NestResultSheet {
    id: string;
    sheetName: string; // e.g. "Sheet 1"
    stockSheetId: string;
    width: number;
    height: number;
    material: string;
    thickness: number;
    placedParts: PlacedPart[];
    usedArea: number; // Percentage 0-100
    scrapPercentage: number;
    partCount: number;
    quantity: number; // How many of this identical sheet layout
}

export interface NestLayout {
  id: string;
  name: string;
  customer?: string;
  workOrder?: string;
  settings: NestingSettings;
  sheets: NestResultSheet[]; // Multiple resulting sheets
  scheduledParts: ScheduledPart[];
}
