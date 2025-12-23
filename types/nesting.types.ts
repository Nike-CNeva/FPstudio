
/**
 * РАСКРОЙ (NESTING)
 * Ответственность: Описание заготовок (листов), настроек алгоритма и итоговых карт раскроя.
 */
import { PlacedPart, NestingConstraints } from './parts.types';
import { SheetUtilizationStrategy } from './enums.types';

export interface SheetStock {
    id: string;
    width: number;
    height: number;
    quantity: number;
    material: string;
    thickness: number;
    cost: number;
    useInNesting: boolean;
}

export interface NestingSettings {
  availableSheets: SheetStock[];
  activeSheetId: string | null;
  
  defaultMaterial: string;
  defaultThickness: number;

  partSpacingX: number;
  partSpacingY: number;
  sheetMarginTop: number;
  sheetMarginBottom: number;
  sheetMarginLeft: number;
  sheetMarginRight: number;
  nestingDirection: number; 
  clampPositions: number[];
  nestUnderClamps: boolean;
  loadingStopId: number; 
  
  utilizationStrategy: SheetUtilizationStrategy;
  useCommonLine: boolean;
  vertexSnapping: boolean; 
  nestAsRectangle: boolean; 
}

export interface ScheduledPart {
    partId: string;
    quantity: number;
    priority?: number; 
    nesting: NestingConstraints;
}

export interface NestResultSheet {
    id: string;
    sheetName: string;
    stockSheetId: string;
    width: number;
    height: number;
    material: string;
    thickness: number;
    placedParts: PlacedPart[];
    usedArea: number; 
    scrapPercentage: number;
    partCount: number;
    quantity: number; 
}

export interface NestLayout {
  id: string;
  name: string;
  customer?: string;
  workOrder?: string;
  settings: NestingSettings;
  sheets: NestResultSheet[];
  scheduledParts: ScheduledPart[];
}
