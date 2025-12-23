
import React from 'react';
import { AppMode, ManualPunchMode, SnapMode } from './enums.types';
import { Tool, TurretLayout, PlacedTool } from './tools.types';
import { Part, ParametricScript } from './parts.types';
import { NestLayout, ScheduledPart } from './nesting.types';
import { MachineSettings } from './machine.types';
import { OptimizerSettings, PunchOp } from './optimizer.types';
import { TeachCycle } from './teach.types';

/**
 * Domain: UI and Interactive State.
 * Settings for manual tool placement tools and interactive modes.
 */

export interface NibbleSettings {
  extensionStart: number; // e1
  extensionEnd: number;   // e2
  minOverlap: number;     // v
  hitPointMode: 'offset' | 'centerLine';
  toolPosition: 'long' | 'short';
  // If set, overrides standard extension logic for micro-joints (negative extension)
  isMicroJointStart?: boolean; 
  isMicroJointEnd?: boolean;
}

export interface DestructSettings {
    overlap: number;
    scallop: number;
    notchExpansion: number;
}

// FIX: Added AppUIProps to resolve "Module './types' has no exported member 'AppUIProps'" error in AppUI.tsx
export interface AppUIProps {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
    tools: Tool[];
    parts: Part[];
    scripts: ParametricScript[];
    nests: NestLayout[];
    turretLayouts: TurretLayout[];
    machineSettings: MachineSettings;
    optimizerSettings: OptimizerSettings;
    teachCycles: TeachCycle[];
    activePart: Part | null;
    activePartProcessedGeometry: any;
    manualPunchMode: ManualPunchMode;
    selectedToolId: string | null;
    selectedPunchId: string | null;
    punchOrientation: number;
    snapMode: SnapMode;
    punchOffset: number;
    nibbleSettings: NibbleSettings;
    destructSettings: DestructSettings;
    teachMode: boolean;
    selectedSegmentIds: number[];
    selectedTeachPunchIds: string[];
    activeNest: NestLayout | null;
    activeSheetIndex: number;
    selectedNestPartId: string | null;
    isNestingProcessing: boolean;
    nestingProgress: number;
    nestingStatus: string;
    optimizedOperations: PunchOp[] | null;
    simulationStep: number;
    isSimulating: boolean;
    simulationSpeed: number;
    onGenerateGCodeRequest: () => void;
    onOptimizePathRequest: () => void;
    onRunOptimization: (settings: OptimizerSettings) => void;
    onToggleSimulation: () => void;
    onStopSimulation: () => void;
    onStepSimulation: (step: number) => void;
    onSpeedChange: (speed: number) => void;
    onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onClearAllPunches: () => void;
    onCanvasClick: (point: { x: number; y: number }) => void;
    onTeachBulkSelect: (segs: number[], punches: string[], add: boolean) => void;
    onTeachModeToggle: (val: boolean) => void;
    onSaveTeachCycle: (name: string, symmetry: any) => void;
    onDeleteTeachCycle: (id: string) => void;
    onDeletePunch: (id: string | string[]) => void;
    onUpdatePunch: (id: string, u: Partial<PlacedTool>) => void;
    onSavePartAsScript: () => void;
    onSavePartAsStatic: () => void;
    onRunNesting: () => void;
    onClearNest: () => void;
    onMoveNestPart: (id: string, dx: number, dy: number) => void;
    onRotateNestPart: (id: string) => void;
    onUpdateNestingSettings: (s: any, sp: ScheduledPart[]) => void;
    onUpdateNestMetadata: (m: any) => void;
    onUpdateActivePart: (u: Partial<Part>) => void;
    onClosePart: () => void;
    onSelectNestPart: (id: string | null) => void;
    onLoadPartFromLibrary: (p: Part) => void;
    onDeletePartFromLibrary: (id: string) => void;
    onUpdatePartInLibrary: (p: Part) => void;
    onSaveScript: (s: ParametricScript) => void;
    onDeleteScript: (id: string) => void;
    onCreatePartFromScript: (p: Part) => void;
    onBatchProcess: (pNew: Part[], spNew: ScheduledPart[]) => void;
    onSaveTool: (t: Tool) => void;
    onDeleteTool: (id: string) => void;
    onUpdateMachineSettings: (s: MachineSettings) => void;
    onUpdateTurretTools: (t: Tool[]) => void;
    onUpdateTurretLayouts: (l: TurretLayout[]) => void;
    ui: any;
    confirmation: any;
    panZoom: any;
    manualPunchState: { step: number; points: any[] };
    setActiveSheetIndex: (idx: number) => void;
    setManualPunchMode: (m: ManualPunchMode) => void;
    setSelectedToolId: (id: string | null) => void;
    setSelectedPunchId: (id: string | null) => void;
    setPunchOrientation: (a: number) => void;
    setSnapMode: (m: SnapMode) => void;
    setPunchOffset: (o: number) => void;
    setNibbleSettings: (s: NibbleSettings) => void;
    setDestructSettings: (s: DestructSettings) => void;
}
