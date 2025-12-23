
/**
 * ОТВЕТСТВЕННОСТЬ: Отрисовка основного интерфейса приложения.
 * ДОЛЖЕН СОДЕРЖАТЬ: Композицию Header, Sidebar, CanvasArea, RightPanel и модальных окон.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: React хуки или бизнес-логику.
 */
import React from 'react';
import { 
    AppMode, Part, Tool, ManualPunchMode, SnapMode, NibbleSettings, 
    DestructSettings, TeachCycle, ToastMessage, MachineSettings, 
    OptimizerSettings, PunchOp, NestLayout, ScheduledPart, TurretLayout 
} from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { CanvasArea } from './components/CanvasArea';
import { ToolLibraryView } from './components/ToolLibraryView';
import { TurretSetupView } from './components/TurretSetupView';
import { ScriptLibraryView } from './components/ScriptLibraryView';
import { PartLibraryView } from './components/PartLibraryView';
import { MachineSetupView } from './components/MachineSetupView';
import { AutoPunchSettingsModal } from './components/AutoPunchSettingsModal';
import { GCodeModal } from './components/GCodeModal';
import { OptimizerSettingsModal } from './components/OptimizerSettingsModal';
import { TeachCycleSaveModal } from './components/TeachCycleSaveModal';
import { ConfirmationModal } from './components/common/ConfirmationModal';
import { ToastContainer } from './components/common/Toast';

interface AppUIProps {
    mode: AppMode;
    setMode: (m: AppMode) => void;
    // Data
    tools: Tool[];
    parts: Part[];
    scripts: any[];
    nests: NestLayout[];
    turretLayouts: TurretLayout[];
    machineSettings: MachineSettings;
    optimizerSettings: OptimizerSettings;
    teachCycles: TeachCycle[];
    // Editor State
    activePart: Part | null;
    activePartProcessedGeometry: any;
    manualPunchMode: ManualPunchMode;
    setManualPunchMode: (m: ManualPunchMode) => void;
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    selectedPunchId: string | null;
    setSelectedPunchId: (id: string | null) => void;
    punchOrientation: number;
    setPunchOrientation: (v: number) => void;
    snapMode: SnapMode;
    setSnapMode: (m: SnapMode) => void;
    punchOffset: number;
    setPunchOffset: (v: number) => void;
    nibbleSettings: NibbleSettings;
    setNibbleSettings: (s: NibbleSettings) => void;
    destructSettings: DestructSettings;
    setDestructSettings: (s: DestructSettings) => void;
    teachMode: boolean;
    selectedSegmentIds: number[];
    selectedTeachPunchIds: string[];
    // Nesting State
    activeNest: NestLayout | null;
    activeSheetIndex: number;
    setActiveSheetIndex: (i: number) => void;
    selectedNestPartId: string | null;
    isNestingProcessing: boolean;
    nestingProgress: number;
    nestingStatus: string;
    // Simulation
    optimizedOperations: PunchOp[] | null;
    simulationStep: number;
    isSimulating: boolean;
    simulationSpeed: number;
    // Handlers
    onGenerateGCodeRequest: () => void;
    onOptimizePathRequest: () => void;
    onRunOptimization: (s: OptimizerSettings) => void;
    onToggleSimulation: () => void;
    onStopSimulation: () => void;
    onStepSimulation: (v: number) => void;
    onSpeedChange: (v: number) => void;
    onFileUpload: (e: any) => void;
    onClearAllPunches: () => void;
    onCanvasClick: (p: any) => void;
    onTeachBulkSelect: (s: number[], p: string[], a: boolean) => void;
    onTeachModeToggle: (e: boolean) => void;
    onSaveTeachCycle: (n: string, s: any) => void;
    onDeleteTeachCycle: (id: string) => void;
    onDeletePunch: (id: string | string[]) => void;
    onUpdatePunch: (id: string, u: any) => void;
    onSavePartAsScript: () => void;
    onSavePartAsStatic: () => void;
    onRunNesting: () => void;
    onClearNest: () => void;
    onMoveNestPart: (id: string, dx: number, dy: number) => void;
    onRotateNestPart: (id: string) => void;
    onUpdateNestingSettings: (s: any, sp: ScheduledPart[]) => void;
    onUpdateNestMetadata: (m: any) => void;
    onUpdateActivePart: (u: any) => void;
    onClosePart: () => void;
    onSelectNestPart: (id: string | null) => void;
    onLoadPartFromLibrary: (p: Part) => void;
    onDeletePartFromLibrary: (id: string) => void;
    onUpdatePartInLibrary: (p: Part) => void;
    onSaveScript: (s: any) => void;
    onDeleteScript: (id: string) => void;
    onCreatePartFromScript: (p: Part) => void;
    onBatchProcess: (p: Part[], sp: ScheduledPart[]) => void;
    onSaveTool: (t: Tool) => void;
    onDeleteTool: (id: string) => void;
    onUpdateMachineSettings: (s: MachineSettings) => void;
    onUpdateTurretTools: (t: Tool[] | ((prev: Tool[]) => Tool[])) => void;
    onUpdateTurretLayouts: (l: TurretLayout[] | ((prev: TurretLayout[]) => TurretLayout[])) => void;
    // UI Helpers
    ui: {
        toasts: ToastMessage[];
        removeToast: (id: string) => void;
        showGCodeModal: boolean;
        setShowGCodeModal: (v: boolean) => void;
        showOptimizerModal: boolean;
        setShowOptimizerModal: (v: boolean) => void;
        showAutoPunchSettingsModal: boolean;
        setShowAutoPunchSettingsModal: (v: boolean) => void;
        showTeachSaveModal: boolean;
        setShowTeachSaveModal: (v: boolean) => void;
        generatedGCode: string;
        downloadGCode: () => void;
        openAutoPunchSettings: () => void;
        onAutoPunchApply: (s: any) => void;
    };
    confirmation: { state: any; close: () => void };
    panZoom: { svgRef: any; viewBox: any; setViewBox: any; isDragging: boolean; getPointFromEvent: any; handlers: any };
    manualPunchState: { step: number; points: any[] };
}

