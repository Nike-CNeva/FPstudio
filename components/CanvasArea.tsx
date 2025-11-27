
import React, { MouseEvent, WheelEvent, useState, useRef } from 'react';
import { AppMode, NestLayout, Part, Tool, Point, ManualPunchMode, PlacementReference, SnapMode, PlacedTool, PlacementSide, NestResultSheet, PlacedPart } from '../types';
import { ToolSvg } from './common/ToolDisplay';
import { ActionButton } from './common/Button';
import { SettingsIcon, PlusIcon, MinusIcon, MaximizeIcon } from './Icons';
import { findSnapPoint, findClosestSegment, ProcessedGeometry, isPointInRectangle, calculateNestingSnap } from '../services/geometry';
import { calculateEdgePlacement } from '../services/placement';
import { generateNibblePunches, generateDestructPunches } from '../services/punching';
import { ViewBox } from '../hooks/usePanAndZoom';


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
    // Removed Nesting props from here as they are in Sidebar now

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
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
    mode, activePart, processedGeometry, activeNest, currentNestSheet, tools, parts,
    svgRef, viewBox, setViewBox, isDragging, getPointFromEvent, panZoomHandlers,
    onOpenAutoPunchSettings, 
    punchCreationStep, punchCreationPoints, manualPunchMode, selectedToolId,
    selectedPunchId, onSelectPunch, placementReference, placementSide, punchOrientation, snapMode,
    punchOffset, nibbleSettings,
    teachMode = false, selectedSegmentIds = [], selectedTeachPunchIds = [], onTeachBulkSelect,
    selectedNestPartId, onSelectNestPart, onMoveNestPart
}) => {
    const [mousePos, setMousePos] = useState<Point | null>(null);
    const selectedTool = tools.find(t => t.id === selectedToolId);
    
    // Selection Box State
    const [selectionStart, setSelectionStart] = useState<Point | null>(null);
    const [selectionCurrent, setSelectionCurrent] = useState<Point | null>(null);
    const isSelectingRef = useRef(false);

    // Nesting Drag State
    const [draggingNestPartId, setDraggingNestPartId] = useState<string | null>(null);
    const lastDragPos = useRef<Point | null>(null);

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
                y: -5,
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
             setViewBox({ x: -50, y: -50, width: width + 100, height: height + 100 });
        }
    };

    const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
        const pt = getPointFromEvent(event);

        // --- NESTING MODE: Drag Part Logic ---
        if (mode === AppMode.Nesting && activeNest && currentNestSheet && onSelectNestPart) {
            // Check if clicking on a placed part on the CURRENT SHEET
            // Iterate in reverse to catch top-most
            for (let i = currentNestSheet.placedParts.length - 1; i >= 0; i--) {
                const pp = currentNestSheet.placedParts[i];
                const part = parts.find(p => p.id === pp.partId);
                if (part) {
                    // Check hit
                    if (isPointInRectangle(pt, pp.x, pp.y, part.geometry.width, part.geometry.height, pp.rotation)) {
                        onSelectNestPart(pp.id);
                        setDraggingNestPartId(pp.id);
                        lastDragPos.current = pt;
                        event.stopPropagation(); // Stop PanZoom
                        return;
                    }
                }
            }
            // Clicked empty space
            onSelectNestPart(null);
        }

        // --- TEACH MODE: Box Selection Logic ---
        // Left click only
        if (event.button === 0 && teachMode && !isDragging) {
             setSelectionStart(pt);
             setSelectionCurrent(pt);
             isSelectingRef.current = true;
             // Don't stop propagation, allow panZoomHandler to check for its stuff (it usually handles pan on drag but we override if teachMode select)
        }
        
        panZoomHandlers.onMouseDown(event);
    };

    const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
        const pt = getPointFromEvent(event);
        setMousePos(pt);
        
        // --- NESTING MODE: Moving Part ---
        if (draggingNestPartId && lastDragPos.current && onMoveNestPart && activeNest && currentNestSheet) {
            const dx = pt.x - lastDragPos.current.x;
            const dy = pt.y - lastDragPos.current.y;
            
            // Raw movement
            let finalDx = dx;
            let finalDy = dy;
            
            // Nesting Snapping Logic
            // Always active
             const draggedPart = currentNestSheet.placedParts.find(p => p.id === draggingNestPartId);
             if (draggedPart) {
                 // Predict next position
                 const potentialPart = { ...draggedPart, x: draggedPart.x + dx, y: draggedPart.y + dy };
                 const snapPos = calculateNestingSnap(potentialPart, currentNestSheet.placedParts, parts, 15); // 15mm snap radius
                 
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
             // Stop pan if we are selecting box
             event.stopPropagation();
        } else {
             panZoomHandlers.onMouseMove(event);
        }
    };

    const handleMouseUp = (event: MouseEvent<SVGSVGElement>) => {
        // --- NESTING MODE: Stop Drag ---
        if (draggingNestPartId) {
            setDraggingNestPartId(null);
            lastDragPos.current = null;
        }

        if (isSelectingRef.current && selectionStart && selectionCurrent) {
            // Finalize Selection
            if (teachMode && processedGeometry && activePart && onTeachBulkSelect) {
                const x1 = Math.min(selectionStart.x, selectionCurrent.x);
                const x2 = Math.max(selectionStart.x, selectionCurrent.x);
                const y1 = Math.min(selectionStart.y, selectionCurrent.y);
                const y2 = Math.max(selectionStart.y, selectionCurrent.y);
                
                // Avoid tiny accidental drags treated as boxes
                if ((x2 - x1) > 1 || (y2 - y1) > 1) {
                    const foundSegs: number[] = [];
                    const foundPunches: string[] = [];

                    // 1. Find Segments inside box (Simple BBox check of points)
                    processedGeometry.segments.forEach((seg, idx) => {
                        const cx = (seg.p1.x + seg.p2.x) / 2;
                        const cy = (seg.p1.y + seg.p2.y) / 2;
                        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
                            foundSegs.push(idx);
                        }
                    });

                    // 2. Find Punches inside box
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
    
    const renderGhostGeometry = () => {
        if (!mousePos || !activePart) return null;
        
        // For Destruct mode (2-step), keep the line
        if (manualPunchMode === ManualPunchMode.Destruct && punchCreationStep > 0) {
            const startPoint = punchCreationPoints[0];
            const finalPoint = findSnapPoint(mousePos, processedGeometry, snapMode)?.point ?? mousePos;
             return <line x1={startPoint.x} y1={startPoint.y} x2={finalPoint.x} y2={finalPoint.y} stroke="yellow" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
        }
        return null;
    };
    
    const renderGhostTool = () => {
        if (!mousePos || !selectedTool || !activePart || teachMode) return null;

        // --- NIBBLE MODE PREVIEW ---
        if (manualPunchMode === ManualPunchMode.Nibble) {
             const closestSeg = findClosestSegment(mousePos, processedGeometry);
             if (closestSeg) {
                 const previewPunches = generateNibblePunches(
                     closestSeg.p1, 
                     closestSeg.p2, 
                     selectedTool, 
                     nibbleSettings, 
                     closestSeg.angle, 
                     closestSeg.wasNormalized,
                     punchOrientation,
                     punchOffset
                 );

                 return (
                     <g opacity="0.6">
                         {previewPunches.map((p, idx) => (
                             <g key={idx} transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation})`} style={{ pointerEvents: 'none' }}>
                                 <ToolSvg tool={selectedTool} />
                             </g>
                         ))}
                         {/* Highlight the target segment */}
                         <line 
                            x1={closestSeg.p1.x} y1={closestSeg.p1.y} 
                            x2={closestSeg.p2.x} y2={closestSeg.p2.y} 
                            stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="5 5"
                         />
                     </g>
                 );
             }
             return null;
        }
        
        // --- DESTRUCT MODE PREVIEW ---
        if (manualPunchMode === ManualPunchMode.Destruct && punchCreationStep === 1) {
             // Preview not strictly implemented for destruct drag, standard line ghost used above
             return null; 
        }

        // --- SINGLE PUNCH MODE PREVIEW ---
        if (manualPunchMode === ManualPunchMode.Punch) {
            const snapResult = findSnapPoint(mousePos, processedGeometry, snapMode);

            if (!snapResult && snapMode !== SnapMode.Off && placementReference === PlacementReference.Edge) {
                return null;
            }

            const placementPoint = snapResult?.point ?? mousePos;
            let finalX = placementPoint.x;
            let finalY = placementPoint.y;
            let totalRotation = punchOrientation;

            // Auto-switch to Center placement if we snapped to a shape center, otherwise use selected preference
            const effectivePlacementRef = (snapResult && snapMode === SnapMode.ShapeCenter) 
                ? PlacementReference.Center 
                : placementReference;

            if (effectivePlacementRef === PlacementReference.Edge) {
                const placementAngle = snapResult?.angle ?? 0;
                const placement = calculateEdgePlacement(
                    placementPoint,
                    placementAngle,
                    selectedTool,
                    punchOrientation,
                    punchOffset,
                    snapResult?.snapTarget ?? 'middle',
                    snapResult?.wasNormalized ?? false,
                    placementSide
                );
                finalX = placement.x;
                finalY = placement.y;
                totalRotation = placement.rotation;
            }

            const ghost = (
                 <g transform={`translate(${finalX}, ${finalY}) rotate(${totalRotation})`} opacity="0.5" style={{ pointerEvents: 'none' }}>
                    <ToolSvg tool={selectedTool} />
                </g>
            );
            
            const snapIndicator = snapResult && (
                <circle cx={snapResult.point.x} cy={snapResult.point.y} r="5" fill="none" stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
            );

            return <>
                {ghost}
                {snapIndicator}
            </>;
        }
        
        return null;
    };
    
    // Helper for Arc generation
    const getArcPath = (seg: any): string => {
        if (!seg.radius || !seg.center) return `M ${seg.p1.x} ${seg.p1.y} L ${seg.p2.x} ${seg.p2.y}`;
        const r = seg.radius;
        const p1 = seg.p1;
        const p2 = seg.p2;

        // Using normalized coords: standard SVG arc
        return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 0 ${p2.x} ${p2.y}`;
    };

    const renderTeachModeHighlights = () => {
        if (!teachMode || !processedGeometry) return null;
        
        return processedGeometry.segments.map((seg, idx) => {
            const isSelected = selectedSegmentIds.includes(idx);
            
            let pathD = '';
            if (seg.type === 'line') {
                pathD = `M ${seg.p1.x} ${seg.p1.y} L ${seg.p2.x} ${seg.p2.y}`;
            } else if (seg.type === 'arc') {
                pathD = getArcPath(seg);
            }

            return (
                <g key={idx} className="cursor-pointer group">
                     {/* Interaction Hit Box (Thick transparent) */}
                    <path 
                        d={pathD} 
                        stroke="transparent" 
                        strokeWidth="10" 
                        fill="none" 
                        vectorEffect="non-scaling-stroke"
                    />
                    {/* Visual Highlight */}
                    <path 
                        d={pathD} 
                        stroke={isSelected ? "#ec4899" : "transparent"} // Pink if selected
                        strokeWidth="3" 
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                        className={isSelected ? "" : "group-hover:stroke-purple-500/50"}
                    />
                </g>
            );
        });
    };
    
    const renderSelectionBox = () => {
        if (teachMode && selectionStart && selectionCurrent) {
            const x = Math.min(selectionStart.x, selectionCurrent.x);
            const y = Math.min(selectionStart.y, selectionCurrent.y);
            const w = Math.abs(selectionCurrent.x - selectionStart.x);
            const h = Math.abs(selectionCurrent.y - selectionStart.y);
            
            return (
                <rect 
                    x={x} y={y} width={w} height={h} 
                    fill="rgba(236, 72, 153, 0.2)" 
                    stroke="#ec4899" 
                    strokeWidth="1" 
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                />
            );
        }
        return null;
    }

    const renderNestingSheet = () => {
        if (!activeNest) return null;
        
        let sheetW = 2500;
        let sheetH = 1250;
        let placedParts: PlacedPart[] = [];
        let sheetId = "empty";

        if (currentNestSheet) {
            sheetW = currentNestSheet.width;
            sheetH = currentNestSheet.height;
            placedParts = currentNestSheet.placedParts;
            sheetId = currentNestSheet.id;
        } else {
             // If no result sheet, show stock size of active stock
             const activeStock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0];
             if(activeStock) {
                 sheetW = activeStock.width;
                 sheetH = activeStock.height;
             }
        }

        return (
            <svg 
                ref={svgRef}
                width="100%" 
                height="100%" 
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                {...panZoomHandlers}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                className={`cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
            >
                {/* Sheet background */}
                <rect x="0" y="0" width={sheetW} height={sheetH} fill="#2d3748" stroke="#4a5568" strokeWidth="2"/>
                
                {/* Origin Indicator (Bottom Left Visual) */}
                <g transform={`translate(0, ${sheetH})`}>
                     <line x1="0" y1="0" x2="100" y2="0" stroke="lime" strokeWidth="2" />
                     <line x1="0" y1="0" x2="0" y2="-100" stroke="lime" strokeWidth="2" />
                     <text x="10" y="-10" fill="lime" fontSize="20" fontWeight="bold">X</text>
                     <text x="5" y="-80" fill="lime" fontSize="20" fontWeight="bold">Y</text>
                     <circle cx="0" cy="0" r="4" fill="lime" />
                </g>

                {/* Clamps */}
                {activeNest.settings.clampPositions.map((cx, i) => (
                    <g key={i} transform={`translate(${cx}, ${sheetH})`}>
                        {/* Clamp body - centered on cx, attached to bottom edge */}
                        <rect x="-40" y="-50" width="80" height="50" fill="#a0aec0" stroke="#718096" strokeWidth="1" opacity="0.8" />
                        <rect x="-40" y="0" width="80" height="20" fill="#718096" />
                        <text x="0" y="-20" textAnchor="middle" fill="#2d3748" fontSize="12" fontWeight="bold">{i+1}</text>
                    </g>
                ))}

                {/* Placed Parts */}
                {placedParts.map(pp => {
                    const part = parts.find(p => p.id === pp.partId);
                    if(!part) return null;
                    const isSelected = selectedNestPartId === pp.id;

                    return (
                        <g 
                            key={pp.id} 
                            transform={`translate(${pp.x} ${pp.y}) rotate(${pp.rotation})`}
                            className={isSelected ? "opacity-100" : "opacity-90"}
                        >
                            {/* Part Body */}
                            <path 
                                d={part.geometry.path} 
                                fill={isSelected ? "#3182ce" : "#4a5568"} 
                                stroke={isSelected ? "#63b3ed" : "#a0aec0"} 
                                strokeWidth={isSelected ? 2 : 1} 
                                vectorEffect="non-scaling-stroke"
                            />
                            
                            {/* Tools on Part */}
                            {part.punches.map(punch => {
                                const tool = tools.find(t => t.id === punch.toolId);
                                if (!tool) return null;
                                return (
                                    <g 
                                        key={punch.id} 
                                        transform={`translate(${punch.x}, ${punch.y}) rotate(${punch.rotation})`}
                                    >
                                        <ToolSvg tool={tool} />
                                    </g>
                                )
                            })}

                            {/* Part Name Label (Centered roughly) */}
                            <text 
                                x={part.geometry.width / 2} 
                                y={part.geometry.height / 2} 
                                textAnchor="middle" 
                                dominantBaseline="middle"
                                className="text-xs fill-white font-bold select-none pointer-events-none"
                                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                                transform={`rotate(${-pp.rotation}, ${part.geometry.width / 2}, ${part.geometry.height / 2})`} // Counter-rotate text for readability.
                            >
                                {part.name}
                            </text>
                            
                            {/* Selection Outline */}
                            {isSelected && (
                                <rect 
                                    x={-2} y={-2} 
                                    width={part.geometry.width + 4} 
                                    height={part.geometry.height + 4} 
                                    fill="none" 
                                    stroke="yellow" 
                                    strokeWidth="2" 
                                    strokeDasharray="4 2"
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                        </g>
                    )
                })}
            </svg>
        );
    }

    return (
        <main className="flex-1 bg-gray-800 flex flex-col relative">
            {mode === AppMode.PartEditor && (
                <div className="flex-none bg-gray-700/50 p-2 flex items-center space-x-4">
                     <ActionButton icon={<SettingsIcon />} label="Авто-расстановка" onClick={onOpenAutoPunchSettings} disabled={!activePart}/>
                </div>
            )}
            
            <div className="flex-1 bg-grid-pattern p-4 overflow-auto relative">
                <div 
                    className="w-full h-full bg-gray-900 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 overflow-hidden relative"
                >
                    {mode === AppMode.PartEditor && activePart && (
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
                            onClick={(e) => { e.stopPropagation(); if(!teachMode) onSelectPunch(''); }}
                            className={isDragging ? 'cursor-grabbing' : (manualPunchMode !== ManualPunchMode.Punch && !teachMode ? 'cursor-crosshair' : 'cursor-grab')}
                        >
                            <path d={activePart.geometry.path} fill="rgba(31, 41, 55, 0.5)" stroke="#63b3ed" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                            
                            {/* Teach Mode Segment Highlights */}
                            {teachMode && renderTeachModeHighlights()}

                            {activePart.punches.map(punch => {
                                const tool = tools.find(t => t.id === punch.toolId);
                                if(!tool) return null;
                                
                                const isSelected = teachMode ? selectedTeachPunchIds.includes(punch.id) : punch.id === selectedPunchId;
                                const isGrouped = !!punch.lineId;
                                
                                return (
                                <g 
                                    key={punch.id} 
                                    transform={`translate(${punch.x}, ${punch.y}) rotate(${punch.rotation})`}
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onSelectPunch(punch.id); 
                                    }}
                                    className="cursor-pointer"
                                >
                                    {isSelected && <rect x={-tool.width/2-2} y={-tool.height/2-2} width={tool.width+4} height={tool.height+4} fill="none" stroke={teachMode ? "#ec4899" : "cyan"} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                                    
                                    {/* Small crosshair */}
                                    <path d="M -2 0 L 2 0 M 0 -2 L 0 2" stroke={isSelected ? (teachMode ? "#ec4899" : "cyan") : "red"} strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
                                    
                                    <g opacity={isSelected ? 1 : 0.7}>
                                         <ToolSvg tool={tool} />
                                    </g>
                                    {isGrouped && isSelected && !teachMode && <circle r="2" fill="yellow" cy="-5"/>}
                                </g>
                                )
                            })}
                            {renderGhostGeometry()}
                            {renderGhostTool()}
                            {renderSelectionBox()}
                        </svg>
                    )}
                    {mode === AppMode.Nesting && activeNest && renderNestingSheet()}
                     {!activePart && mode === AppMode.PartEditor && <span>Загрузите DXF или выберите деталь из библиотеки</span>}
                     
                     {/* Zoom Controls */}
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
