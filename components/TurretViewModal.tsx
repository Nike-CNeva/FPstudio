
import React, { useState } from 'react';
import { Tool, TurretLayout } from '../types';
import { ToolPreview } from './common/ToolDisplay';
import { generateId } from '../utils/helpers';
import { TurretVisualizer, MtVisualizer } from './common/TurretVisualizer';

interface TurretViewModalProps {
    tools: Tool[];
    setTools: React.Dispatch<React.SetStateAction<Tool[]>>;
    layouts: TurretLayout[];
    setLayouts: React.Dispatch<React.SetStateAction<TurretLayout[]>>;
    onClose: () => void;
}

export const TurretViewModal: React.FC<TurretViewModalProps> = ({ tools, setTools, layouts, setLayouts, onClose }) => {
    const [selectedStation, setSelectedStation] = useState<number | null>(null);
    const [isMtView, setIsMtView] = useState(false);
    const [activeLayoutId, setActiveLayoutId] = useState<string>(layouts[0]?.id || '');
    const [selectedMtSlot, setSelectedMtSlot] = useState<number | null>(null);

    // Derived state
    const activeLayout = layouts.find(l => l.id === activeLayoutId) || layouts[0];
    const stationsConfig = activeLayout ? activeLayout.stations : [];
    
    // Tools logic (filtered by mounting status)
    const toolsOnTurret = tools.filter(t => t.stationNumber !== 0 && t.stationNumber !== undefined);
    const availableTools = tools.filter(t => !t.stationNumber);

    const loadLayout = (layoutId: string) => {
        const layout = layouts.find(l => l.id === layoutId);
        if (!layout) return;
        setTools(layout.toolsSnapshot);
        setActiveLayoutId(layoutId);
        setIsMtView(false);
        setSelectedStation(null);
    };

    const handleStationClick = (stationId: number) => {
        if (stationId === 1) {
            setIsMtView(true);
            setSelectedMtSlot(1);
        }
        setSelectedStation(stationId);
    };

    const handleMountTool = (tool: Tool, mtIndex?: number) => {
        if (!selectedStation) return;

        const updatedTools = tools.map(t => {
            // Unmount current tool at this position if exists
            if (t.stationNumber === selectedStation) {
                if (isMtView) {
                    if (t.mtIndex === mtIndex) return { ...t, stationNumber: 0, mtIndex: 0 };
                } else {
                    return { ...t, stationNumber: 0, mtIndex: 0 };
                }
            }
            // Mount new tool
            if (t.id === tool.id) {
                return { ...t, stationNumber: selectedStation, mtIndex: mtIndex || 0 };
            }
            return t;
        });
        
        setTools(updatedTools);
    };

    const handleUnmountTool = (toolId: string) => {
        setTools(prev => prev.map(t => t.id === toolId ? { ...t, stationNumber: 0, mtIndex: 0 } : t));
    };

    // Helper for MT View
    const mtTools = isMtView ? toolsOnTurret.filter(t => t.stationNumber === selectedStation) : [];

    return (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
             <div className="bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
                
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-xl font-bold text-white">Управление Револьвером (Оператор)</h2>
                        <select 
                            value={activeLayoutId} 
                            onChange={(e) => loadLayout(e.target.value)} 
                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1"
                        >
                            {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 relative bg-gray-200 overflow-auto flex items-center justify-center">
                        {isMtView ? (
                            <div className="w-full h-full flex flex-col relative">
                                <button onClick={() => setIsMtView(false)} className="absolute top-4 left-4 bg-gray-600 text-white px-3 py-1 rounded shadow z-10">
                                    &larr; Назад
                                </button>
                                <div className="flex-1 p-8">
                                     <MtVisualizer 
                                        tools={mtTools}
                                        selectedSlotId={selectedMtSlot}
                                        onSlotClick={setSelectedMtSlot}
                                     />
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full p-8">
                                <TurretVisualizer 
                                    stations={stationsConfig}
                                    tools={toolsOnTurret}
                                    selectedStationId={selectedStation}
                                    onStationClick={handleStationClick}
                                    mode="control"
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Panel */}
                    <div className="w-80 bg-gray-700 flex flex-col border-l border-gray-600">
                        <div className="p-4 border-b border-gray-600 bg-gray-800">
                            <h3 className="font-bold text-gray-200">
                                {isMtView ? `Multi-Tool (Слот ${selectedMtSlot || '-'})` : (selectedStation ? `Станция ${selectedStation}` : 'Выберите станцию')}
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Доступные инструменты</h4>
                            {availableTools.map(tool => {
                                const canMount = selectedStation && (!isMtView || selectedMtSlot);
                                return (
                                <div key={tool.id} className="bg-gray-600 p-2 rounded flex flex-col group hover:bg-gray-500">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-8 h-8 bg-white rounded flex-shrink-0"><ToolPreview tool={tool} /></div>
                                        <div className="overflow-hidden">
                                            <div className="font-bold text-sm text-white truncate">{tool.name}</div>
                                            <div className="text-xs text-gray-300">{tool.shape} {tool.width}x{tool.height}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        <button 
                                            onClick={() => handleMountTool(tool, isMtView && selectedMtSlot ? selectedMtSlot : 0)}
                                            disabled={!canMount}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isMtView ? "Установить в слот" : "Установить"}
                                        </button>
                                    </div>
                                </div>
                                )
                            })}
                        </div>
                        
                        {/* List of tools in MT to simplify unmounting if needed */}
                        {isMtView && (
                            <div className="h-1/3 border-t border-gray-600 p-2 overflow-y-auto bg-gray-800">
                                <h4 className="text-xs font-bold text-purple-400 mb-1">Инструменты в MT</h4>
                                {mtTools.map(t => (
                                    <div key={t.id} className="flex justify-between items-center text-xs text-white bg-gray-700 p-1 mb-1 rounded">
                                        <span>#{t.mtIndex}: {t.name}</span>
                                        <button onClick={() => handleUnmountTool(t.id)} className="text-red-400 hover:text-red-200">X</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
             </div>
        </div>
    );
};
