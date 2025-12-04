
import React, { MouseEvent, WheelEvent, useState, useRef } from 'react';
import { AppMode, NestLayout, Part, Tool, Point, ManualPunchMode, PlacementReference, SnapMode, PlacementSide, NestResultSheet, PunchOp } from '../types';
import { ActionButton } from './common/Button';
import { SettingsIcon, PlusIcon, MinusIcon, MaximizeIcon } from './Icons';
import { ProcessedGeometry, isPointInRectangle, calculateNestingSnap } from '../services/geometry';
import { ViewBox } from '../hooks/usePanAndZoom';
import { PartEditorCanvas } from './canvas/PartEditorCanvas';
import { NestingCanvas } from './canvas/NestingCanvas';

interface CanvasAreaProps {
    mode: AppMode;
    activePart: Part | null;
    processedGeometry: ProcessedGeometry | null;
    activeNest: NestLayout | null;
    currentNestSheet?: NestResultSheet | null; 
    tools: Tool[];
    parts: Part[];
    
    // Pan and Zoom
    svgRef: React.RefObject<SVGSVGElement>;
    viewBox: { x: number, y: number, width: number, height: number };
    setViewBox: React.Dispatch<React.SetStateAction<ViewBox>>;
    isDragging: boolean;
    getPointFromEvent: (event: MouseEvent<SVGSVGElement>) => Point;
    panZoomHandlers: {
        onWheel: (event: WheelEvent<SVGSVGElement>) => void;
        onMouseDown: (event: MouseEvent<SVGSVGElement>) => void;
        onMouseMove: (event: MouseEvent<SVGSVGElement>) => void;
        onMouseUp: (event: MouseEvent<SVGSVGElement>) => void;
        onMouseLeave: (event: MouseEvent<SVGSVGElement>) => void;
    };
    
    // Actions
    onOpenAutoPunchSettings: () => void;

    // Manual Punching
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
    
    // Settings
    nibbleSettings: any; 
    
    // Teach Mode
    teachMode?: boolean;
    selectedSegmentIds?: number[];
    selectedTeachPunchIds?: string[];
    onTeachBulkSelect?: (segmentIndices: number[], punchIds: string[], add: boolean) => void;

    // Nesting Interaction
    selectedNestPartId?: string | null;
    onSelectNestPart?: (id: string | null) => void;
    onMoveNestPart?: (id: string, dx: number, dy: number) => void;

    // Optimization / Simulation
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

export const CanvasArea: React.FC<CanvasAreaProps> = ({
    mode, activePart, processedGeometry, activeNest, currentNestSheet, tools, parts,
    svgRef, viewBox, setViewBox, isDragging, getPointFromEvent, panZoomHandlers,
    onOpenAutoPunchSettings, 
    punchCreationStep, punchCreationPoints, manualPunchMode, selectedToolId,
    selectedPunchId, onSelectPunch, placementReference, placementSide, punchOrientation, snapMode,
    punchOffset, nibbleSettings,
    teachMode = false, selectedSegmentIds = [], selectedTeachPunchIds = [], onTeachBulkSelect,
    selectedNestPartId, onSelectNestPart, onMoveNestPart,
    optimizedOperations, simulationStep = 0
}) => {
    const [mousePos, setMousePos] = useState<Point | null>(null);
    
    // Selection Box State
    const [selectionStart, setSelectionStart] = useState<Point | null>(null);
    const [selectionCurrent, setSelectionCurrent] = useState<Point | null>(null);
    const isSelectingRef = useRef(false);

    // Nesting Drag State
    const [draggingNestPartId, setDraggingNestPartId] = useState<string | null>(null);
    const lastDragPos = useRef<Point | null>(null);

    const getModelPoint = (e: MouseEvent<SVGSVGElement>): Point => {
        const pt = getPointFromEvent(e);
        return { x: pt.x, y: -pt.y }; // Invert Y from View to Model
    };

    const handleZoomIn = () => {
        setViewBox(prev => ({
            x: prev.x + prev.width * 0.1, 
            y: prev.y + prev.height * 0.1,
            width: prev.width * 0.8, 
            height: prev.height * 0.8
        }));
    };

    const handleZoomOut = () => {
        setViewBox(prev => ({
            x: prev.x - prev.width * 0.1, 
            y: prev.y - prev.height * 0.1,
            width: prev.width * 1.2, 
            height: prev.height * 1.2
        }));
    };

    const handleFit = () => {
        if (mode === AppMode.PartEditor && activePart) {
             setViewBox({
                x: -5,
                y: -activePart.geometry.height - 5,
                width: activePart.geometry.width + 10,
                height: activePart.geometry.height + 10
            });
        } else if (mode === AppMode.Nesting && activeNest) {
             let width = 2500;
             let height = 1250;
             if (currentNestSheet) {
                 width = currentNestSheet.width;
                 height = currentNestSheet.height;
             } else {
                 const stock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0];
                 if(stock) { width = stock.width; height = stock.height; }
             }
             setViewBox({ x: -50, y: -height - 50, width: width + 100, height: height + 100 });
        }
    };

    const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
        const pt = getModelPoint(event);

        if (mode === AppMode.Nesting && activeNest && currentNestSheet && onSelectNestPart) {
            for (let i = currentNestSheet.placedParts.length - 1; i >= 0; i--) {
                const pp = currentNestSheet.placedParts[i];
                const part = parts.find(p => p.id === pp.partId);
                if (part) {
                    if (isPointInRectangle(pt, pp.x, pp.y, part.geometry.width, part.geometry.height, pp.rotation)) {
                        onSelectNestPart(pp.id);
                        setDraggingNestPartId(pp.id);
                        lastDragPos.current = pt;
                        event.stopPropagation();
                        return;
                    }
                }
            }
            onSelectNestPart(null);
        }

