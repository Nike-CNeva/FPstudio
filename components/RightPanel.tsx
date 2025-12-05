
import React, { useState } from 'react';
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

    return (
        <aside className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col h-full">
            {isNestingMode ? (
                <div className="flex flex-col h-full">
                    <div className="p-3 bg-gray-900 border-b border-gray-700">
                        <h3 className="text-sm font-bold text-gray-300 uppercase">Результаты</h3>
                    </div>
                    
                    {activeNest && activeNest.sheets.length > 0 ? (
                        <div className="p-2 space-y-4 overflow-y-auto flex-1">
                            {/* Sheet Navigation */}
                            <div className="bg-gray-700/50 p-2 rounded border border-gray-600">
                                <label className="text-xs text-gray-400 block mb-2">Лист {activeSheetIndex + 1} из {activeNest.sheets.length}</label>
                                <div className="flex space-x-1">
                                    {activeNest.sheets.map((_, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={() => setActiveSheetIndex(idx)}
                                            className={`w-6 h-6 text-xs rounded ${activeSheetIndex === idx ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                                        >
                                            {idx + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Simulation Controls */}
                            {optimizedOperations && (
                                <div className="bg-gray-700/50 p-3 rounded border border-gray-600 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-bold text-blue-400 uppercase">Симуляция</h4>
                                        <span className="text-[10px] text-gray-400">{simulationStep} / {totalSimulationSteps}</span>
                                    </div>
                                    
                                    <div className="flex space-x-2">
                                        <button 
                                            onClick={onToggleSimulation} 
                                            className={`flex-1 py-1 rounded text-xs font-bold text-white transition-colors ${isSimulating ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500'}`}
                                        >
                                            {isSimulating ? 'Пауза' : 'Старт'}
                                        </button>
                                        <button onClick={onStopSimulation} className="px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs text-white">Стоп</button>
                                    </div>

                                    <div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max={totalSimulationSteps > 0 ? totalSimulationSteps - 1 : 0} 
                                            value={simulationStep} 
                                            onChange={(e) => onStepChange(parseInt(e.target.value))}
                                            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <span className="text-[10px] text-gray-400">Скорость:</span>
                                        <input 
                                            type="range" 
                                            min="10" 
                                            max="500" 
                                            step="10"
                                            value={simulationSpeed} // Inverse logic usually, but here ms per step
                                            onChange={(e) => onSpeedChange(parseInt(e.target.value))}
                                            className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                            style={{ direction: 'rtl' }} // Lower ms = faster
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Stats */}
                            <div className="text-xs text-gray-400 space-y-1">
                                <p>Использование: <span className="text-white font-bold">{activeNest.sheets[activeSheetIndex].usedArea.toFixed(1)}%</span></p>
                                <p>Деталей: <span className="text-white">{activeNest.sheets[activeSheetIndex].partCount}</span></p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 text-center text-xs text-gray-500">Нет результатов раскроя</div>
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
