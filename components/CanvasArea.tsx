
import React from 'react';
import { AppMode, NestLayout, Part, Tool, Point, ManualPunchMode, PlacementReference, SnapMode, PlacementSide, NestResultSheet, PunchOp } from '../types';
import { ActionButton } from './common/Button';
import { SettingsIcon, PlusIcon, MinusIcon, MaximizeIcon } from './Icons';
import { ProcessedGeometry } from '../services/geometry';
import { ViewBox } from '../hooks/usePanAndZoom';
import { PartEditorCanvas } from './canvas/PartEditorCanvas';
import { NestingCanvas } from './canvas/NestingCanvas';
import { useCanvasNavigation } from '../hooks/canvas/useCanvasNavigation';
import { useCanvasInteraction } from '../hooks/canvas/useCanvasInteraction';

interface CanvasAreaProps {
    mode: AppMode;
    activePart: Part | null;
    processedGeometry: ProcessedGeometry | null;
    activeNest: NestLayout | null;
    currentNestSheet?: NestResultSheet | null; 
    tools: Tool[];
    parts: Part[];
    svgRef: React.RefObject<SVGSVGElement>;
    viewBox: ViewBox;
    setViewBox: React.Dispatch<React.SetStateAction<ViewBox>>;
    isDragging: boolean;
    getPointFromEvent: (event: React.MouseEvent<SVGSVGElement>) => Point;
    panZoomHandlers: any;
    onOpenAutoPunchSettings: () => void;
    punchCreationStep: number;
    punchCreationPoints: Point[];
    manualPunchMode: ManualPunchMode;
    selectedToolId: string | null;
    selectedPunchId: string | null;
    onSelectPunch: (id: string) => void;
    placementReference: PlacementReference;
    placementSide: PlacementSide;
    punchOrientation: number;
    punchOffset: number;
    snapMode: SnapMode;
    nibbleSettings: any; 
    teachMode?: boolean;
    selectedSegmentIds?: number[];
    selectedTeachPunchIds?: string[];
    onTeachBulkSelect?: (segmentIndices: number[], punchIds: string[], add: boolean) => void;
    selectedNestPartId?: string | null;
    onSelectNestPart?: (id: string | null) => void;
    onMoveNestPart?: (id: string, dx: number, dy: number) => void;
    optimizedOperations?: PunchOp[] | null;
    simulationStep?: number;
}

const GridDefs: React.FC = () => (
    <defs>
        <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5"/>
        </pattern>
        <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#smallGrid)"/>
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1"/>
        </pattern>
    </defs>
);

