
import { Tool, Part, NestLayout, ToolShape, PunchType, TurretLayout, StationConfig, ParametricScript, MachineSettings, OptimizerSettings, SheetUtilizationStrategy } from '../types';
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

// Helper for triangle path (equilateral)
const createTrianglePath = (s: number) => {
    const h = s * Math.sqrt(3) / 2;
    // Centered at 0,0
    return `M 0 ${-h/2} L ${s/2} ${h/2} L ${-s/2} ${h/2} Z`;
};

export const initialTools: Tool[] = [
    // --- Station 1 (MT - 24 Stations) ---
    // User Specification: 
    // t13 - 3.3
    // t24 - 2.5
    // t12 - 4
    // t23 - 2
    // t11 - 5

    createDefaultTool({
        name: 'RND_3.3_MT',
        shape: ToolShape.Circle,
        width: 3.3,
        height: 3.3,
        punchType: PunchType.General,
        stationNumber: 1,
        mtIndex: 13, // T13
        stationType: 'MT',
        toolSize: 'A',
        dies: [{ clearance: 0.12 }]
    }),
    createDefaultTool({
        name: 'RND_2.5_MT',
        shape: ToolShape.Circle,
        width: 2.5,
        height: 2.5,
        punchType: PunchType.General,
        stationNumber: 1,
        mtIndex: 24, // T24
        stationType: 'MT',
        toolSize: 'A',
        dies: [{ clearance: 0.1 }]
    }),
    createDefaultTool({
        name: 'RND_4_MT',
        shape: ToolShape.Circle,
        width: 4,
        height: 4,
        punchType: PunchType.General,
        stationNumber: 1,
        mtIndex: 12, // T12
        stationType: 'MT',
        toolSize: 'A',
        dies: [{ clearance: 0.32 }]
    }),
    createDefaultTool({
        name: 'RND_2_MT',
        shape: ToolShape.Circle,
        width: 2,
        height: 2,
        punchType: PunchType.Starting,
        stationNumber: 1,
        mtIndex: 23, // T23
        stationType: 'MT',
        toolSize: 'A',
        dies: [{ clearance: 0.2 }]
    }),
    createDefaultTool({
        name: 'RND_5_MT',
        shape: ToolShape.Circle,
        width: 5,
        height: 5,
        punchType: PunchType.General,
        stationNumber: 1,
        mtIndex: 11, // T11
        stationType: 'MT',
        toolSize: 'A',
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 2 (B) ---
    createDefaultTool({
        name: 'RND_3.6',
        shape: ToolShape.Circle,
        width: 3.6,
        height: 3.6,
        punchType: PunchType.General,
        stationNumber: 2,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 3 (Di - AutoIndex) ---
    createDefaultTool({
        name: 'RECT_5X80',
        shape: ToolShape.Rectangle,
        width: 80, 
        height: 5,
        punchType: PunchType.Contour,
        stationNumber: 3,
        stationType: 'D',
        toolSize: 'D',
        isAutoIndex: true,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 5 (Ci - AutoIndex) ---
    createDefaultTool({
        name: 'RECT_5X50',
        shape: ToolShape.Rectangle,
        width: 50,
        height: 5,
        punchType: PunchType.Contour,
        stationNumber: 5,
        stationType: 'C',
        toolSize: 'C',
        isAutoIndex: true,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 6 (B) ---
    createDefaultTool({
        name: 'RND_4.5',
        shape: ToolShape.Circle,
        width: 4.5,
        height: 4.5,
        punchType: PunchType.General,
        stationNumber: 6,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 7 (Bi - AutoIndex) ---
    createDefaultTool({
        name: 'RECT_5X30',
        shape: ToolShape.Rectangle,
        width: 30,
        height: 5,
        punchType: PunchType.General,
        stationNumber: 7,
        stationType: 'B',
        toolSize: 'B',
        isAutoIndex: true,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 9 (Bi - AutoIndex) ---
    createDefaultTool({
        name: 'RECT_3X10',
        shape: ToolShape.Rectangle,
        width: 10,
        height: 3,
        punchType: PunchType.General,
        stationNumber: 9,
        stationType: 'B',
        toolSize: 'B',
        isAutoIndex: true,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 10 (B) ---
    createDefaultTool({
        name: 'OBR_5X10',
        shape: ToolShape.Oblong,
        width: 10,
        height: 5,
        punchType: PunchType.General,
        stationNumber: 10,
        stationType: 'B',
        toolSize: 'B',
        defaultRotation: 90,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 11 (Bi - AutoIndex) ---
    createDefaultTool({
        name: 'OBR_1.8X20',
        shape: ToolShape.Oblong,
        width: 20,
        height: 1.8,
        punchType: PunchType.General,
        stationNumber: 11,
        stationType: 'B',
        toolSize: 'B',
        isAutoIndex: true,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 14 (B) ---
    createDefaultTool({
        name: 'OBR_5X10',
        shape: ToolShape.Oblong,
        width: 10,
        height: 5,
        punchType: PunchType.General,
        stationNumber: 14,
        stationType: 'B',
        toolSize: 'B',
        defaultRotation: 0,
        dies: [{ clearance: 0.2 }]
    }),

    // --- Station 15 (Dif - AutoIndex) - TR_IKLYA ---
    createDefaultTool({
        name: 'TR_IKLYA',
        shape: ToolShape.Special,
        width: 15,
        height: 15,
        customPath: createTrianglePath(15),
        punchType: PunchType.General,
        stationNumber: 15,
        stationType: 'D',
        toolSize: 'D',
        isAutoIndex: true,
        dies: [{ clearance: 0.3 }]
    }),

    // --- Station 16 (B) ---
    createDefaultTool({
        name: 'RND_8',
        shape: ToolShape.Circle,
        width: 8,
        height: 8,
        punchType: PunchType.General,
        stationNumber: 16,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.24 }]
    }),

    // --- Station 20 (B) ---
    createDefaultTool({
        name: 'RND_5.2',
        shape: ToolShape.Circle,
        width: 5.2,
        height: 5.2,
        punchType: PunchType.General,
        stationNumber: 20,
        stationType: 'B',
        toolSize: 'B',
        dies: [{ clearance: 0.3 }]
    }),
];

const generateDefaultStations = (): StationConfig[] => {
    return [
        { id: 1, type: 'MT', isAutoIndex: false },
        { id: 2, type: 'B', isAutoIndex: false },
        { id: 3, type: 'D', isAutoIndex: true },  // Di
        { id: 4, type: 'B', isAutoIndex: false },
        { id: 5, type: 'C', isAutoIndex: true },  // Ci
        { id: 6, type: 'B', isAutoIndex: false },
        { id: 7, type: 'B', isAutoIndex: true },  // Bi
        { id: 8, type: 'B', isAutoIndex: false },
        { id: 9, type: 'B', isAutoIndex: true },  // Bi
        { id: 10, type: 'B', isAutoIndex: false },
        { id: 11, type: 'B', isAutoIndex: true }, // Bi
        { id: 12, type: 'C', isAutoIndex: false },
        { id: 13, type: 'B', isAutoIndex: true }, // Bi
        { id: 14, type: 'B', isAutoIndex: false },
        { id: 15, type: 'D', isAutoIndex: true }, // Dif
        { id: 16, type: 'B', isAutoIndex: false },
        { id: 17, type: 'D', isAutoIndex: false },
        { id: 18, type: 'C', isAutoIndex: false },
        { id: 19, type: 'D', isAutoIndex: false },
        { id: 20, type: 'B', isAutoIndex: false },
    ];
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
        customer: '',
        workOrder: '',
        sheets: [], // Initially empty
        scheduledParts: [],
        settings: {
            availableSheets: [
                { id: defaultSheetId, width: 2560, height: 1250, material: 'Zink', thickness: 1.0, quantity: 10, cost: 0, useInNesting: true }
            ],
            activeSheetId: defaultSheetId,
            defaultMaterial: 'Zink',
            defaultThickness: 1.0,
            partSpacingX: 5,
            partSpacingY: 5,
            sheetMarginTop: 5,
            sheetMarginBottom: -5,
            sheetMarginLeft: 5,
            sheetMarginRight: 35,
            nestingDirection: 6, // 6 = Top-left (Standard)
            clampPositions: [420, 1250, 2080],
            nestUnderClamps: false,
            useCommonLine: false,
            vertexSnapping: true,
            utilizationStrategy: SheetUtilizationStrategy.ListedOrder,
            loadingStopId: 0, // Auto
        }
    }
];

export const defaultMachineSettings: MachineSettings = {
    name: 'Finn-Power C5',
    xTravelMax: 2542,
    xTravelMin: -42,
    yTravelMax: 1285,
    yTravelMin: -25,
    clampProtectionZoneX: 100,
    clampProtectionZoneY: 50,
    deadZoneY: 40,
    maxSlewSpeed: 80, // m/min
    turretRotationSpeed: 30 // rpm
};

export const defaultOptimizerSettings: OptimizerSettings = {
    toolSequence: 'global-station',
    pathOptimization: 'shortest-path',
    startCorner: 'bottom-right',
    sheetUnloadMode: 'manual',
    anglePriority: '0-90',
    useG76LinearPatterns: false
};
