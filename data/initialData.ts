
import { Tool, Part, NestLayout, ToolShape, PunchType, TurretLayout, StationConfig, ParametricScript } from '../types';
import { generateId } from '../utils/helpers';

const createDefaultTool = (overrides: Partial<Tool>): Tool => ({
  id: generateId(),
  name: 'New Tool',
  shape: ToolShape.Circle,
  width: 10,
  height: 10,
  cornerRadius: 0,
  toolSize: 'B',
  description: '',
  punchType: PunchType.General,
  dies: [{ clearance: 0.14 }],
  stripperHeight: 0,
  punchDepth: 0,
  ramSpeed: 0,
  acceleration: 0,
  operatingMode: 'PUNCHING',
  nibblingPriority: 5,
  punchPriority: 5,
  punchCount: 1,
  isAutoIndex: false,
  keyAngles: [0, 90, 180, 270],
  optimizingGroup: 'MULTI_1',
  awayFromClamps: false,
  motionPrinciple: 'Minimum distance',
  relievedStripper: 'none',
  yProtectionArea: 47,
  zoneWidth: 25,
  onlyForC5: false,
  stationNumber: 0,
  stationType: 'B',
  ...overrides,
});


export const initialTools: Tool[] = [
    // Station MT Tools (Starting)
    createDefaultTool({
        name: 'RND_2_MT',
        shape: ToolShape.Circle,
        width: 2,
        height: 2,
        punchType: PunchType.Starting,
        stationNumber: 1, // MultiTool Station
        mtIndex: 1,       // Slot 1
        stationType: 'MT',
        toolSize: 'A', 
        dies: [{ clearance: 0.2 }]
    }),
    createDefaultTool({
        name: 'RND_4_MT',
        shape: ToolShape.Circle,
        width: 4,
        height: 4,
        punchType: PunchType.Starting,
        stationNumber: 1, // MultiTool Station
        mtIndex: 2,       // Slot 2
        stationType: 'MT',
        toolSize: 'A',
        dies: [{ clearance: 0.2 }]
    }),
    
    // OBR Tools (Horizontal Default: W > H)
    createDefaultTool({
        name: 'OBR_5X10',
        shape: ToolShape.Oblong,
        width: 10,
        height: 5,
        punchType: PunchType.Starting,
        stationNumber: 3,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.2 }]
    }),
    
    // RECT Tools (Horizontal Default: W > H)
    createDefaultTool({
        name: 'RECT_3X10',
        shape: ToolShape.Rectangle,
        width: 10,
        height: 3,
        punchType: PunchType.General,
        stationNumber: 4,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.2 }]
    }),
    createDefaultTool({
        name: 'RECT_5X30',
        shape: ToolShape.Rectangle,
        width: 30,
        height: 5,
        punchType: PunchType.General,
        stationNumber: 5,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.2 }]
    }),

    // Contour Tools
    createDefaultTool({
        name: 'RECT_5X50',
        shape: ToolShape.Rectangle,
        width: 50,
        height: 5,
        punchType: PunchType.Contour,
        stationNumber: 12, // Explicitly C station
        stationType: 'C',
        toolSize: 'C',
        dies: [{ clearance: 0.2 }]
    }),

    createDefaultTool({
        name: 'RECT_5X80',
        shape: ToolShape.Rectangle,
        width: 80,
        height: 5,
        punchType: PunchType.Contour,
        stationNumber: 17, // Explicitly D station
        stationType: 'D',
        toolSize: 'D',
        dies: [{ clearance: 0.2 }]
    }),
];

const generateDefaultStations = (): StationConfig[] => {
    return Array.from({ length: 20 }, (_, i) => {
        const id = i + 1;
        let type = 'B';
        
        // Explicit station mapping
        switch (id) {
            case 1:
                type = 'MT';
                break;
            case 12:
            case 16:
                type = 'C';
                break;
            case 17:
            case 18:
                type = 'D';
                break;
            default:
                type = 'B';
                break;
        }

        // Auto index logic (example distribution)
        const isAutoIndex = type !== 'MT' && (id % 2 === 0);
        
        return { id, type, isAutoIndex };
    });
};

export const initialTurretLayouts: TurretLayout[] = [
    {
        id: 'default_layout',
        name: 'Стандартный набор (Default)',
        toolsSnapshot: JSON.parse(JSON.stringify(initialTools)),
        stations: generateDefaultStations()
    }
];

