
/**
 * ОТВЕТСТВЕННОСТЬ: Настройка физических параметров гнезда и управление установленным инструментом.
 */
import React from 'react';
import { StationConfig, Tool } from '../../types';
import { ToolPreview } from '../common/ToolDisplay';
import { TrashIcon } from '../Icons';

interface StationControlPanelProps {
    selectedStation: StationConfig | undefined;
    isMtView: boolean;
    selectedMtSlotId: number | null;
    activeTool: Tool | undefined;
    onUpdateStation: (id: number, u: Partial<StationConfig>) => void;
    onUpdateRotation: (id: string, r: number) => void;
    onUnmount: (id: string) => void;
    onOpenMt: () => void;
}

export const StationControlPanel: React.FC<StationControlPanelProps> = (props) => {
    const { selectedStation, isMtView, selectedMtSlotId, activeTool } = props;

    if (!selectedStation) return (
        <div className="p-4 border-b border-gray-700 bg-gray-800">
            <p className="text-xs text-gray-500 italic">Нажмите на станцию слева для редактирования</p>
        </div>
    );

    return (
        <div className="p-4 border-b border-gray-700 bg-gray-800">
            <h3 className="font-bold text-gray-300 mb-2">
                {isMtView ? `MT Станция ${selectedStation.id} - Слот ${selectedMtSlotId || '?'}` : `Станция ${selectedStation.id}`}
            </h3>
            
            <div className="space-y-3">
                {!isMtView && (
                    <div className="flex space-x-4">
                        <div className="flex-1">
                            <label className="text-xs text-gray-400 block mb-1">Тип гнезда</label>
                            <select 
                                value={selectedStation.type}
                                onChange={(e) => props.onUpdateStation(selectedStation.id, { type: e.target.value })}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                            >
                                {['A', 'B', 'C', 'D', 'MT'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={selectedStation.isAutoIndex} 
                                    onChange={(e) => props.onUpdateStation(selectedStation.id, { isAutoIndex: e.target.checked })}
                                    className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                                />
                                <span className="text-sm">Auto Index</span>
                            </label>
                        </div>
                    </div>
                )}
                
                {activeTool ? (
                    <div className="bg-gray-700 p-3 rounded mt-2 border border-gray-600">
                        <div className="flex items-center space-x-3 mb-3">
                            <div className="w-10 h-10 bg-white rounded flex-shrink-0 overflow-hidden"><ToolPreview tool={activeTool} /></div>
                            <div className="overflow-hidden">
                                <div className="font-bold text-sm text-white truncate" title={activeTool.name}>{activeTool.name}</div>
                                <div className="text-xs text-gray-400">{activeTool.width}x{activeTool.height}</div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1">Положение (°)</label>
                                <select 
                                    value={activeTool.defaultRotation || 0} 
                                    onChange={(e) => props.onUpdateRotation(activeTool.id, parseFloat(e.target.value))}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs"
                                >
                                    {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => <option key={angle} value={angle}>{angle}°</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1">Зазор матрицы</label>
                                <div className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300">
                                    {activeTool.dies?.[0]?.clearance || '0.0'} мм
                                </div>
                            </div>
                        </div>

                        <button onClick={() => props.onUnmount(activeTool.id)} className="w-full bg-red-800 hover:bg-red-700 text-white text-xs py-2 rounded flex items-center justify-center transition-colors">
                            <TrashIcon className="w-4 h-4 mr-2" /> Снять инструмент
                        </button>
                    </div>
                ) : (
                    <div className="bg-gray-700/50 border border-dashed border-gray-600 rounded p-4 text-center">
                        <p className="text-xs text-gray-500">Инструмент не установлен</p>
                    </div>
                )}

                {selectedStation.type === 'MT' && !isMtView && (
                    <button onClick={props.onOpenMt} className="w-full bg-purple-700 hover:bg-purple-600 text-white py-1 rounded text-sm mt-2">
                        Открыть Multi-Tool
                    </button>
                )}
            </div>
        </div>
    );
};
