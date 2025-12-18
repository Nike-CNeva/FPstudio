
import React, { useState, useEffect } from 'react';
import { Tool, TurretLayout, StationConfig } from '../types';
import { ToolPreview } from './common/ToolDisplay';
import { SaveIcon, TrashIcon, SettingsIcon } from './Icons';
import { generateId } from '../utils/helpers';
import { TurretVisualizer, MtVisualizer } from './common/TurretVisualizer';

interface TurretSetupViewProps {
    tools: Tool[];
    setTools: React.Dispatch<React.SetStateAction<Tool[]>>;
    layouts: TurretLayout[];
    setLayouts: React.Dispatch<React.SetStateAction<TurretLayout[]>>;
}

export const TurretSetupView: React.FC<TurretSetupViewProps> = ({ tools, setTools, layouts, setLayouts }) => {
    const [activeLayoutId, setActiveLayoutId] = useState<string>(layouts[0]?.id || '');
    const [currentStations, setCurrentStations] = useState<StationConfig[]>(layouts[0]?.stations || []);
    const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
    const [isMtView, setIsMtView] = useState(false);
    const [selectedMtSlotId, setSelectedMtSlotId] = useState<number | null>(null);
    const [newLayoutName, setNewLayoutName] = useState('');

    useEffect(() => {
        const layout = layouts.find(l => l.id === activeLayoutId);
        if (layout) {
            setCurrentStations(layout.stations);
        }
    }, [activeLayoutId, layouts]);

    const toolsOnTurret = tools.filter(t => t.stationNumber !== 0 && t.stationNumber !== undefined);
    const availableTools = tools.filter(t => !t.stationNumber);

    const loadLayout = (layoutId: string) => {
        const layout = layouts.find(l => l.id === layoutId);
        if (!layout) return;
        setTools(JSON.parse(JSON.stringify(layout.toolsSnapshot)));
        setCurrentStations(JSON.parse(JSON.stringify(layout.stations)));
        setActiveLayoutId(layoutId);
        setSelectedStationId(null);
        setIsMtView(false);
        setSelectedMtSlotId(null);
    };

    const saveLayout = () => {
        if (!newLayoutName.trim()) return;
        const newLayout: TurretLayout = {
            id: generateId(),
            name: newLayoutName,
            toolsSnapshot: JSON.parse(JSON.stringify(tools)),
            stations: JSON.parse(JSON.stringify(currentStations))
        };
        setLayouts(prev => [...prev, newLayout]);
        setActiveLayoutId(newLayout.id);
        setNewLayoutName('');
    };

    const deleteLayout = (id: string) => {
        if (layouts.length <= 1) {
            alert("Нельзя удалить единственную конфигурацию.");
            return;
        }
        setLayouts(prev => prev.filter(l => l.id !== id));
        if (activeLayoutId === id) {
            loadLayout(layouts[0].id);
        }
    };

    const updateStationConfig = (id: number, updates: Partial<StationConfig>) => {
        setCurrentStations(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, stations: prev.find(lx => lx.id === activeLayoutId)?.stations.map(s => s.id === id ? { ...s, ...updates } : s) || [] } : l));
    };

    const handleStationClick = (stationId: number) => {
        const station = currentStations.find(s => s.id === stationId);
        if (station?.type === 'MT') {
            setIsMtView(true);
            setSelectedMtSlotId(1);
        }
        setSelectedStationId(stationId);
    };

    const checkCompatibility = (tool: Tool, station: StationConfig): boolean => {
        if (station.type === 'MT') {
            return tool.stationType === 'MT';
        }
        return tool.toolSize === station.type;
    };

    const handleMountTool = (tool: Tool, mtIndex?: number) => {
        if (!selectedStationId) return;

        const station = currentStations.find(s => s.id === selectedStationId);
        if (!station) return;

        if (!checkCompatibility(tool, station)) {
            alert(`Ошибка: Инструмент размера '${tool.toolSize}' нельзя установить в станцию типа '${station.type}'`);
            return;
        }

        const updatedTools = tools.map(t => {
            if (t.stationNumber === selectedStationId) {
                if (isMtView) {
                    if (t.mtIndex === mtIndex) return { ...t, stationNumber: 0, mtIndex: 0 };
                } else {
                    return { ...t, stationNumber: 0, mtIndex: 0 };
                }
            }
            if (t.id === tool.id) {
                return { ...t, stationNumber: selectedStationId, mtIndex: mtIndex || 0 };
            }
            return t;
        });
        setTools(updatedTools);
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, toolsSnapshot: updatedTools } : l));
    };

    const handleUnmountTool = (toolId: string) => {
        const updatedTools = tools.map(t => t.id === toolId ? { ...t, stationNumber: 0, mtIndex: 0 } : t);
        setTools(updatedTools);
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, toolsSnapshot: updatedTools } : l));
    };

    const updateToolRotation = (toolId: string, rotation: number) => {
        const updatedTools = tools.map(t => t.id === toolId ? { ...t, defaultRotation: rotation } : t);
        setTools(updatedTools);
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, toolsSnapshot: updatedTools } : l));
    };

    const selectedStation = currentStations.find(s => s.id === selectedStationId);
    
    const activeTool = isMtView 
        ? toolsOnTurret.find(t => t.stationNumber === selectedStationId && t.mtIndex === selectedMtSlotId)
        : (selectedStation ? toolsOnTurret.find(t => t.stationNumber === selectedStation.id && !t.mtIndex) : null);

    // Helpers for Visualizers
    const mtTools = isMtView ? toolsOnTurret.filter(t => t.stationNumber === selectedStationId) : [];

    return (
        <div className="flex h-full w-full bg-gray-100 text-gray-900 font-sans">
            <div className="flex-1 relative bg-gray-300 shadow-inner overflow-hidden flex items-center justify-center">
                 
                 {/* Visualizer Container */}
                 {isMtView ? (
                    <div className="w-full h-full flex flex-col relative p-8">
                        <button onClick={() => setIsMtView(false)} className="absolute top-4 left-4 bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded shadow text-sm transition-colors z-10">
                            &larr; Назад
                        </button>
                        <MtVisualizer 
                            tools={mtTools}
                            selectedSlotId={selectedMtSlotId}
                            onSlotClick={setSelectedMtSlotId}
                        />
                    </div>
                 ) : (
                    <div className="w-full h-full p-8">
                        <TurretVisualizer 
                            stations={currentStations}
                            tools={toolsOnTurret}
                            selectedStationId={selectedStationId}
                            onStationClick={handleStationClick}
                            mode="setup"
                        />
                    </div>
                 )}
            </div>

            <div className="w-96 bg-gray-800 text-gray-100 flex flex-col border-l border-gray-700 shadow-xl z-10">
                <div className="p-4 border-b border-gray-700 bg-gray-900">
                    <h2 className="text-lg font-bold text-blue-400 mb-2 flex items-center"><SettingsIcon className="w-5 h-5 mr-2"/> Настройка Револьвера</h2>
                    <div className="space-y-2">
                        <div>
                             <label className="text-xs text-gray-400 block mb-1">Текущая конфигурация</label>
                             <div className="flex space-x-2">
                                <select 
                                    value={activeLayoutId} 
                                    onChange={(e) => loadLayout(e.target.value)} 
                                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
                                >
                                    {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <button onClick={() => deleteLayout(activeLayoutId)} className="bg-red-800 hover:bg-red-700 p-1 rounded text-white"><TrashIcon className="w-4 h-4"/></button>
                             </div>
                        </div>
                        <div className="flex space-x-2 pt-2 border-t border-gray-700">
                             <input 
                                type="text" 
                                placeholder="Новое имя..." 
                                value={newLayoutName}
                                onChange={e => setNewLayoutName(e.target.value)}
                                className="flex-1 bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 text-sm"
                            />
                            <button onClick={saveLayout} className="bg-green-600 hover:bg-green-500 p-1 rounded text-white"><SaveIcon className="w-4 h-4"/></button>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-b border-gray-700 bg-gray-800">
                    <h3 className="font-bold text-gray-300 mb-2">
                        {isMtView 
                            ? `MT Станция ${selectedStationId} - Слот ${selectedMtSlotId || 'не выбран'}` 
                            : (selectedStationId ? `Станция ${selectedStationId}` : 'Выберите станцию')}
                    </h3>
                    
                    {(selectedStation && !isMtView) || (isMtView && selectedMtSlotId) ? (
                        <div className="space-y-3">
                            {!isMtView && (
                                <div className="flex space-x-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 block mb-1">Тип гнезда</label>
                                        <select 
                                            value={selectedStation?.type}
                                            onChange={(e) => selectedStation && updateStationConfig(selectedStation.id, { type: e.target.value })}
                                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                        >
                                            {['A', 'B', 'C', 'D', 'MT'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-end pb-2">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedStation?.isAutoIndex} 
                                                onChange={(e) => selectedStation && updateStationConfig(selectedStation.id, { isAutoIndex: e.target.checked })}
                                                className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                                            />
                                            <span className="text-sm">Auto Index</span>
                                        </label>
                                    </div>
                                </div>
                            )}
                            
                            {activeTool && (
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
                                            <label className="block text-[10px] text-gray-400 mb-1">Положение (град.)</label>
                                            <select 
                                                value={activeTool.defaultRotation || 0} 
                                                onChange={(e) => updateToolRotation(activeTool.id, parseFloat(e.target.value))}
                                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs"
                                            >
                                                {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
                                                    <option key={angle} value={angle}>{angle}°</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-400 mb-1">Зазор матрицы</label>
                                            <div className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300">
                                                {activeTool.dies?.[0]?.clearance || '0.0'} мм
                                            </div>
                                        </div>
                                    </div>

                                    <button onClick={() => handleUnmountTool(activeTool.id)} className="w-full bg-red-800 hover:bg-red-700 text-white text-xs py-2 rounded flex items-center justify-center transition-colors">
                                        <TrashIcon className="w-4 h-4 mr-2" /> Снять инструмент
                                    </button>
                                </div>
                            )}
                             
                             {!activeTool && (
                                 <div className="bg-gray-700/50 border border-dashed border-gray-600 rounded p-4 text-center">
                                     <p className="text-xs text-gray-500">Инструмент не установлен</p>
                                     {isMtView && !selectedMtSlotId && <p className="text-[10px] text-gray-400 mt-1">Выберите слот на схеме для установки</p>}
                                 </div>
                             )}

                            {selectedStation?.type === 'MT' && !isMtView && (
                                <button onClick={() => { setIsMtView(true); setSelectedMtSlotId(1); }} className="w-full bg-purple-700 hover:bg-purple-600 text-white py-1 rounded text-sm mt-2">
                                    Открыть Multi-Tool
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500 italic">
                            {isMtView ? "Выберите слот мультитула для настройки" : "Нажмите на станцию слева для редактирования"}
                        </p>
                    )}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="p-2 bg-gray-900 border-b border-gray-700">
                        <h4 className="text-xs font-bold text-gray-400 uppercase">Библиотека</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                         {availableTools.map(tool => {
                             const displaySize = (tool.stationType === 'MT' || tool.name.startsWith('MT')) ? 'MT' : tool.toolSize;
                             const stationType = selectedStation?.type;
                             let isCompatible = false;
                             if (selectedStation) {
                                 if (isMtView) isCompatible = tool.stationType === 'MT'; 
                                 else if (stationType === 'MT') isCompatible = false; 
                                 else isCompatible = tool.toolSize === stationType;
                             }
                             
                             const canMount = isCompatible && ((!isMtView && selectedStationId) || (isMtView && selectedMtSlotId));

                             return (
                                <div key={tool.id} className={`bg-gray-700 p-2 rounded flex flex-col group border border-transparent ${isCompatible ? 'hover:border-blue-400' : 'opacity-50'}`}>
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
                                                onClick={() => handleMountTool(tool, isMtView && selectedMtSlotId ? selectedMtSlotId : 0)}
                                                className={`w-full text-white text-xs py-1 rounded ${isMtView ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                                            >
                                                {isMtView ? `В слот ${selectedMtSlotId}` : "Установить"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                             );
                         })}
                         {availableTools.length === 0 && <div className="text-center text-gray-500 text-sm mt-4">Все инструменты установлены</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
