
import React, { useState } from 'react';
import { Tool, ToolShape, TurretLayout } from '../types';
import { ToolSvg, ToolPreview } from './common/ToolDisplay';
import { PlusIcon, SaveIcon, TrashIcon } from './Icons';
import { generateId } from '../utils/helpers';

interface TurretViewModalProps {
    tools: Tool[];
    setTools: React.Dispatch<React.SetStateAction<Tool[]>>;
    layouts: TurretLayout[];
    setLayouts: React.Dispatch<React.SetStateAction<TurretLayout[]>>;
    onClose: () => void;
}

const stations = Array.from({ length: 20 }, (_, i) => {
    const id = i + 1;
    let type = 'B';
    if (id === 1) type = 'MT'; 
    else if (id === 11) type = 'MT';
    else if (id % 5 === 0) type = 'C';
    else if (id % 7 === 0) type = 'D';
    const angle = (360 / 20) * i - 90; 
    return { id, type, angle };
});

const mtSlots = Array.from({ length: 20 }, (_, i) => {
    const id = i + 1;
    // Place slots in 2 concentric rings for visualization
    const radius = id <= 10 ? 30 : 60;
    const angle = (360 / 10) * (id - 1) - 90;
    return { id, angle, radius };
});

export const TurretViewModal: React.FC<TurretViewModalProps> = ({ tools, setTools, layouts, setLayouts, onClose }) => {
    const [selectedStation, setSelectedStation] = useState<number | null>(null);
    const [isMtView, setIsMtView] = useState(false);
    const [activeLayoutId, setActiveLayoutId] = useState<string>(layouts[0]?.id || '');
    const [newLayoutName, setNewLayoutName] = useState('');

    // Derived state for current tools on turret
    const toolsOnTurret = tools.filter(t => t.stationNumber !== 0 && t.stationNumber !== undefined);
    const availableTools = tools.filter(t => !t.stationNumber); // Tools not mounted anywhere

    // -- Layout Management --

    const loadLayout = (layoutId: string) => {
        const layout = layouts.find(l => l.id === layoutId);
        if (!layout) return;
        
        // Replace current tools state with the snapshot from layout
        // Note: This replaces the entire tool library state in this simplified implementation.
        // In a real app, we might only update station assignments of existing tools by ID.
        // Here we assume the layout snapshot is the source of truth for the library when loaded.
        setTools(layout.toolsSnapshot);
        setActiveLayoutId(layoutId);
    };

    const saveLayout = () => {
        if (!newLayoutName.trim()) return;

        // Get stations from the currently active layout to preserve configuration
        const currentLayout = layouts.find(l => l.id === activeLayoutId) || layouts[0];
        const currentStations = currentLayout ? currentLayout.stations : [];

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
            setActiveLayoutId(layouts[0].id);
            loadLayout(layouts[0].id);
        }
    };

    // -- Tool Mounting --

    const handleStationClick = (stationId: number) => {
        if (stationId === 1) {
            setIsMtView(true);
        }
        setSelectedStation(stationId);
    };

    const handleMountTool = (tool: Tool, mtIndex?: number) => {
        if (!selectedStation) return;

        // Unmount tool currently in this slot if any
        const updatedTools = tools.map(t => {
            // Check collision
            if (t.stationNumber === selectedStation) {
                // If MT view, check index
                if (isMtView) {
                    if (t.mtIndex === mtIndex) return { ...t, stationNumber: 0, mtIndex: 0 };
                } else {
                    // Main turret view, unmount whatever is there (unless it's an MT station with tools inside, complex logic skipped for brevity)
                    return { ...t, stationNumber: 0, mtIndex: 0 };
                }
            }
            // Prepare the tool being mounted
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

    const renderMainTurret = () => (
         <svg width="100%" height="100%" viewBox="-350 -350 700 700">
            <circle r="300" fill="#edf2f7" stroke="#718096" strokeWidth="5" />
            <circle r="200" fill="#e2e8f0" stroke="#a0aec0" strokeWidth="2" />
            <circle r="100" fill="#edf2f7" stroke="#cbd5e0" strokeWidth="1" />
            <text x="0" y="0" textAnchor="middle" dy="5" className="fill-gray-600 text-lg font-bold">Main Turret</text>

            {stations.map(s => {
                const rad = (s.angle * Math.PI) / 180;
                const x = Math.cos(rad) * 250;
                const y = Math.sin(rad) * 250;
                
                // For station 1 (MT), we might have multiple tools. Just show indicator if any exist.
                const assignedTools = toolsOnTurret.filter(t => t.stationNumber === s.id);
                const hasTools = assignedTools.length > 0;
                const isMT = s.id === 1; // Simplified MT check based on requirement

                return (
                    <g key={s.id} transform={`translate(${x}, ${y})`} onClick={() => handleStationClick(s.id)} className="cursor-pointer hover:opacity-80">
                        <circle r="25" fill={hasTools ? (isMT ? "#805ad5" : "#4299e1") : "#cbd5e0"} stroke={selectedStation === s.id ? "yellow" : "#2d3748"} strokeWidth={selectedStation === s.id ? 4 : 2} />
                        <text y="-35" textAnchor="middle" className="text-xs fill-gray-300 font-bold">{s.id}</text>
                        <text y="0" dy="4" textAnchor="middle" className="text-xs fill-gray-900 font-bold">
                            {isMT ? "MT" : (hasTools ? "" : s.type)}
                        </text>
                        {hasTools && !isMT && (
                             <g transform="scale(0.8)"><ToolSvg tool={assignedTools[0]} /></g>
                        )}
                        {isMT && hasTools && (
                             <text y="15" textAnchor="middle" className="text-[8px] fill-white">{assignedTools.length}/20</text>
                        )}
                    </g>
                );
            })}
         </svg>
    );

    const renderMultiToolView = () => (
         <svg width="100%" height="100%" viewBox="-150 -150 300 300">
            <circle r="140" fill="#e9d8fd" stroke="#805ad5" strokeWidth="5" />
            <text x="0" y="-10" textAnchor="middle" className="fill-purple-900 text-lg font-bold">Multi-Tool</text>
            <text x="0" y="10" textAnchor="middle" className="fill-purple-700 text-sm">Station 1</text>

            {mtSlots.map(slot => {
                 const rad = (slot.angle * Math.PI) / 180;
                 const x = Math.cos(rad) * slot.radius * 1.5; // Scale out
                 const y = Math.sin(rad) * slot.radius * 1.5;
                 
                 const assignedTool = toolsOnTurret.find(t => t.stationNumber === 1 && t.mtIndex === slot.id);

                 return (
                    <g key={slot.id} transform={`translate(${x}, ${y})`}>
                        <circle r="12" fill={assignedTool ? "#4299e1" : "#fff"} stroke="#805ad5" strokeWidth="1" />
                        <text y="0" dy="3" textAnchor="middle" className="text-[8px] fill-gray-800 font-bold">{slot.id}</text>
                         {/* Hit area for drop */}
                         <circle r="12" fill="transparent" className="cursor-pointer" onClick={() => { /* Just select for info? */ }} />
                         
                         {/* Simple visual for tool */}
                         {assignedTool && (
                            <title>{assignedTool.name}</title>
                         )}
                    </g>
                 )
            })}
         </svg>
    );

    return (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
             <div className="bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
                
                {/* Header & Layout Controls */}
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-xl font-bold text-white">Управление Револьвером</h2>
                        <select 
                            value={activeLayoutId} 
                            onChange={(e) => loadLayout(e.target.value)} 
                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1"
                        >
                            {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <button onClick={() => deleteLayout(activeLayoutId)} className="text-red-400 hover:text-red-300"><TrashIcon className="w-5 h-5"/></button>
                    </div>
                    <div className="flex items-center space-x-2">
                        <input 
                            type="text" 
                            placeholder="Название новой конфигурации" 
                            value={newLayoutName}
                            onChange={e => setNewLayoutName(e.target.value)}
                            className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 text-sm"
                        />
                        <button onClick={saveLayout} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm flex items-center">
                            <SaveIcon className="w-4 h-4 mr-1"/> Сохранить
                        </button>
                        <button onClick={onClose} className="ml-4 text-gray-400 hover:text-white text-2xl">&times;</button>
                    </div>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Panel: Visualization */}
                    <div className="flex-1 relative bg-gray-200">
                        {isMtView ? (
                            <div className="w-full h-full flex flex-col">
                                <button onClick={() => setIsMtView(false)} className="absolute top-4 left-4 bg-gray-600 text-white px-3 py-1 rounded shadow z-10">
                                    &larr; Назад к револьверу
                                </button>
                                <div className="flex-1 p-4">
                                     {/* MT Manager View - List of 20 slots */}
                                     <div className="grid grid-cols-4 gap-4 h-full overflow-y-auto p-8">
                                        {mtSlots.map(slot => {
                                            const assignedTool = toolsOnTurret.find(t => t.stationNumber === 1 && t.mtIndex === slot.id);
                                            return (
                                                <div key={slot.id} className="bg-white border border-gray-300 rounded p-2 flex flex-col items-center shadow-sm">
                                                    <span className="font-bold text-purple-700 mb-2">Слот {slot.id}</span>
                                                    {assignedTool ? (
                                                        <div className="flex flex-col items-center">
                                                            <div className="w-10 h-10 mb-1"><ToolPreview tool={assignedTool} /></div>
                                                            <span className="text-xs text-center font-semibold truncate w-full">{assignedTool.name}</span>
                                                            <button onClick={() => handleUnmountTool(assignedTool.id)} className="text-red-500 text-xs mt-1 hover:underline">Снять</button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-400 italic py-4">Пусто</div>
                                                    )}
                                                    {/* Drop zone concept: user selects tool from right, then clicks here to mount */}
                                                    {!assignedTool && (
                                                         <button 
                                                            className="mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                                                            // Simple interaction: Clicking this sets it as target for next library click? 
                                                            // Or better: dragging. For now, let's assume drag/drop is complex, 
                                                            // so we use a two-step process: Select Tool -> Click "Mount to Slot X" button?
                                                            // Or: Just show "Mount" buttons on the right list if a slot is "active".
                                                         >
                                                            ...
                                                         </button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                     </div>
                                </div>
                            </div>
                        ) : (
                            renderMainTurret()
                        )}
                    </div>

                    {/* Right Panel: Tool Library & Slot Info */}
                    <div className="w-80 bg-gray-700 flex flex-col border-l border-gray-600">
                        <div className="p-4 border-b border-gray-600 bg-gray-800">
                            <h3 className="font-bold text-gray-200">
                                {isMtView ? `Multi-Tool (Станция 1)` : (selectedStation ? `Станция ${selectedStation}` : 'Выберите станцию')}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">
                                {isMtView 
                                    ? "Выберите инструмент из списка справа и укажите номер слота (1-20) для установки." 
                                    : "Выберите инструмент из списка для установки в текущую станцию."}
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Доступные инструменты</h4>
                            {availableTools.map(tool => (
                                <div key={tool.id} className="bg-gray-600 p-2 rounded flex flex-col group hover:bg-gray-500">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-8 h-8 bg-white rounded flex-shrink-0"><ToolPreview tool={tool} /></div>
                                        <div className="overflow-hidden">
                                            <div className="font-bold text-sm text-white truncate">{tool.name}</div>
                                            <div className="text-xs text-gray-300">{tool.shape} {tool.width}x{tool.height}</div>
                                        </div>
                                    </div>
                                    
                                    {/* Mount Actions */}
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {isMtView ? (
                                            // Show mini buttons for slots 1-20? Too many.
                                            // Show input for slot?
                                            <div className="flex items-center space-x-2 w-full bg-gray-800 p-1 rounded">
                                                 <span className="text-[10px]">Слот:</span>
                                                 <input type="number" min="1" max="20" defaultValue="1" id={`slot-input-${tool.id}`} className="w-10 text-black text-xs px-1" />
                                                 <button 
                                                    onClick={() => {
                                                        const val = (document.getElementById(`slot-input-${tool.id}`) as HTMLInputElement).value;
                                                        handleMountTool(tool, parseInt(val));
                                                    }}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] py-1 rounded"
                                                >
                                                    Установить
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => handleMountTool(tool)}
                                                disabled={!selectedStation || selectedStation === 1} // Can't mount standard tool to MT base directly in this simplified logic
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {selectedStation === 1 ? "Используйте режим MT" : (selectedStation ? "Установить" : "Сначала выберите станцию")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {availableTools.length === 0 && <p className="text-center text-gray-500 text-sm py-4">Нет доступных инструментов</p>}
                        </div>
                    </div>

                </div>
             </div>
        </div>
    );
};
