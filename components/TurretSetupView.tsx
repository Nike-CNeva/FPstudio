
import React, { useState, useEffect } from 'react';
import { Tool, TurretLayout, StationConfig } from '../types';
import { ToolSvg, ToolPreview } from './common/ToolDisplay';
import { SaveIcon, TrashIcon, SettingsIcon, PlusIcon } from './Icons';
import { generateId } from '../utils/helpers';
import { ModalInputField } from './common/InputField';

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

    // Synchronize local stations with active layout change
    useEffect(() => {
        const layout = layouts.find(l => l.id === activeLayoutId);
        if (layout) {
            setCurrentStations(layout.stations);
        }
    }, [activeLayoutId, layouts]);

    // Derived state for current tools
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
            setSelectedMtSlotId(1); // Default to slot 1
        }
        setSelectedStationId(stationId);
    };

    const checkCompatibility = (tool: Tool, station: StationConfig): boolean => {
        if (station.type === 'MT') {
            return tool.stationType === 'MT';
        }
        // Check toolSize match (A, B, C, D)
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
        // Also update snapshot in layout
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

    const mtSlots = Array.from({ length: 20 }, (_, i) => {
        const id = i + 1;
        const radius = id <= 10 ? 30 : 60;
        const angle = (360 / 10) * (id - 1) - 90;
        return { id, angle, radius };
    });

    // Counter-Clockwise numbering starting from Bottom (6 o'clock)
    const renderMainTurret = () => (
        <svg width="100%" height="100%" viewBox="-350 -350 700 700">
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
                </filter>
            </defs>
            <circle r="320" fill="#2d3748" stroke="#4a5568" strokeWidth="2" />
            <circle r="300" fill="#cbd5e0" stroke="#718096" strokeWidth="5" filter="url(#shadow)" />
            <circle r="200" fill="#e2e8f0" stroke="#a0aec0" strokeWidth="2" />
            <circle r="100" fill="#edf2f7" stroke="#cbd5e0" strokeWidth="1" />
            <text x="0" y="0" textAnchor="middle" dy="5" className="fill-gray-600 text-lg font-bold">Main Turret</text>

            {currentStations.map((s, i) => {
                const step = 360 / 20;
                const angleDeg = 90 - (i * step);
                const rad = (angleDeg * Math.PI) / 180;
                const x = Math.cos(rad) * 250;
                const y = Math.sin(rad) * 250;

                const assignedTools = toolsOnTurret.filter(t => t.stationNumber === s.id);
                const hasTools = assignedTools.length > 0;
                const isMT = s.type === 'MT';
                const isSelected = selectedStationId === s.id;

                return (
                    <g key={s.id} transform={`translate(${x}, ${y})`} onClick={() => handleStationClick(s.id)} className="cursor-pointer hover:opacity-90 transition-opacity">
                        <circle r="28" fill={isSelected ? "#f6e05e" : "#fff"} stroke={isSelected ? "#d69e2e" : "#a0aec0"} strokeWidth={3} />
                        
                        <g transform="scale(0.9)">
                            {hasTools && !isMT && <ToolSvg tool={assignedTools[0]} />}
                        </g>

                        {/* Tool Name above tool image */}
                        {hasTools && !isMT && (
                            <text y="-22" textAnchor="middle" className="text-[8px] fill-blue-900 font-bold select-none pointer-events-none" style={{ textShadow: '0px 0px 2px white' }}>
                                {assignedTools[0].name}
                            </text>
                        )}

                        <g transform="translate(0, -38)">
                            <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#fff" stroke="#718096" strokeWidth="1" />
                            <text y="4" textAnchor="middle" className="text-xs fill-gray-900 font-bold select-none">{s.id}</text>
                        </g>

                        <text y="40" textAnchor="middle" className="text-[10px] fill-gray-700 font-bold select-none bg-white">
                            {s.type} {s.isAutoIndex ? '(AI)' : ''}
                        </text>
                        
                        <text y="0" dy="3" textAnchor="middle" className="text-xs fill-gray-400 font-bold select-none opacity-40 pointer-events-none">
                            {s.type}
                        </text>
                        
                        {isMT && (
                            <g>
                                <circle r="15" fill="#805ad5" opacity="0.2" />
                                <text y="5" textAnchor="middle" className="text-[10px] fill-purple-800 font-bold">MT</text>
                                {hasTools && <circle r="4" cx="15" cy="-15" fill="#48bb78" />}
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );

    const renderMtView = () => (
        <div className="flex flex-col h-full">
            <div className="flex-none p-2">
                <button onClick={() => setIsMtView(false)} className="text-sm bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded">
                    &larr; Назад
                </button>
            </div>
            <div className="flex-1 relative">
                <svg width="100%" height="100%" viewBox="-150 -150 300 300">
                     <circle r="145" fill="#f3e8ff" stroke="#805ad5" strokeWidth="4" />
                     <text x="0" y="-5" textAnchor="middle" className="fill-purple-900 text-lg font-bold">Multi-Tool</text>
                     
                     {mtSlots.map(slot => {
                         const rad = (slot.angle * Math.PI) / 180;
                         const x = Math.cos(rad) * slot.radius * 1.5;
                         const y = Math.sin(rad) * slot.radius * 1.5;
                         const assignedTool = toolsOnTurret.find(t => t.stationNumber === selectedStationId && t.mtIndex === slot.id);
                         const isSelected = selectedMtSlotId === slot.id;

                         return (
                            <g key={slot.id} transform={`translate(${x}, ${y})`} onClick={() => setSelectedMtSlotId(slot.id)} className="cursor-pointer">
                                <circle r="14" fill={assignedTool ? "#4299e1" : "#fff"} stroke={isSelected ? "#ecc94b" : "#6b46c1"} strokeWidth={isSelected ? 3 : 1} />
                                <text y="4" textAnchor="middle" className="text-[8px] fill-gray-800 font-bold select-none">{slot.id}</text>
                                {assignedTool && <title>{assignedTool.name}</title>}
                            </g>
                         )
                     })}
                </svg>
            </div>
            <div className="flex-none p-4 border-t border-gray-300 bg-gray-100 h-1/3 overflow-y-auto">
                <h4 className="font-bold text-purple-800 mb-2">Содержимое MT (20 слотов)</h4>
                <div className="grid grid-cols-5 gap-2">
                    {mtSlots.map(slot => {
                         const assignedTool = toolsOnTurret.find(t => t.stationNumber === selectedStationId && t.mtIndex === slot.id);
                         const isSelected = selectedMtSlotId === slot.id;
                         return (
                             <div 
                                key={slot.id} 
                                onClick={() => setSelectedMtSlotId(slot.id)}
                                className={`border rounded p-1 text-center text-xs cursor-pointer transition-all ${isSelected ? 'ring-2 ring-yellow-400 bg-yellow-50 border-yellow-500' : (assignedTool ? 'bg-blue-100 border-blue-300' : 'bg-white border-gray-300')}`}
                             >
                                 <div className="font-bold text-gray-500 mb-1">{slot.id}</div>
                                 {assignedTool ? (
                                     <div>
                                         <div className="truncate" title={assignedTool.name}>{assignedTool.name}</div>
                                         {isSelected && (
                                            <button onClick={(e) => { e.stopPropagation(); handleUnmountTool(assignedTool.id); }} className="text-red-500 hover:underline text-[9px] mt-1 block w-full">Снять</button>
                                         )}
                                     </div>
                                 ) : <span className="text-gray-300">-</span>}
                             </div>
                         )
                    })}
                </div>
            </div>
        </div>
    );

    const selectedStation = currentStations.find(s => s.id === selectedStationId);
    
    // Determine the currently "Active" tool for the sidebar context
    // If MT View, use the selected SLOT tool. If Main view, use the mounted tool.
    const mountedToolInMain = selectedStation && !isMtView ? toolsOnTurret.find(t => t.stationNumber === selectedStation.id && !t.mtIndex) : null;
    const mountedToolInMtSlot = isMtView && selectedMtSlotId ? toolsOnTurret.find(t => t.stationNumber === selectedStationId && t.mtIndex === selectedMtSlotId) : null;
    
    const activeTool = isMtView ? mountedToolInMtSlot : mountedToolInMain;

    return (
        <div className="flex h-full bg-gray-100 text-gray-900 font-sans">
            {/* Left: Turret Visualization */}
            <div className="flex-1 relative bg-gray-300 shadow-inner overflow-hidden">
                 {isMtView ? renderMtView() : renderMainTurret()}
            </div>

            {/* Right: Sidebar for Config */}
            <div className="w-96 bg-gray-800 text-gray-100 flex flex-col border-l border-gray-700 shadow-xl z-10">
                {/* 1. Global Controls */}
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

                {/* 2. Station Configuration */}
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
                            
                            {/* Show Mounted Tool Info & Remove Button */}
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

                {/* 3. Tool Library */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="p-2 bg-gray-900 border-b border-gray-700">
                        <h4 className="text-xs font-bold text-gray-400 uppercase">Библиотека</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                         {availableTools.map(tool => {
                             const displaySize = (tool.stationType === 'MT' || tool.name.startsWith('MT')) ? 'MT' : tool.toolSize;
                             const stationType = selectedStation?.type;
                             // Compatibility check for visualization
                             let isCompatible = false;
                             if (selectedStation) {
                                 if (isMtView) isCompatible = tool.stationType === 'MT'; // In MT view, strictly look for MT tools
                                 else if (stationType === 'MT') isCompatible = false; // Cannot mount straight to MT base in non-MT view
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
