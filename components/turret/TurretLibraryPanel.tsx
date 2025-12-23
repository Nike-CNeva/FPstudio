
/**
 * ОТВЕТСТВЕННОСТЬ: Отображение доступных инструментов и их фильтрация по совместимости с выбранной станцией.
 */
import React from 'react';
import { Tool, StationConfig } from '../../types';
import { ToolPreview } from '../common/ToolDisplay';

interface TurretLibraryPanelProps {
    tools: Tool[];
    selectedStation: StationConfig | undefined;
    isMtView: boolean;
    selectedMtSlotId: number | null;
    onMount: (tool: Tool, mtIdx?: number) => void;
}

export const TurretLibraryPanel: React.FC<TurretLibraryPanelProps> = (props) => {
    const { tools, selectedStation, isMtView, selectedMtSlotId } = props;

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-2 bg-gray-900 border-b border-gray-700">
                <h4 className="text-xs font-bold text-gray-400 uppercase">Библиотека доступных</h4>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                 {tools.map(tool => {
                     const displaySize = (tool.stationType === 'MT' || tool.name.startsWith('MT')) ? 'MT' : tool.toolSize;
                     let isCompatible = false;
                     if (selectedStation) {
                         if (isMtView) isCompatible = tool.stationType === 'MT'; 
                         else if (selectedStation.type === 'MT') isCompatible = false; 
                         else isCompatible = tool.toolSize === selectedStation.type;
                     }
                     
                     const canMount = isCompatible && ((!isMtView && selectedStation) || (isMtView && selectedMtSlotId));

                     return (
                        <div key={tool.id} className={`bg-gray-700 p-2 rounded flex flex-col group border border-transparent ${isCompatible ? 'hover:border-blue-400' : 'opacity-40 grayscale'}`}>
                            <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 bg-white rounded flex-shrink-0"><ToolPreview tool={tool} /></div>
                                <div className="overflow-hidden flex-1">
                                    <div className="font-bold text-sm text-white truncate">{tool.name}</div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>{tool.shape} {tool.width}x{tool.height}</span>
                                        <span className={`font-bold ${displaySize === 'MT' ? 'text-purple-400' : 'text-yellow-400'}`}>{displaySize}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {canMount && (
                                <div className="mt-2">
                                    <button 
                                        onClick={() => props.onMount(tool, isMtView && selectedMtSlotId ? selectedMtSlotId : 0)}
                                        className={`w-full text-white text-xs py-1 rounded ${isMtView ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                                    >
                                        {isMtView ? `В слот ${selectedMtSlotId}` : "Установить"}
                                    </button>
                                </div>
                            )}
                        </div>
                     );
                 })}
                 {tools.length === 0 && <div className="text-center text-gray-500 text-sm mt-4 italic">Нет свободных инструментов</div>}
            </div>
        </div>
    );
};
