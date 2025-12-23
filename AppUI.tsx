
/**
 * Finn-Power CAD/CAM Studio - UI ORCHESTRATOR
 * ОТВЕТСТВЕННОСТЬ: Главная композиция интерфейса. 
 */
import React from 'react';
import { AppUIProps, AppMode } from './types';
import { HeaderBar } from './components/layout/HeaderBar';
import { MainWorkspace } from './components/layout/MainWorkspace';
import { SecondaryViewManager } from './components/layout/SecondaryViewManager';
import { ModalRegistry } from './components/layout/ModalRegistry';

export const AppUI: React.FC<AppUIProps> = (props) => {
    const { mode, activePart, activeNest, ui, confirmation, panZoom } = props;
    const isMainMode = mode === AppMode.PartEditor || mode === AppMode.Nesting;

    // Вспомогательные объекты для группировки пропсов
    const sidebarProps = {
        mode,
        parts: props.parts,
        activePart,
        activePartId: activePart?.id || null,
        setActivePartId: () => {},
        onDeletePart: props.onDeletePartFromLibrary,
        tools: props.tools,
        activeNest,
        activeSheetIndex: props.activeSheetIndex,
        setActiveSheetIndex: props.setActiveSheetIndex,
        onFileUpload: props.onFileUpload,
        manualPunchMode: props.manualPunchMode,
        setManualPunchMode: props.setManualPunchMode,
        selectedToolId: props.selectedToolId,
        setSelectedToolId: props.setSelectedToolId,
        selectedPunchId: props.selectedPunchId,
        setSelectedPunchId: props.setSelectedPunchId,
        onDeletePunch: props.onDeletePunch,
        onUpdatePunch: props.onUpdatePunch,
        onClearAllPunches: props.onClearAllPunches,
        punchOrientation: props.punchOrientation,
        setPunchOrientation: props.setPunchOrientation,
        onCyclePunchOrientation: () => props.setPunchOrientation((props.punchOrientation + 90) % 360),
        snapMode: props.snapMode,
        setSnapMode: props.setSnapMode,
        punchOffset: props.punchOffset,
        setPunchOffset: props.setPunchOffset,
        onUpdateNestingSettings: props.onUpdateNestingSettings,
        onUpdateNestMetadata: props.onUpdateNestMetadata,
        nibbleSettings: props.nibbleSettings,
        setNibbleSettings: props.setNibbleSettings,
        destructSettings: props.destructSettings,
        setDestructSettings: props.setDestructSettings,
        onOpenTurretView: () => props.setMode(AppMode.TurretSetup),
        onSavePartAsScript: props.onSavePartAsScript,
        onSavePartAsStatic: props.onSavePartAsStatic,
        onUpdateActivePart: props.onUpdateActivePart,
        onClosePart: props.onClosePart,
        teachMode: props.teachMode,
        setTeachMode: props.onTeachModeToggle,
        onSaveTeachCycle: () => ui.setShowTeachSaveModal(true),
        teachCycles: props.teachCycles,
        onDeleteTeachCycle: props.onDeleteTeachCycle,
        onRunNesting: props.onRunNesting,
        isNestingProcessing: props.isNestingProcessing,
        nestingProgress: props.nestingProgress,
        nestingStatus: props.nestingStatus,
        onClearNest: props.onClearNest,
        selectedNestPartId: props.selectedNestPartId,
        onMoveNestPart: props.onMoveNestPart,
        onRotateNestPart: props.onRotateNestPart,
    };

    const canvasProps = {
        mode,
        activePart,
        processedGeometry: props.activePartProcessedGeometry,
        activeNest,
        currentNestSheet: activeNest?.sheets[props.activeSheetIndex] || null,
        tools: props.tools,
        parts: props.parts,
        svgRef: panZoom.svgRef,
        viewBox: panZoom.viewBox,
        setViewBox: panZoom.setViewBox,
        isDragging: panZoom.isDragging,
        getPointFromEvent: panZoom.getPointFromEvent,
        panZoomHandlers: panZoom.handlers,
        onOpenAutoPunchSettings: ui.openAutoPunchSettings,
        punchCreationStep: props.manualPunchState.step,
        punchCreationPoints: props.manualPunchState.points,
        manualPunchMode: props.manualPunchMode,
        selectedToolId: props.selectedToolId,
        selectedPunchId: props.selectedPunchId,
        onSelectPunch: props.setSelectedPunchId,
        placementReference: 0 as any,
        placementSide: 0 as any,
        punchOrientation: props.punchOrientation,
        snapMode: props.snapMode,
        punchOffset: props.punchOffset,
        nibbleSettings: props.nibbleSettings,
        teachMode: props.teachMode,
        selectedSegmentIds: props.selectedSegmentIds,
        selectedTeachPunchIds: props.selectedTeachPunchIds,
        onTeachBulkSelect: props.onTeachBulkSelect,
        selectedNestPartId: props.selectedNestPartId,
        onSelectNestPart: props.onSelectNestPart,
        onMoveNestPart: props.onMoveNestPart,
        optimizedOperations: props.optimizedOperations,
        simulationStep: props.simulationStep,
    };

    const rightPanelProps = {
        tools: props.tools,
        selectedToolId: props.selectedToolId,
        setSelectedToolId: props.setSelectedToolId,
        onOpenTurretView: () => props.setMode(AppMode.TurretSetup),
        activeNest,
        allParts: props.parts,
        simulationStep: props.simulationStep,
        totalSimulationSteps: props.optimizedOperations ? props.optimizedOperations.length : 0,
        isSimulating: props.isSimulating,
        simulationSpeed: props.simulationSpeed,
        onToggleSimulation: props.onToggleSimulation,
        onStopSimulation: props.onStopSimulation,
        onStepChange: props.onStepSimulation,
        onSpeedChange: props.onSpeedChange,
        optimizedOperations: props.optimizedOperations,
    };

    return (
        <div className="flex flex-col h-full font-sans relative overflow-hidden">
            <HeaderBar 
                mode={mode} 
                setMode={props.setMode} 
                onGenerateGCode={props.onGenerateGCodeRequest} 
                onOptimizePath={props.onOptimizePathRequest}
            />

            <div className="flex flex-1 overflow-hidden bg-gray-900">
                {isMainMode ? (
                    <MainWorkspace 
                        mode={mode}
                        sidebarProps={sidebarProps}
                        canvasProps={canvasProps}
                        rightPanelProps={rightPanelProps}
                        activeSheetIndex={props.activeSheetIndex}
                        setActiveSheetIndex={props.setActiveSheetIndex}
                    />
                ) : (
                    <SecondaryViewManager 
                        mode={mode}
                        data={{
                            partLibrary: { parts: props.parts, tools: props.tools },
                            scriptLibrary: { scripts: props.scripts, tools: props.tools, parts: props.parts },
                            toolLibrary: { tools: props.tools },
                            turretSetup: { tools: props.tools, layouts: props.turretLayouts },
                            machineSetup: { settings: props.machineSettings }
                        }}
                        handlers={{
                            partLibrary: { onLoadPart: props.onLoadPartFromLibrary, onDeletePart: props.onDeletePartFromLibrary, onUpdatePart: props.onUpdatePartInLibrary },
                            scriptLibrary: { onSaveScript: props.onSaveScript, onDeleteScript: props.onDeleteScript, onCreatePart: props.onCreatePartFromScript, onBatchProcess: props.onBatchProcess },
                            toolLibrary: { onSaveTool: props.onSaveTool, onDeleteTool: props.onDeleteTool },
                            turretSetup: { setTools: props.onUpdateTurretTools, setLayouts: props.onUpdateTurretLayouts },
                            machineSetup: { onUpdate: props.onUpdateMachineSettings }
                        }}
                    />
                )}
            </div>

            <ModalRegistry 
                ui={ui}
                confirmation={confirmation}
                data={{
                    turretLayouts: props.turretLayouts,
                    optimizerSettings: props.optimizerSettings,
                    parts: props.parts,
                    tools: props.tools
                }}
                handlers={{
                    onSaveTeachCycle: props.onSaveTeachCycle,
                    onRunOptimization: props.onRunOptimization
                }}
                activeNest={activeNest}
                activeSheetIndex={props.activeSheetIndex}
            />
        </div>
    );
};
