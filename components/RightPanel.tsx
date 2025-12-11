
import React, { useState, useMemo } from 'react';
import { Tool, NestLayout, Part, PunchOp, ToolShape } from '../types';
import { ToolPreview } from './common/ToolDisplay';
import { SettingsIcon, LayersIcon, PlayIcon } from './Icons';

interface RightPanelProps {
    tools: Tool[];
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    onOpenTurretView: () => void;
    
    isNestingMode: boolean;
    activeNest: NestLayout | null;
    activeSheetIndex: number;
    setActiveSheetIndex: (index: number) => void;
    allParts: Part[];
    
    simulationStep: number;
    totalSimulationSteps: number;
    isSimulating: boolean;
    simulationSpeed: number;
    onToggleSimulation: () => void;
    onStopSimulation: () => void;
    onStepChange: (step: number) => void;
    onSpeedChange: (speed: number) => void;
    optimizedOperations: PunchOp[] | null;
}

export const RightPanel: React.FC<RightPanelProps> = ({
    tools, selectedToolId, setSelectedToolId, onOpenTurretView,
    isNestingMode, activeNest, activeSheetIndex, setActiveSheetIndex, allParts,
    simulationStep, totalSimulationSteps, isSimulating, simulationSpeed,
    onToggleSimulation, onStopSimulation, onStepChange, onSpeedChange, optimizedOperations
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredTools = tools.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

    // --- Nesting Statistics Calculation ---
    const nestingStats = useMemo(() => {
        if (!activeNest || activeNest.sheets.length === 0) return null;

        let totalArea = 0;
        let totalUsedArea = 0;
        let totalSheetsCount = 0;
        const sheetsByDim: Record<string, number> = {};

        activeNest.sheets.forEach(sheet => {
            const sheetArea = sheet.width * sheet.height;
            const sheetUsed = (sheet.usedArea / 100) * sheetArea;
            
            // Weighted by quantity of this layout
            totalArea += sheetArea * sheet.quantity;
            totalUsedArea += sheetUsed * sheet.quantity;
            totalSheetsCount += sheet.quantity;

            const dimKey = `${sheet.width}x${sheet.height}`;
            sheetsByDim[dimKey] = (sheetsByDim[dimKey] || 0) + sheet.quantity;
        });

        const totalScrapPct = totalArea > 0 ? (1 - totalUsedArea / totalArea) * 100 : 0;

        return {
            totalScrapPct,
            totalSheetsCount,
            uniqueLayouts: activeNest.sheets.length,
            sheetsByDim
        };
    }, [activeNest]);

    const getPartsOnSheet = (sheetIndex: number) => {
        if (!activeNest || !activeNest.sheets[sheetIndex]) return [];
        const sheet = activeNest.sheets[sheetIndex];
        const counts: Record<string, number> = {};
        
        sheet.placedParts.forEach(pp => {
            counts[pp.partId] = (counts[pp.partId] || 0) + 1;
        });

        return Object.entries(counts).map(([partId, count]) => {
            const part = allParts.find(p => p.id === partId);
            return { name: part ? part.name : 'Unknown', count };
        });
    };

    return (
        <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col h-full text-sm">
            {isNestingMode ? (
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="p-3 bg-gray-900 border-b border-gray-700">
                        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide">Отчет Раскроя</h3>
                    </div>
                    
                    {nestingStats ? (
                        <>
                            {/* --- 1. Global Summary --- */}
                            <div className="p-4 bg-gray-800 border-b border-gray-700 space-y-3 shadow-md z-10 flex-none">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Общий отход:</span>
                                    <span className={`font-bold text-lg ${nestingStats.totalScrapPct > 20 ? 'text-red-400' : 'text-green-400'}`}>
                                        {nestingStats.totalScrapPct.toFixed(1)}%
                                    </span>
                                </div>
                                
                                <div className="bg-gray-700/50 p-2 rounded text-xs space-y-1">
                                    <div className="flex justify-between text-gray-300 border-b border-gray-600 pb-1 mb-1">
                                        <span>Карт раскроя:</span>
                                        <span className="font-bold">{nestingStats.uniqueLayouts}</span>
                                    </div>
                                    <div className="text-gray-400 mb-1">Расход листов:</div>
                                    {Object.entries(nestingStats.sheetsByDim).map(([dim, count]) => (
                                        <div key={dim} className="flex justify-between text-gray-200">
                                            <span>{dim} мм</span>
                                            <span className="font-mono">x{count}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between text-gray-300 font-bold border-t border-gray-600 pt-1 mt-1">
                                        <span>Всего листов:</span>
                                        <span>{nestingStats.totalSheetsCount}</span>
                                    </div>
                                </div>
                            </div>

                            {/* --- Split Container: Sheets & Details --- */}
                            <div className="flex-1 flex flex-col overflow-hidden bg-gray-800">
                                
                                {/* 2. Scrollable Sheet List (Cards only) */}
                                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase pl-1">Список карт</div>
                                    {activeNest?.sheets.map((sheet, idx) => {
                                        const isActive = idx === activeSheetIndex;
                                        
                                        return (
                                            <div 
                                                key={sheet.id}
                                                onClick={() => setActiveSheetIndex(idx)}
                                                className={`p-3 rounded border cursor-pointer transition-all flex justify-between items-center ${isActive ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/50' : 'bg-gray-700 border-gray-600 hover:border-gray-500'}`}
                                            >
                                                <div>
                                                    <div className="font-bold text-white text-xs">{sheet.sheetName || `Лист ${idx+1}`}</div>
                                                    <div className="text-[10px] text-gray-400">{sheet.width} x {sheet.height}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="bg-gray-800 px-2 py-0.5 rounded text-white font-mono text-xs mb-1">x{sheet.quantity}</div>
                                                    <div className={`text-[10px] font-bold ${sheet.scrapPercentage > 20 ? 'text-red-400' : 'text-green-400'}`}>
                                                        {sheet.scrapPercentage.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* 3. Detail Block for Selected Sheet */}
                                <div className="h-56 bg-gray-900 border-t border-gray-700 flex flex-col flex-none">
                                    <div className="p-2 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
                                         <h4 className="text-xs font-bold text-gray-300">Состав листа {activeSheetIndex + 1}</h4>
                                         <span className="text-[10px] text-gray-500">{activeNest?.sheets[activeSheetIndex]?.placedParts.length || 0} деталей</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                         {getPartsOnSheet(activeSheetIndex).map((p, i) => (
                                             <div key={i} className="flex justify-between items-center bg-gray-800 p-2 rounded text-xs border border-gray-700 hover:bg-gray-700 transition-colors">
                                                 <span className="text-gray-300 truncate mr-2" title={p.name}>{p.name}</span>
                                                 <span className="font-mono font-bold text-blue-400">{p.count} шт</span>
                                             </div>
                                         ))}
                                         {getPartsOnSheet(activeSheetIndex).length === 0 && (
                                             <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                                                 Детали не найдены
                                             </div>
                                         )}
                                    </div>
                                </div>
                            </div>

                            {/* --- 4. Simulation Controls (Bottom Fixed) --- */}
                            {optimizedOperations && (
                                <div className="p-3 bg-gray-900 border-t border-gray-700 space-y-2 flex-none">
                                    <div className="flex justify-between items-center text-xs text-gray-400">
                                        <span className="uppercase font-bold text-blue-400">Симуляция</span>
                                        <span>{simulationStep} / {totalSimulationSteps}</span>
                                    </div>
                                    
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max={totalSimulationSteps > 0 ? totalSimulationSteps - 1 : 0} 
                                        value={simulationStep} 
                                        onChange={(e) => onStepChange(parseInt(e.target.value))}
                                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />

                                    <div className="flex space-x-2">
                                        <button 
                                            onClick={onToggleSimulation} 
                                            className={`flex-1 py-1.5 rounded text-xs font-bold text-white transition-colors flex items-center justify-center ${isSimulating ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500'}`}
                                        >
                                            <PlayIcon className="w-3 h-3 mr-1"/>
                                            {isSimulating ? 'Пауза' : 'Старт'}
                                        </button>
                                        <button onClick={onStopSimulation} className="px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-xs text-white">Стоп</button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                            <p className="mb-2">Нет результатов раскроя</p>
                            <p className="text-xs">Запустите раскрой в левой панели для получения карт.</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col h-full">
                    <div className="p-3 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-300 uppercase flex items-center">
                            <LayersIcon className="w-4 h-4 mr-2"/>
                            Инструменты
                        </h3>
                        <button onClick={onOpenTurretView} className="text-gray-400 hover:text-white" title="Настройка револьвера">
                            <SettingsIcon className="w-4 h-4"/>
                        </button>
                    </div>
                    
                    <div className="p-2 border-b border-gray-700">
                        <input 
                            type="text" 
                            placeholder="Поиск..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredTools.map(t => (
                            <div 
                                key={t.id} 
                                className={`p-2 rounded-md flex items-center space-x-3 cursor-pointer transition-all border ${selectedToolId === t.id ? 'bg-blue-600 border-blue-400 ring-1 ring-blue-300' : 'bg-gray-800 border-gray-600 hover:bg-gray-600'}`} 
                                onClick={() => setSelectedToolId(selectedToolId === t.id ? null : t.id)}
                            >
                                <div className="w-10 h-10 flex items-center justify-center scale-75 flex-shrink-0 bg-white rounded shadow-sm">
                                    <ToolPreview tool={t}/>
                                </div>
                                <div className="overflow-hidden">
                                    <span className="truncate block font-medium text-sm text-gray-200">{t.name}</span>
                                    <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                                        <span>{t.shape === ToolShape.Circle ? `Ø${t.width}` : `${t.width}x${t.height}`}</span>
                                        <span className={`px-1 rounded ${t.stationNumber ? 'bg-green-900 text-green-300' : 'bg-gray-700'}`}>
                                            {t.stationNumber ? `ST:${t.stationNumber}` : 'Lib'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredTools.length === 0 && <p className="text-center text-xs text-gray-500 mt-4">Не найдено</p>}
                    </div>
                </div>
            )}
        </aside>
    );
};