export const initialParts: Part[] = [];

export const DEFAULT_PARAMETRIC_SCRIPT = `
// Initialization
Part.SetMaterial("Zink", 0.7000);

// ---------------------------------------------------
// GEOMETRY
// ---------------------------------------------------

// Inside hole:
Part.StartContour(28.5000, Width - 8.0000);
Part.LineTo(33.5000, Width - 8.0000);
Part.ArcTo(33.5000, Width - 5.5000, 33.5000, Width - 3.0000, false);
Part.LineTo(28.5000, Width - 3.0000);
Part.ArcTo(28.5000, Width - 5.5000, 28.5000, Width - 8.0000, false);

// Outside contour:
Part.StartContour(0.0000, 48.0000);
Part.LineTo(0.0000, Width - 34.5000);
Part.LineTo(20.0000, Width - 34.5000);
Part.ArcTo(21.0000, Width - 34.5000, 21.0000, Width - 33.5000, false);
Part.LineTo(21.0000, Width);
Part.LineTo(Length - 21.0000, Width);
Part.LineTo(Length - 21.0000, Width - 33.5000);
Part.ArcTo(Length - 21.0000, Width - 34.5000, Length - 20.0000, Width - 34.5000, false);
Part.LineTo(Length, Width - 34.5000);
Part.LineTo(Length, 48.0000);
Part.LineTo(Length - 8.5000, 48.0000);
Part.LineTo(Length - 8.5000, 33.0000);
Part.LineTo(Length - 21.0000, 33.0000);
Part.ArcTo(Length - 22.0000, 33.0000, Length - 22.0000, 32.0000, false);
Part.LineTo(Length - 22.0000, 24.0000);
Part.LineTo(Length - 81.0000, 24.0000);
Part.LineTo(Length - 81.0000, 0.0000);
Part.LineTo(Length / 2 + 60.0000, 0.0000);
Part.LineTo(Length / 2 + 60.0000, 24.0000);
Part.LineTo(Length / 2 - 60.0000, 24.0000);
Part.LineTo(Length / 2 - 60.0000, 0.0000);
Part.LineTo(81.0000, 0.0000);
Part.LineTo(81.0000, 24.0000);
Part.LineTo(22.0000, 24.0000);
Part.LineTo(22.0000, 32.0000);
Part.ArcTo(22.0000, 33.0000, 21.0000, 33.0000, false);
Part.LineTo(8.5000, 33.0000);
Part.LineTo(8.5000, 48.0000);
Part.LineTo(0.0000, 48.0000);

// ---------------------------------------------------
// TOOLING
// ---------------------------------------------------

// Example Tooling
Part.Strike("RND_2_MT 3 32128", 21.0000, Width - 34.5000, 0.00);
Part.Strike("RND_2_MT 3 32128", Length - 21.0000, Width - 34.5000, 0.00);
Part.Strike("RND_2_MT 3 32128", 22.0000, 33.0000, 0.00);
Part.Strike("RND_2_MT 3 32128", Length - 22.0000, 33.0000, 0.00);
Part.NibbleLine("RECT_5X30 3 32128", 18.5000, Width - 19.5000, 18.5000, Width - 16.0000, 90.00, 3.5000);
`;

export const initialScripts: ParametricScript[] = [
    {
        id: 'script_demo',
        name: 'Пример коробки (Demo Box)',
        defaultWidth: 600,
        defaultHeight: 400,
        updatedAt: Date.now(),
        code: DEFAULT_PARAMETRIC_SCRIPT
    }
];

const defaultSheetId = generateId();

export const initialNests: NestLayout[] = [
    {
        id: generateId(),
        name: 'Раскрой по-умолчанию',
        sheets: [], // Initially empty
        scheduledParts: [],
        settings: {
            availableSheets: [
                { id: defaultSheetId, width: 2500, height: 1250, material: 'St-3', thickness: 1.0, quantity: 100 }
            ],
            activeSheetId: defaultSheetId,
            partSpacingX: 5,
            partSpacingY: 5,
            sheetMarginTop: 10,
            sheetMarginBottom: 10,
            sheetMarginLeft: 10,
            sheetMarginRight: 10,
            nestingDirection: 6, // 6 = Top-left (Standard)
            clampPositions: [300, 1000, 2000],
            nestUnderClamps: false,
            useCommonLine: false,
            vertexSnapping: true
        }
    }
];
