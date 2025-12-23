
/**
 * Global application enums and constants.
 * Contains core system modes and fixed value selections.
 */

export enum AppMode {
  PartEditor = 'part-editor',
  PartLibrary = 'part-library', 
  ScriptLibrary = 'script-library', 
  Nesting = 'nesting',
  ToolLibrary = 'tool-library',
  TurretSetup = 'turret-setup',
  MachineSetup = 'machine-setup',
}

export enum ToolShape {
  Circle = 'circle',
  Square = 'square',
  Rectangle = 'rectangle',
  Oblong = 'oblong',
  Special = 'special',
}

export enum PunchType {
  General = 'general',
  Contour = 'contour',
  Starting = 'starting',
  Finishing = 'finishing',
}

export enum ManualPunchMode {
  Punch = 'punch',
  Nibble = 'nibble',
  Destruct = 'destruct',
}

export enum PlacementReference {
  Center = 'center',
  Edge = 'edge',
}

export enum PlacementSide {
  Outside = 'outside',
  Inside = 'inside',
}

export enum SnapMode {
  Off = 'off',
  Vertex = 'vertex',
  SegmentCenter = 'segment-center',
  ClosestPoint = 'closest-point',
  ShapeCenter = 'shape-center',
}

export enum SheetUtilizationStrategy {
  FirstOnly = 'first-only',
  ListedOrder = 'listed-order',
  SelectedOnly = 'selected-only',
  SmallestFirst = 'smallest-first',
  BestFit = 'best-fit',
  AutoCalculation = 'auto-calculation'
}

export type CycleSymmetry = 'none' | 'horizontal' | 'vertical' | 'full';
