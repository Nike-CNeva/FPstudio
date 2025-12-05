
// FIX: Moved Point and DXF entity type definitions here to resolve circular dependencies.
export interface Point {
  x: number;
  y: number;
}

export interface DxfLwPolyline {
  type: 'LWPOLYLINE';
  vertices: Point[];
  closed: boolean;
}

export interface DxfCircle {
  type: 'CIRCLE';
  center: Point;
  radius: number;
}

export interface DxfArc {
  type: 'ARC';
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface DxfLine {
  type: 'LINE';
  start: Point;
  end: Point;
}

export type DxfEntity = DxfLwPolyline | DxfCircle | DxfArc | DxfLine;

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

  // Turret Info (New from NCexpress analysis)
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

export interface PartGeometry {
  path: string; // SVG path data
  width: number;
  height: number;
  entities: DxfEntity[]; // Store original entities for snapping calculations
  bbox: { minX: number; minY: number; maxX: number; maxY: number; }; // Bounding box of original geometry
}

// Expanded based on Image 10 "New Part"
export interface PartMaterial {
    code: string; // e.g. "Alum", "St-3", "Zink"
    thickness: number;
    dieClearance: number;
}

export interface NestingConstraints {
    allow0_180: boolean;
    allow90_270: boolean;
    initialRotation: number;
    commonLine: boolean;
    canMirror: boolean;
}

export interface ParametricScript {
    id: string;
    name: string;
    code: string;
    defaultWidth: number;
    defaultHeight: number;
    updatedAt: number;
}

export interface PartProfile {
    type: 'flat' | 'L' | 'U';
    orientation: 'vertical' | 'horizontal';
    dims: {
        a: number; // Flange A (Left or Top)
        b: number; // Web/Flange B (Center or Bottom/Right)
        c: number; // Flange C (Right or Bottom for U)
    };
}

export interface Part {
  id:string;
  name: string;
  geometry: PartGeometry;
  punches: PlacedTool[];
  
  // New properties from NCexpress
  material: PartMaterial;
  nesting: NestingConstraints;
  
  // Updated fields requested by user
  faceWidth: number;
  faceHeight: number;
  
  // Profile Detection
  profile?: PartProfile;

  // Parameterization
  script?: string; // JavaScript code for generating this part

  // Metadata
  customer?: string;
  workOrder?: string;
}

export interface PlacedPart {
  id: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface SheetStock {
    id: string;
    width: number;
    height: number;
    quantity: number; // "Reserved" count
    material: string;
    thickness: number;
    cost: number;
}

export enum SheetUtilizationStrategy {
    ListedOrder = 'listed-order',
    Smallest = 'smallest',
    BestFit = 'best-fit'
}

export interface NestingSettings {
  availableSheets: SheetStock[];
  activeSheetId: string | null; // Currently selected for editing or primary use
  
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
  
  // Strategy
  utilizationStrategy: SheetUtilizationStrategy;

  // Optimization
  useCommonLine: boolean;
  vertexSnapping: boolean; // Auto alignment
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

export enum AppMode {
  PartEditor = 'part-editor',
  PartLibrary = 'part-library', 
  ScriptLibrary = 'script-library', 
  Nesting = 'nesting',
  ToolLibrary = 'tool-library',
  TurretSetup = 'turret-setup',
  MachineSetup = 'machine-setup', // New mode for Machine Params
}

// Manual Punching
export enum ManualPunchMode {
  Punch = 'punch',
  Nibble = 'nibble',
  Destruct = 'destruct',
}

// Expanded based on Image 8 "Nibble properties"
export interface NibbleSettings {
  extensionStart: number; // e1
  extensionEnd: number;   // e2
  minOverlap: number;     // v
  hitPointMode: 'offset' | 'centerLine';
  toolPosition: 'long' | 'short';
}

export interface DestructSettings {
    overlap: number;
    scallop: number;
    notchExpansion: number;
}

// --- Teach Cycle Types ---

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

export type CycleSymmetry = 'none' | 'horizontal' | 'vertical' | 'full';

export interface TeachCycle {
    id: string;
    name: string;
    symmetry: CycleSymmetry;
    segments: PatternSegment[];
    punches: PatternPunch[];
    baseAngle?: number; // Normalized absolute angle of the first segment (in radians)
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
    microJointType: 'vertical' | 'horizontal' | 'all'; // New requirement
    microJointLength: number; // "Micro-joint length"
    microJointDistance: number; // "Maximum micro-joint distance"
}

// --- MACHINE & OPTIMIZER SETTINGS ---

export interface MachineSettings {
    name: string;
    // Travel Limits
    xTravelMax: number;
    xTravelMin: number;
    yTravelMax: number;
    yTravelMin: number;
    
    // Clamp Protection
    clampProtectionZoneX: number;
    clampProtectionZoneY: number;
    deadZoneY: number; // e.g. -40mm from clamps

    // Speeds (Informational for generic G-code, but used for Time estimation)
    maxSlewSpeed: number; // m/min
    turretRotationSpeed: number; // RPM
}

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

export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}