        if (event.button === 0 && teachMode && !isDragging) {
             setSelectionStart(pt);
             setSelectionCurrent(pt);
             isSelectingRef.current = true;
        }
        
        panZoomHandlers.onMouseDown(event);
    };

    const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
        const pt = getModelPoint(event);
        setMousePos(pt);
        
        if (draggingNestPartId && lastDragPos.current && onMoveNestPart && activeNest && currentNestSheet) {
            const dx = pt.x - lastDragPos.current.x;
            const dy = pt.y - lastDragPos.current.y;
            let finalDx = dx;
            let finalDy = dy;
            
             const draggedPart = currentNestSheet.placedParts.find(p => p.id === draggingNestPartId);
             if (draggedPart) {
                 const potentialPart = { ...draggedPart, x: draggedPart.x + dx, y: draggedPart.y + dy };
                 const snapPos = calculateNestingSnap(potentialPart, currentNestSheet.placedParts, parts, 15);
                 if (snapPos) {
                     finalDx = snapPos.x - draggedPart.x;
                     finalDy = snapPos.y - draggedPart.y;
                 }
             }

            onMoveNestPart(draggingNestPartId, finalDx, finalDy);
            lastDragPos.current = pt;
            event.stopPropagation();
            return;
        }

        if (isSelectingRef.current && selectionStart) {
             setSelectionCurrent(pt);
             event.stopPropagation();
        } else {
             panZoomHandlers.onMouseMove(event);
        }
    };

    const handleMouseUp = (event: MouseEvent<SVGSVGElement>) => {
        if (draggingNestPartId) {
            setDraggingNestPartId(null);
            lastDragPos.current = null;
        }

        if (isSelectingRef.current && selectionStart && selectionCurrent) {
            if (teachMode && processedGeometry && activePart && onTeachBulkSelect) {
                const x1 = Math.min(selectionStart.x, selectionCurrent.x);
                const x2 = Math.max(selectionStart.x, selectionCurrent.x);
                const y1 = Math.min(selectionStart.y, selectionCurrent.y);
                const y2 = Math.max(selectionStart.y, selectionCurrent.y);
                
                if ((x2 - x1) > 1 || (y2 - y1) > 1) {
                    const foundSegs: number[] = [];
                    const foundPunches: string[] = [];

                    processedGeometry.segments.forEach((seg, idx) => {
                        const cx = (seg.p1.x + seg.p2.x) / 2;
                        const cy = (seg.p1.y + seg.p2.y) / 2;
                        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
                            foundSegs.push(idx);
                        }
                    });

                    activePart.punches.forEach(p => {
                        if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
                            foundPunches.push(p.id);
                        }
                    });
                    
                    const isAdditive = event.shiftKey || event.ctrlKey;
                    onTeachBulkSelect(foundSegs, foundPunches, isAdditive);
                }
            }
            setSelectionStart(null);
            setSelectionCurrent(null);
            isSelectingRef.current = false;
        }
        panZoomHandlers.onMouseUp(event);
    };

    const handleMouseLeave = (event: MouseEvent<SVGSVGElement>) => {
        panZoomHandlers.onMouseLeave(event);
        setMousePos(null);
        if (isSelectingRef.current) {
            setSelectionStart(null);
            setSelectionCurrent(null);
            isSelectingRef.current = false;
        }
        if (draggingNestPartId) {
            setDraggingNestPartId(null);
            lastDragPos.current = null;
        }
    }
    
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
                     <ActionButton icon={<SettingsIcon />} label="Авто-расстановка" onClick={onOpenAutoPunchSettings} disabled={!activePart}/>
                </div>
            )}
            
            <div className="flex-1 bg-grid-pattern p-4 overflow-auto relative">
                <div className="w-full h-full bg-gray-900 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 overflow-hidden relative">
                    <svg 
                        ref={svgRef}
                        width="100%" 
                        height="100%" 
                        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                        preserveAspectRatio="xMidYMid meet"
                        {...panZoomHandlers}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseLeave}
                        onClick={(e) => { e.stopPropagation(); if(!teachMode && onSelectPunch) onSelectPunch(''); }}
                        className={isDragging ? 'cursor-grabbing' : (manualPunchMode !== ManualPunchMode.Punch && !teachMode && mode === AppMode.PartEditor ? 'cursor-crosshair' : 'cursor-grab')}
                    >
                        <GridDefs />
                        <g transform="scale(1, -1)">
                            <rect x={viewBox.x - 2000} y={viewBox.y - 2000} width={viewBox.width + 4000} height={viewBox.height + 4000} fill="url(#grid)" pointerEvents="none"/>
                            
                            {mode === AppMode.PartEditor && activePart && (
                                <>
                                    <PartEditorCanvas 
                                        activePart={activePart}
                                        processedGeometry={processedGeometry}
                                        tools={tools}
                                        mousePos={mousePos}
                                        manualPunchMode={manualPunchMode}
                                        punchCreationStep={punchCreationStep}
                                        punchCreationPoints={punchCreationPoints}
                                        selectedToolId={selectedToolId}
                                        selectedPunchId={selectedPunchId}
                                        placementReference={placementReference}
                                        placementSide={placementSide}
                                        punchOrientation={punchOrientation}
                                        punchOffset={punchOffset}
                                        snapMode={snapMode}
                                        nibbleSettings={nibbleSettings}
                                        teachMode={teachMode}
                                        selectedSegmentIds={selectedSegmentIds}
                                        selectedTeachPunchIds={selectedTeachPunchIds}
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
                                    selectedNestPartId={selectedNestPartId}
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
