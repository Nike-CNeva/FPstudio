import React, { useEffect, useMemo } from 'react';
import { NestLayout, NestResultSheet, Part, Tool, PunchOp } from '../../types';
import { ToolSvg } from '../common/ToolDisplay';
import { checkPlacedPartCollision, PartCollisionStatus } from '../../services/geometry/nestingLogic';

interface NestingCanvasProps {
    activeNest: NestLayout;
    currentNestSheet: NestResultSheet | null | undefined;
    parts: Part[];
    tools: Tool[];
    
    selectedNestPartId?: string | null;
    onSelectNestPart?: (id: string | null) => void;
    onMoveNestPart?: (id: string, dx: number, dy: number) => void;
    onRotateNestPart?: (id: string) => void;
    onDeleteNestPart?: (id: string) => void;
    onDuplicateNestPart?: (id: string) => void;

    optimizedOperations?: PunchOp[] | null;
    simulationStep?: number;
}

export const NestingCanvas: React.FC<NestingCanvasProps> = ({ 
    activeNest, currentNestSheet, parts, tools,
    selectedNestPartId, onSelectNestPart, onMoveNestPart, onRotateNestPart, onDeleteNestPart, onDuplicateNestPart,
    optimizedOperations, simulationStep = 0
}) => {
    
    let sheetW = 2500;
    let sheetH = 1250;
    let placedParts = currentNestSheet ? currentNestSheet.placedParts : [];

    if (currentNestSheet) {
        sheetW = currentNestSheet.width;
        sheetH = currentNestSheet.height;
    } else {
        const activeStock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0];
        if (activeStock) { sheetW = activeStock.width; sheetH = activeStock.height; }
    }

    // Обработка горячих клавиш для выбранной детали раскроя
    useEffect(() => {
        if (!selectedNestPartId) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
                return;
            }

            const step = e.shiftKey ? 10 : 1;

            if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
                e.preventDefault();
                if (onRotateNestPart) onRotateNestPart(selectedNestPartId);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (onMoveNestPart) onMoveNestPart(selectedNestPartId, 0, step);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (onMoveNestPart) onMoveNestPart(selectedNestPartId, 0, -step);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (onMoveNestPart) onMoveNestPart(selectedNestPartId, -step, 0);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (onMoveNestPart) onMoveNestPart(selectedNestPartId, step, 0);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (onDeleteNestPart) onDeleteNestPart(selectedNestPartId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (onSelectNestPart) onSelectNestPart(null);
            } else if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (onDuplicateNestPart) onDuplicateNestPart(selectedNestPartId);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNestPartId, onRotateNestPart, onMoveNestPart, onDeleteNestPart, onDuplicateNestPart, onSelectNestPart]);

    // Проверка коллизий всех размещенных деталей на текущем листе
    const placedPartCollisions = useMemo(() => {
        const map = new Map<string, PartCollisionStatus>();
        if (!currentNestSheet) return map;

        const settings = activeNest.settings;
        for (const pp of currentNestSheet.placedParts) {
            const partDef = parts.find(p => p.id === pp.partId);
            if (!partDef) continue;
            const status = checkPlacedPartCollision(
                pp,
                partDef,
                currentNestSheet.placedParts,
                parts,
                settings,
                sheetW,
                sheetH
            );
            map.set(pp.id, status);
        }
        return map;
    }, [currentNestSheet, activeNest.settings, parts, sheetW, sheetH]);

    const selectedPlacedPart = placedParts.find(p => p.id === selectedNestPartId);
    const selectedPartDef = selectedPlacedPart ? parts.find(p => p.id === selectedPlacedPart.partId) : null;
    const selectedPartStatus = selectedNestPartId ? placedPartCollisions.get(selectedNestPartId) : null;

    const renderOptimizedPath = () => {
        if (!optimizedOperations || optimizedOperations.length < 2) return null;
        let pathD = `M ${optimizedOperations[0].x} ${optimizedOperations[0].y}`;
        for (let i = 1; i < optimizedOperations.length; i++) {
            pathD += ` L ${optimizedOperations[i].x} ${optimizedOperations[i].y}`;
        }
        return (
            <path 
                d={pathD} 
                fill="none" 
                stroke="#d69e2e"
                strokeWidth="1" 
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
                opacity="0.7"
                style={{ pointerEvents: 'none' }}
            />
        );
    };

    const renderOptimizedHead = () => {
        if (!optimizedOperations || optimizedOperations.length === 0) return null;
        const currentOp = optimizedOperations[simulationStep];
        if (!currentOp) return null;
        return (
            <g transform={`translate(${currentOp.x}, ${currentOp.y})`}>
                <line x1="-15" y1="0" x2="15" y2="0" stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                <line x1="0" y1="-15" x2="0" y2="15" stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                <circle r="5" stroke="cyan" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke"/>
            </g>
        );
    };

    return (
        <g>
            {/* Контур листа заготовки */}
            <rect x="0" y="0" width={sheetW} height={sheetH} fill="#2d3748" fillOpacity="0.8" stroke="#4a5568" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            
            {/* Границы технологических полей листа (Margins) */}
            <rect 
                x={activeNest.settings.sheetMarginLeft} 
                y={activeNest.settings.sheetMarginBottom} 
                width={Math.max(0, sheetW - activeNest.settings.sheetMarginLeft - activeNest.settings.sheetMarginRight)} 
                height={Math.max(0, sheetH - activeNest.settings.sheetMarginTop - activeNest.settings.sheetMarginBottom)} 
                fill="none" 
                stroke="#63b3ed" 
                strokeWidth="1" 
                strokeDasharray="4 4" 
                vectorEffect="non-scaling-stroke" 
                opacity="0.3"
            />
            
            {/* Оси координат станка (0,0) */}
            <g transform={`translate(0, 0)`}>
                 <line x1="0" y1="0" x2="100" y2="0" stroke="lime" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                 <line x1="0" y1="0" x2="0" y2="100" stroke="lime" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                 <g transform="scale(1, -1)">
                     <text x="10" y="-10" fill="lime" fontSize="20" fontWeight="bold">X</text>
                     <text x="5" y="-80" fill="lime" fontSize="20" fontWeight="bold">Y</text>
                 </g>
                 <circle cx="0" cy="0" r="4" fill="lime" vectorEffect="non-scaling-stroke"/>
            </g>

            {/* Зажимы гидравлические Finn-Power */}
            {activeNest.settings.clampPositions.map((cx, i) => (
                <g key={i} transform={`translate(${cx}, 0)`}>
                    <rect x="-40" y="-50" width="80" height="50" fill="#a0aec0" stroke="#718096" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke" />
                    <rect x="-40" y="0" width="80" height="20" fill="#718096" vectorEffect="non-scaling-stroke" />
                    <g transform="scale(1, -1)">
                        <text x="0" y="20" textAnchor="middle" fill="#2d3748" fontSize="12" fontWeight="bold">{i+1}</text>
                    </g>
                </g>
            ))}

            {/* Детали на карте раскроя */}
            {placedParts.map(pp => {
                const part = parts.find(p => p.id === pp.partId);
                if (!part) return null;
                const isSelected = selectedNestPartId === pp.id;
                const status = placedPartCollisions.get(pp.id);
                const hasCollision = status && !status.isSafe;

                let partFill = "#4a5568";
                let partStroke = "#a0aec0";
                if (isSelected) {
                    partFill = hasCollision ? "#9b2c2c" : "#2b6cb0";
                    partStroke = hasCollision ? "#fc8181" : "#63b3ed";
                } else if (hasCollision) {
                    partFill = "#742a2a";
                    partStroke = "#e53e3e";
                }

                return (
                    <g 
                        key={pp.id} 
                        transform={`translate(${pp.x} ${pp.y}) rotate(${pp.rotation})`}
                        className={isSelected ? "opacity-100" : "opacity-90 cursor-pointer"}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectNestPart) onSelectNestPart(pp.id);
                        }}
                    >
                        <path 
                            d={part.geometry.path} 
                            fill={partFill} 
                            stroke={partStroke} 
                            strokeWidth={isSelected ? 2 : (hasCollision ? 2 : 1)} 
                            vectorEffect="non-scaling-stroke"
                        />
                        
                        {part.punches.map(punch => {
                            const tool = tools.find(t => t.id === punch.toolId);
                            if (!tool) return null;
                            
                            let simStatus: 'pending' | 'active' | 'done' = 'pending';
                            if (optimizedOperations) {
                                const currentCompositeId = `${pp.id}_${punch.id}`;
                                const opIndex = optimizedOperations.findIndex(op => op.compositeId === currentCompositeId);
                                if (opIndex !== -1) {
                                    if (opIndex < simulationStep) simStatus = 'done';
                                    else if (opIndex === simulationStep) simStatus = 'active';
                                    else simStatus = 'pending';
                                }
                            }

                            return (
                                <g 
                                    key={punch.id} 
                                    transform={`translate(${punch.x}, ${punch.y}) rotate(${punch.rotation})`}
                                >
                                    <g 
                                        className={
                                            simStatus === 'done' ? '' : 
                                            (simStatus === 'active' ? 'text-white drop-shadow-[0_0_5px_cyan] animate-pulse' : 
                                            (optimizedOperations ? 'text-gray-600' : 'text-[#f6e05e]'))
                                        }
                                        style={
                                            simStatus === 'done' 
                                                ? { fill: '#111827', stroke: '#374151', strokeWidth: 0.5 }
                                                : (simStatus === 'active' ? { fill: 'cyan', stroke: 'white' } : {})
                                        }
                                    >
                                        <ToolSvg tool={tool} />
                                    </g>
                                </g>
                            );
                        })}

                        {/* Имя детали */}
                        <g transform={`translate(${part.geometry.width / 2}, ${part.geometry.height / 2}) rotate(${-pp.rotation}) scale(1, -1)`}>
                            <text textAnchor="middle" dominantBaseline="middle" className="text-xs fill-white font-bold select-none pointer-events-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                {part.name}
                            </text>
                        </g>
                        
                        {/* Рамка выделения */}
                        {isSelected && (
                            <rect 
                                x={-2} y={-2} 
                                width={part.geometry.width + 4} 
                                height={part.geometry.height + 4} 
                                fill="none" 
                                stroke={hasCollision ? "#feb2b2" : "#f6e05e"} 
                                strokeWidth="2" 
                                strokeDasharray="4 2" 
                                vectorEffect="non-scaling-stroke"
                            />
                        )}
                    </g>
                );
            })}
            
            {renderOptimizedPath()}
            {renderOptimizedHead()}

            {/* Плавающая панель управления и статуса безопасности выделенной детали */}
            {selectedNestPartId && selectedPlacedPart && selectedPartDef && (
                <g transform={`translate(20, ${sheetH - 20}) scale(1, -1)`}>
                    <foreignObject width="360" height="230" className="overflow-visible pointer-events-auto">
                        <div className="bg-gray-900/95 text-white p-3 rounded-lg border border-cyan-500/50 shadow-2xl backdrop-blur-md font-sans text-xs flex flex-col gap-2 pointer-events-auto select-none">
                            {/* Шапка: Имя детали и статус коллизий */}
                            <div className="flex items-center justify-between border-b border-gray-700/80 pb-1.5">
                                <span className="font-bold text-cyan-300 truncate max-w-[190px]" title={selectedPartDef.name}>
                                    {selectedPartDef.name}
                                </span>
                                {selectedPartStatus?.isSafe ? (
                                    <span className="px-2 py-0.5 rounded bg-green-900/80 text-green-300 text-[10px] font-bold border border-green-600/50 flex items-center gap-1">
                                        🟢 Норма
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-200 text-[10px] font-bold border border-red-600/50 flex items-center gap-1">
                                        🔴 {selectedPartStatus?.outOfBounds ? 'Выход за поля' : (selectedPartStatus?.clampCollision ? 'Конфликт зажимов' : 'Перекрытие')}
                                    </span>
                                )}
                            </div>

                            {/* Позиционирование X, Y, W, H, Rotation */}
                            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-gray-800/80 p-1.5 rounded border border-gray-700/80">
                                <div>X: <span className="text-yellow-400 font-bold">{selectedPlacedPart.x.toFixed(1)}</span></div>
                                <div>Y: <span className="text-yellow-400 font-bold">{selectedPlacedPart.y.toFixed(1)}</span></div>
                                <div>Угол: <span className="text-cyan-400 font-bold">{selectedPlacedPart.rotation}°</span></div>
                            </div>

                            {/* Описание конфликтов при их наличии */}
                            {selectedPartStatus && !selectedPartStatus.isSafe && (
                                <div className="text-[10px] text-red-300 bg-red-950/60 p-1.5 rounded border border-red-800/50 font-mono">
                                    {selectedPartStatus.outOfBounds && <div>• Выходит за границы технологических полей.</div>}
                                    {selectedPartStatus.clampCollision && <div>• Пересекает зону гидравлических зажимов.</div>}
                                    {selectedPartStatus.partOverlap && (
                                        <div>• Наложение на: {selectedPartStatus.collidingPartNames.join(', ')}</div>
                                    )}
                                </div>
                            )}

                            {/* Кнопки прямого взаимодействия */}
                            <div className="flex items-center justify-between gap-1 pt-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onRotateNestPart) onRotateNestPart(selectedNestPartId); }}
                                    className="flex-1 bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white py-1.5 px-2 rounded flex items-center justify-center gap-1 font-medium transition cursor-pointer"
                                    title="Повернуть на +90° (Горячая клавиша: R / Пробел)"
                                >
                                    ↻ +90°
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onDuplicateNestPart) onDuplicateNestPart(selectedNestPartId); }}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white py-1.5 px-2 rounded flex items-center justify-center gap-1 font-medium transition cursor-pointer"
                                    title="Создать копию детали (Горячая клавиша: D)"
                                >
                                    📋 Копия
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onDeleteNestPart) onDeleteNestPart(selectedNestPartId); }}
                                    className="flex-1 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white py-1.5 px-2 rounded flex items-center justify-center gap-1 font-medium transition cursor-pointer"
                                    title="Удалить деталь с листа (Горячая клавиша: Delete / Backspace)"
                                >
                                    🗑 Удалить
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onSelectNestPart) onSelectNestPart(null); }}
                                    className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition cursor-pointer"
                                    title="Снять выделение (Escape)"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Управление перемещением клавишами */}
                            <div className="flex items-center justify-between border-t border-gray-700/80 pt-1.5 text-[10px] text-gray-400">
                                <span>Смещение (Стрелки / Shift+Стрелки):</span>
                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); if (onMoveNestPart) onMoveNestPart(selectedNestPartId, -1, 0); }} className="w-5 h-5 bg-gray-800 hover:bg-gray-700 rounded text-center font-bold text-white cursor-pointer">◄</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (onMoveNestPart) onMoveNestPart(selectedNestPartId, 0, 1); }} className="w-5 h-5 bg-gray-800 hover:bg-gray-700 rounded text-center font-bold text-white cursor-pointer">▲</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (onMoveNestPart) onMoveNestPart(selectedNestPartId, 0, -1); }} className="w-5 h-5 bg-gray-800 hover:bg-gray-700 rounded text-center font-bold text-white cursor-pointer">▼</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (onMoveNestPart) onMoveNestPart(selectedNestPartId, 1, 0); }} className="w-5 h-5 bg-gray-800 hover:bg-gray-700 rounded text-center font-bold text-white cursor-pointer">►</button>
                                </div>
                            </div>
                        </div>
                    </foreignObject>
                </g>
            )}
        </g>
    );
};