export const AppUI: React.FC<AppUIProps> = (props) => {
    const { mode, activePart, activeNest, parts, tools, ui, confirmation, panZoom } = props;
    const currentNestSheet = activeNest?.sheets[props.activeSheetIndex] || null;

    return (
        <div className="flex flex-col h-full font-sans relative">
            <Header 
                mode={mode} 
                setMode={props.setMode} 
                onGenerateGCode={props.onGenerateGCodeRequest} 
                onOptimizePath={props.onOptimizePathRequest}
                onOpenTurretConfig={() => props.setMode(AppMode.TurretSetup)}
            />

            <div className="flex flex-1 overflow-hidden">
                {(mode === AppMode.PartEditor || mode === AppMode.Nesting) ? (
                    <>
                        <Sidebar 
                            mode={mode}
                            parts={parts} 
                            activePart={activePart}
                            activePartId={activePart?.id || null}
                            setActivePartId={() => {}} 
                            onDeletePart={props.onDeletePartFromLibrary}
                            tools={tools}
                            activeNest={activeNest}
                            activeSheetIndex={props.activeSheetIndex}
                            setActiveSheetIndex={props.setActiveSheetIndex}
                            onFileUpload={props.onFileUpload}
                            manualPunchMode={props.manualPunchMode} setManualPunchMode={props.setManualPunchMode}
                            selectedToolId={props.selectedToolId} setSelectedToolId={props.setSelectedToolId}
                            selectedPunchId={props.selectedPunchId} setSelectedPunchId={props.setSelectedPunchId}
                            onDeletePunch={props.onDeletePunch} onUpdatePunch={props.onUpdatePunch}
                            onClearAllPunches={props.onClearAllPunches}
                            punchOrientation={props.punchOrientation} setPunchOrientation={props.setPunchOrientation} 
                            onCyclePunchOrientation={() => props.setPunchOrientation((props.punchOrientation+90)%360)}
                            snapMode={props.snapMode} setSnapMode={props.setSnapMode}
                            punchOffset={props.punchOffset} setPunchOffset={props.setPunchOffset}
                            onUpdateNestingSettings={props.onUpdateNestingSettings}
                            onUpdateNestMetadata={props.onUpdateNestMetadata}
                            nibbleSettings={props.nibbleSettings} setNibbleSettings={props.setNibbleSettings}
                            destructSettings={props.destructSettings} setDestructSettings={props.setDestructSettings}
                            onOpenTurretView={() => props.setMode(AppMode.TurretSetup)}
                            onSavePartAsScript={props.onSavePartAsScript}
                            onSavePartAsStatic={props.onSavePartAsStatic}
                            onUpdateActivePart={props.onUpdateActivePart}
                            onClosePart={props.onClosePart}
                            teachMode={props.teachMode} setTeachMode={props.onTeachModeToggle}
                            onSaveTeachCycle={() => ui.setShowTeachSaveModal(true)}
                            teachCycles={props.teachCycles} onDeleteTeachCycle={props.onDeleteTeachCycle}
                            onRunNesting={props.onRunNesting}
                            isNestingProcessing={props.isNestingProcessing}
                            nestingProgress={props.nestingProgress}
                            nestingStatus={props.nestingStatus}
                            onClearNest={props.onClearNest}
                            selectedNestPartId={props.selectedNestPartId}
                            onMoveNestPart={props.onMoveNestPart}
                            onRotateNestPart={props.onRotateNestPart}
                        />
                        <CanvasArea 
                            mode={mode}
                            activePart={activePart}
                            processedGeometry={props.activePartProcessedGeometry}
                            activeNest={activeNest}
                            currentNestSheet={currentNestSheet}
                            tools={tools}
                            parts={parts}
                            svgRef={panZoom.svgRef}
                            viewBox={panZoom.viewBox}
                            setViewBox={panZoom.setViewBox}
                            isDragging={panZoom.isDragging}
                            getPointFromEvent={panZoom.getPointFromEvent}
                            panZoomHandlers={panZoom.handlers}
                            onOpenAutoPunchSettings={ui.openAutoPunchSettings}
                            punchCreationStep={props.manualPunchState.step}
                            punchCreationPoints={props.manualPunchState.points}
                            manualPunchMode={props.manualPunchMode}
                            selectedToolId={props.selectedToolId}
                            selectedPunchId={props.selectedPunchId}
                            onSelectPunch={props.setSelectedPunchId}
                            placementReference={0 as any} 
                            placementSide={0 as any}
                            punchOrientation={props.punchOrientation}
                            snapMode={props.snapMode}
                            punchOffset={props.punchOffset}
                            nibbleSettings={props.nibbleSettings}
                            teachMode={props.teachMode}
                            selectedSegmentIds={props.selectedSegmentIds}
                            selectedTeachPunchIds={props.selectedTeachPunchIds}
                            onTeachBulkSelect={props.onTeachBulkSelect}
                            selectedNestPartId={props.selectedNestPartId}
                            onSelectNestPart={props.onSelectNestPart}
                            onMoveNestPart={props.onMoveNestPart}
                            optimizedOperations={props.optimizedOperations}
                            simulationStep={props.simulationStep}
                        />
                        <RightPanel 
                            tools={tools}
                            selectedToolId={props.selectedToolId}
                            setSelectedToolId={props.setSelectedToolId}
                            onOpenTurretView={() => props.setMode(AppMode.TurretSetup)}
                            isNestingMode={mode === AppMode.Nesting}
                            activeNest={activeNest}
                            activeSheetIndex={props.activeSheetIndex}
                            setActiveSheetIndex={props.setActiveSheetIndex}
                            allParts={parts}
                            simulationStep={props.simulationStep}
                            totalSimulationSteps={props.optimizedOperations ? props.optimizedOperations.length : 0}
                            isSimulating={props.isSimulating}
                            simulationSpeed={props.simulationSpeed}
                            onToggleSimulation={props.onToggleSimulation}
                            onStopSimulation={props.onStopSimulation}
                            onStepChange={props.onStepSimulation}
                            onSpeedChange={props.onSpeedChange}
                            optimizedOperations={props.optimizedOperations}
                        />
                    </>
                ) : (
                    mode === AppMode.PartLibrary ? (
                        <PartLibraryView 
                            parts={parts} 
                            tools={tools}
                            onLoadPart={props.onLoadPartFromLibrary}
                            onDeletePart={props.onDeletePartFromLibrary}
                            onUpdatePart={props.onUpdatePartInLibrary}
                        />
                    ) : mode === AppMode.ScriptLibrary ? (
                        <ScriptLibraryView 
                            scripts={props.scripts} 
                            tools={tools} 
                            parts={parts}
                            onSaveScript={props.onSaveScript}
                            onDeleteScript={props.onDeleteScript}
                            onCreatePart={props.onCreatePartFromScript}
                            onBatchProcess={props.onBatchProcess}
                        />
                    ) : mode === AppMode.ToolLibrary ? (
                        <ToolLibraryView 
                            tools={tools} 
                            onSaveTool={props.onSaveTool} 
                            onDeleteTool={props.onDeleteTool} 
                        />
                    ) : mode === AppMode.TurretSetup ? (
                        <TurretSetupView 
                            tools={tools} 
                            setTools={props.onUpdateTurretTools} 
                            layouts={props.turretLayouts} 
                            setLayouts={props.onUpdateTurretLayouts} 
                        />
                    ) : mode === AppMode.MachineSetup ? (
                        <MachineSetupView 
                            settings={props.machineSettings} 
                            onUpdate={props.onUpdateMachineSettings} 
                        />
                    ) : null
                )}
            </div>

            {/* Модальные окна */}
            {ui.showAutoPunchSettingsModal && activePart && (
                <AutoPunchSettingsModal 
                    onClose={() => ui.setShowAutoPunchSettingsModal(false)}
                    onApply={ui.onAutoPunchApply}
                    turretLayouts={props.turretLayouts}
                />
            )}
            {ui.showTeachSaveModal && <TeachCycleSaveModal onClose={() => ui.setShowTeachSaveModal(false)} onSave={props.onSaveTeachCycle} />}
            
            {ui.showOptimizerModal && (
                <OptimizerSettingsModal
                    initialSettings={props.optimizerSettings}
                    onClose={() => ui.setShowOptimizerModal(false)}
                    onGenerate={props.onRunOptimization}
                />
            )}

            {ui.showGCodeModal && (
                <GCodeModal 
                    gcode={ui.generatedGCode} 
                    onClose={() => ui.setShowGCodeModal(false)} 
                    onDownload={ui.downloadGCode}
                    sheet={currentNestSheet || undefined}
                    parts={parts}
                    tools={tools}
                    clampPositions={activeNest?.settings.clampPositions}
                    scheduledParts={activeNest?.scheduledParts}
                    nestName={activeNest?.workOrder ? `${activeNest.workOrder}_${props.activeSheetIndex + 1}.nc` : `Program_${props.activeSheetIndex + 1}.nc`}
                    allSheets={activeNest?.sheets}
                />
            )}
            
            <ToastContainer toasts={ui.toasts} removeToast={ui.removeToast} />
            <ConfirmationModal state={confirmation.state} onCancel={confirmation.close} />
        </div>
    );
};