export const CanvasArea: React.FC<CanvasAreaProps> = (props) => {
    const { mode, activePart, processedGeometry, activeNest, currentNestSheet, tools, parts, teachMode, manualPunchMode, simulationStep, optimizedOperations, selectedPunchId, onSelectPunch } = props;

    // 1. Инкапсулированная навигация
    const { handleZoomIn, handleZoomOut, handleFit } = useCanvasNavigation({
        mode, activePart, activeNest, currentNestSheet, setViewBox: props.setViewBox
    });

    // 2. Инкапсулированное взаимодействие
    const { mousePos, selectionStart, selectionCurrent, interactionHandlers } = useCanvasInteraction({
        mode, activeNest, currentNestSheet, parts, processedGeometry, activePart,
        teachMode: !!teachMode,
        isDragging: props.isDragging,
        getPointFromEvent: props.getPointFromEvent,
        panZoomHandlers: props.panZoomHandlers,
        onSelectNestPart: props.onSelectNestPart,
        onMoveNestPart: props.onMoveNestPart,
        onTeachBulkSelect: props.onTeachBulkSelect
    });

    const renderSelectionBox = () => {
        if (teachMode && selectionStart && selectionCurrent) {
            const x = Math.min(selectionStart.x, selectionCurrent.x);
            const y = Math.min(selectionStart.y, selectionCurrent.y);
            const w = Math.abs(selectionCurrent.x - selectionStart.x);
            const h = Math.abs(selectionCurrent.y - selectionStart.y);
            return <rect x={x} y={y} width={w} height={h} fill="rgba(236, 72, 153, 0.2)" stroke="#ec4899" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none"/>;
        }
        return null;
    };

    return (
        <main className="flex-1 bg-gray-800 flex flex-col relative">
            {mode === AppMode.PartEditor && (
                <div className="flex-none bg-gray-700/50 p-2 flex items-center space-x-4">
                     <ActionButton icon={<SettingsIcon />} label="Авто-расстановка" onClick={props.onOpenAutoPunchSettings} disabled={!activePart}/>
                </div>
            )}
            
            <div className="flex-1 bg-grid-pattern p-4 overflow-auto relative">
                <div className="w-full h-full bg-gray-900 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 overflow-hidden relative">
                    <svg 
                        ref={props.svgRef}
                        width="100%" height="100%" 
                        viewBox={`${props.viewBox.x} ${props.viewBox.y} ${props.viewBox.width} ${props.viewBox.height}`}
                        preserveAspectRatio="xMidYMid meet"
                        onWheel={props.panZoomHandlers.onWheel}
                        {...interactionHandlers}
                        onClick={(e) => { e.stopPropagation(); if(!teachMode) onSelectPunch(''); }}
                        className={props.isDragging ? 'cursor-grabbing' : (manualPunchMode !== ManualPunchMode.Punch && !teachMode && mode === AppMode.PartEditor ? 'cursor-crosshair' : 'cursor-grab')}
                    >
                        <GridDefs />
                        <g transform="scale(1, -1)">
                            <rect x={props.viewBox.x - 2000} y={props.viewBox.y - 2000} width={props.viewBox.width + 4000} height={props.viewBox.height + 4000} fill="url(#grid)" pointerEvents="none"/>
                            
                            {mode === AppMode.PartEditor && activePart && (
                                <>
                                    <PartEditorCanvas 
                                        activePart={activePart}
                                        processedGeometry={processedGeometry}
                                        tools={tools}
                                        mousePos={mousePos}
                                        manualPunchMode={manualPunchMode}
                                        punchCreationStep={props.punchCreationStep}
                                        punchCreationPoints={props.punchCreationPoints}
                                        selectedToolId={props.selectedToolId}
                                        selectedPunchId={selectedPunchId}
                                        placementReference={props.placementReference}
                                        placementSide={props.placementSide}
                                        punchOrientation={props.punchOrientation}
                                        punchOffset={props.punchOffset}
                                        snapMode={props.snapMode}
                                        nibbleSettings={props.nibbleSettings}
                                        teachMode={!!teachMode}
                                        selectedSegmentIds={props.selectedSegmentIds || []}
                                        selectedTeachPunchIds={props.selectedTeachPunchIds || []}
                                        onSelectPunch={onSelectPunch}
                                    />
                                    {renderSelectionBox()}
                                </>
                            )}

                            {mode === AppMode.Nesting && activeNest && (
                                <NestingCanvas 
                                    activeNest={activeNest}
                                    currentNestSheet={currentNestSheet}
                                    parts={parts}
                                    tools={tools}
                                    selectedNestPartId={props.selectedNestPartId}
                                    optimizedOperations={optimizedOperations}
                                    simulationStep={simulationStep}
                                />
                            )}
                        </g>
                    </svg>

                     {!activePart && mode === AppMode.PartEditor && <span>Загрузите DXF или выберите деталь из библиотеки</span>}
                     
                     <div className="absolute bottom-4 left-4 bg-gray-800/90 p-2 rounded shadow-lg backdrop-blur-sm border border-gray-600 z-10 pointer-events-none font-mono text-xs text-green-400">
                         <div className="flex space-x-4">
                             <span>X: {mousePos ? mousePos.x.toFixed(2) : '0.00'}</span>
                             <span>Y: {mousePos ? mousePos.y.toFixed(2) : '0.00'}</span>
                         </div>
                     </div>

                     <div className="absolute bottom-4 right-4 flex flex-col space-y-2 bg-gray-800/80 p-2 rounded shadow-lg backdrop-blur-sm border border-gray-600 z-10">
                         <button onClick={handleZoomIn} className="p-2 hover:bg-gray-600 rounded text-white" title="Увеличить"><PlusIcon className="w-5 h-5" /></button>
                         <button onClick={handleZoomOut} className="p-2 hover:bg-gray-600 rounded text-white" title="Уменьшить"><MinusIcon className="w-5 h-5" /></button>
                         <button onClick={handleFit} className="p-2 hover:bg-gray-600 rounded text-white" title="По размеру"><MaximizeIcon className="w-5 h-5" /></button>
                     </div>
                </div>
            </div>
        </main>
    );
};
