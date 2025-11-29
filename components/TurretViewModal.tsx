
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

// Create 24 slots for MT
const mtSlots = Array.from({ length: 24 }, (_, i) => {
    const id = i + 1;
    // Slots 1-12 are Outer Ring
    // Slots 13-24 are Inner Ring
    
    let isInner = false;
    let indexInRing = 0;
    
    if (id <= 12) {
        // Outer Ring: 1 to 12
        isInner = false;
        indexInRing = id - 1;
    } else {
        // Inner Ring: 13 to 24
        isInner = true;
        indexInRing = id - 13;
    }

    // New Radius settings: Outer closer to edge (200), Inner offset towards center (140)
    const radius = isInner ? 140 : 200;
    
    // Angular logic: 
    // Outer Ring: 0, 30, 60... (CCW negative in SVG trig usually implies visual CCW if Y is up, but standard trig in SVG coords varies).
    // Let's assume standard position: 0 is Right (3 o'clock).
    // Stagger: Inner ring shifted by half a step (15 degrees)
    
    let angleDeg = - (indexInRing * 30); // Base angle
    if (isInner) {
        angleDeg -= 15; // Shift inner ring
    }
    
    return { id, angle: angleDeg, radius, isInner };
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
        setTools(layout.toolsSnapshot);
        setActiveLayoutId(layoutId);
    };

    const saveLayout = () => {
        if (!newLayoutName.trim()) return;
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

        const updatedTools = tools.map(t => {
            if (t.stationNumber === selectedStation) {
                if (isMtView) {
                    if (t.mtIndex === mtIndex) return { ...t, stationNumber: 0, mtIndex: 0 };
                } else {
                    return { ...t, stationNumber: 0, mtIndex: 0 };
                }
            }
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
                
                const assignedTools = toolsOnTurret.filter(t => t.stationNumber === s.id);
                const hasTools = assignedTools.length > 0;
                const isMT = s.id === 1; 

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
                             <text y="15" textAnchor="middle" className="text-[8px] fill-white">{assignedTools.length}/24</text>
                        )}
                    </g>
                );
            })}
         </svg>
    );

    const renderMultiToolView = () => (
         <svg width="100%" height="100%" viewBox="-250 -250 500 500">
            <defs>
                <radialGradient id="greenTool" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#81e6d9" />
                    <stop offset="100%" stopColor="#2c7a7b" />
                </radialGradient>
                <filter id="dropshadow" height="130%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2"/> 
                    <feOffset dx="1" dy="2" result="offsetblur"/>
                    <feComponentTransfer>
                        <feFuncA type="linear" slope="0.3"/>
                    </feComponentTransfer>
                    <feMerge> 
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/> 
                    </feMerge>
                </filter>
            </defs>

            {/* Background Plate */}
            <circle r="230" fill="#edf2f7" stroke="#718096" strokeWidth="2" />
            <circle r="170" fill="none" stroke="#cbd5e0" strokeWidth="1" />
            
            <text x="0" y="0" textAnchor="middle" className="fill-gray-500 text-sm font-bold">1 - Multi-tool turret</text>

            {/* Connecting lines for outer/inner labels */}
            {mtSlots.map(slot => {
                 const rad = (slot.angle * Math.PI) / 180;
                 const x = Math.cos(rad) * slot.radius;
                 const y = Math.sin(rad) * slot.radius;
                 
                 const assignedTool = toolsOnTurret.find(t => t.stationNumber === 1 && t.mtIndex === slot.id);
                 
                 // Label Position
                 // Outer labels further out (230+), Inner labels closer in (100) or using lines
                 const labelR = slot.isInner ? 110 : 240;
                 const lx = Math.cos(rad) * labelR;
                 const ly = Math.sin(rad) * labelR;

                 return (
                    <g key={slot.id}>
                        {/* Connecting Line */}
                        <line x1={lx} y1={ly} x2={x} y2={y} stroke="#a0aec0" strokeWidth="1" />
                        
                        {/* Tool Slot */}
                        <g transform={`translate(${x}, ${y})`}>
                            {assignedTool ? (
                                <g>
                                    <circle r="20" fill="url(#greenTool)" filter="url(#dropshadow)" stroke="#234e52" strokeWidth="1" />
                                    <text y="3" textAnchor="middle" className="text-[7px] fill-white font-bold pointer-events-none">
                                        {assignedTool.name.replace(/_MT/,'')}
                                    </text>
                                </g>
                            ) : (
                                <circle r="18" fill="#e2e8f0" stroke="#cbd5e0" strokeWidth="1" />
                            )}
                            
                            {/* Hit area */}
                            <circle r="20" fill="transparent" className="cursor-pointer" onClick={() => { /* select logic */ }} >
                                <title>Slot {slot.id}</title>
                            </circle>
                        </g>

                        {/* Number Label */}
                        <text x={lx} y={ly + 4} textAnchor="middle" className="text-xs font-bold fill-gray-800">{slot.id}</text>
                    </g>
                 )
            })}
         </svg>
    );

    return (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
             <div className="bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
                
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
                                <div className="flex-1">
                                     {renderMultiToolView()}
                                </div>
                            </div>
                        ) : (
                            renderMainTurret()
                        )}
                    </div>

                    {/* Right Panel */}
                    <div className="w-80 bg-gray-700 flex flex-col border-l border-gray-600">
                        <div className="p-4 border-b border-gray-600 bg-gray-800">
                            <h3 className="font-bold text-gray-200">
                                {isMtView ? `Multi-Tool (Станция 1)` : (selectedStation ? `Станция ${selectedStation}` : 'Выберите станцию')}
                            </h3>
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
                                    
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {isMtView ? (
                                            <div className="flex items-center space-x-2 w-full bg-gray-800 p-1 rounded">
                                                 <span className="text-[10px]">Слот:</span>
                                                 <input type="number" min="1" max="24" defaultValue="1" id={`slot-input-${tool.id}`} className="w-10 text-black text-xs px-1" />
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
                                                disabled={!selectedStation || selectedStation === 1}
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {selectedStation === 1 ? "Используйте режим MT" : (selectedStation ? "Установить" : "Сначала выберите станцию")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};
