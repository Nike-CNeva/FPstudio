
import React, { useState, useEffect } from 'react';
import { ManualPunchMode, NibbleSettings, DestructSettings, SnapMode, Part, PartProfile, PlacedTool, Tool, ToolShape } from '../../types';
import { BoxIcon, SettingsIcon, TrashIcon, XIcon, TrashIcon as TrashIconSmall } from '../Icons';
import { InputField } from '../common/InputField';
import { ToolSvg } from '../common/ToolDisplay';

// --- Manual Punch Mode Selector ---
interface ManualPunchModeSelectorProps {
    manualPunchMode: ManualPunchMode;
    setManualPunchMode: (mode: ManualPunchMode) => void;
}

export const ManualPunchModeSelector: React.FC<ManualPunchModeSelectorProps> = ({ manualPunchMode, setManualPunchMode }) => (
    <div className='border-b border-gray-600 pb-3 mb-3'>
        <h3 className="font-bold mb-2 text-gray-300">Режим вставки</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
             <button onClick={() => setManualPunchMode(ManualPunchMode.Punch)} className={`flex flex-col items-center p-2 rounded-md transition-colors ${manualPunchMode === ManualPunchMode.Punch ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-600'}`}>
                <BoxIcon className="w-6 h-6 mb-1"/>
                <span>Удар</span>
            </button>
             <button onClick={() => setManualPunchMode(ManualPunchMode.Nibble)} className={`flex flex-col items-center p-2 rounded-md transition-colors ${manualPunchMode === ManualPunchMode.Nibble ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-600'}`}>
                <SettingsIcon className="w-6 h-6 mb-1"/>
                <span>Высечка</span>
            </button>
             <button onClick={() => setManualPunchMode(ManualPunchMode.Destruct)} className={`flex flex-col items-center p-2 rounded-md transition-colors ${manualPunchMode === ManualPunchMode.Destruct ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-600'}`}>
                <TrashIcon className="w-6 h-6 mb-1"/>
                <span>Разруш.</span>
            </button>
        </div>
    </div>
);

// --- Nibble Settings Panel ---
interface NibbleSettingsPanelProps {
    nibbleSettings: NibbleSettings;
    setNibbleSettings: (settings: NibbleSettings) => void;
}

export const NibbleSettingsPanel: React.FC<NibbleSettingsPanelProps> = ({ nibbleSettings, setNibbleSettings }) => {
    const handleChange = (field: keyof NibbleSettings, value: any) => {
        setNibbleSettings({ ...nibbleSettings, [field]: value });
    };

    return (
        <div className="border-b border-gray-600 pb-3 mb-3 space-y-2">
            <h3 className="font-bold text-gray-300">Параметры высечки</h3>
            <div className="flex space-x-2">
                <InputField label="Start Ext (e1)" type="number" value={nibbleSettings.extensionStart} onChange={e => handleChange('extensionStart', parseFloat(e.target.value) || 0)} />
                <InputField label="End Ext (e2)" type="number" value={nibbleSettings.extensionEnd} onChange={e => handleChange('extensionEnd', parseFloat(e.target.value) || 0)} />
            </div>
            <InputField label="Нахлест (v)" type="number" value={nibbleSettings.minOverlap} onChange={e => handleChange('minOverlap', parseFloat(e.target.value) || 0)} />
        </div>
    );
};

// --- Destruct Settings Panel ---
interface DestructSettingsPanelProps {
    destructSettings: DestructSettings;
    setDestructSettings: (settings: DestructSettings) => void;
}

export const DestructSettingsPanel: React.FC<DestructSettingsPanelProps> = ({ destructSettings, setDestructSettings }) => {
     const handleChange = (field: keyof DestructSettings, value: string) => {
        setDestructSettings({ ...destructSettings, [field]: parseFloat(value) || 0 });
    };
    return (
         <div className="border-b border-gray-600 pb-3 mb-3 space-y-2">
            <h3 className="font-bold text-gray-300">Параметры разрушения</h3>
             <InputField label="Нахлест (мм)" type="number" value={destructSettings.overlap} onChange={e => handleChange('overlap', e.target.value)} />
             <InputField label="Гребешок (мм)" type="number" value={destructSettings.scallop} onChange={e => handleChange('scallop', e.target.value)} />
             <InputField label="Расширение (мм)" type="number" value={destructSettings.notchExpansion} onChange={e => handleChange('notchExpansion', e.target.value)} />
        </div>
    )
};

// --- Placement Settings ---

interface ToolFace {
    path: string; // SVG path d for the highlight segment
    angle: number; // Normal/Tangent angle in degrees (CCW from East)
    p1: {x: number, y: number};
    p2: {x: number, y: number};
}

interface PlacementSettingsProps {
    punchOrientation: number;
    setPunchOrientation: (angle: number) => void;
    onCyclePunchOrientation: () => void;
    selectedToolId: string | null;
    tools: Tool[];
    manualPunchMode: ManualPunchMode;
    snapMode: SnapMode;
    setSnapMode: (mode: SnapMode) => void;
}

export const PlacementSettings: React.FC<PlacementSettingsProps> = ({ 
    punchOrientation, setPunchOrientation, onCyclePunchOrientation, 
    selectedToolId, tools, manualPunchMode, snapMode, setSnapMode 
}) => {
    const selectedTool = tools.find(t => t.id === selectedToolId);
    
    // Logic to extract faces from tool
    const getToolFaces = (tool: Tool): ToolFace[] => {
        const w = tool.width;
        const h = tool.height;
        const halfW = w / 2;
        const halfH = h / 2;
        
        if (tool.shape === ToolShape.Special && tool.customPath) {
            // Simplified Parser for standard SVG path commands: M, L, A, Z
            // Assume single loop
            const faces: ToolFace[] = [];
            
            const commands: string[] = tool.customPath.match(/([a-zA-Z])([^a-zA-Z]*)/g) || [];
            let cx = 0, cy = 0;
            let startX = 0, startY = 0;
            
            // Shift to center
            const shiftX = -halfW;
            const shiftY = -halfH;

            commands.forEach((cmdStr, idx) => {
                const type = cmdStr[0].toUpperCase();
                const args = cmdStr.slice(1).trim().split(/[\s,]+/).map(parseFloat);
                
                // Very basic handling - assumes absolute coordinates usually found in our DXF->SVG
                if (type === 'M') {
                    cx = args[0] + shiftX;
                    cy = args[1] + shiftY;
                    startX = cx;
                    startY = cy;
                } else if (type === 'L') {
                    const nx = args[0] + shiftX;
                    const ny = args[1] + shiftY;
                    const angle = Math.atan2(ny - cy, nx - cx) * 180 / Math.PI;
                    faces.push({
                        path: `M ${cx} ${cy} L ${nx} ${ny}`,
                        angle: angle, // Tangent angle
                        p1: {x: cx, y: cy},
                        p2: {x: nx, y: ny}
                    });
                    cx = nx;
                    cy = ny;
                } else if (type === 'A') {
                    // A rx ry rot large sweep x y
                    const nx = args[5] + shiftX;
                    const ny = args[6] + shiftY;

                    const rx = args[0], ry = args[1], rot = args[2], large = args[3], sweep = args[4];
                    faces.push({
                         path: `M ${cx} ${cy} A ${rx} ${ry} ${rot} ${large} ${sweep} ${nx} ${ny}`,
                         angle: Math.atan2(ny - cy, nx - cx) * 180 / Math.PI,
                         p1: {x: cx, y: cy},
                         p2: {x: nx, y: ny}
                    });

                    cx = nx;
                    cy = ny;
                } else if (type === 'Z') {
                     if (Math.abs(cx - startX) > 0.001 || Math.abs(cy - startY) > 0.001) {
                        const angle = Math.atan2(startY - cy, startX - cx) * 180 / Math.PI;
                        faces.push({
                            path: `M ${cx} ${cy} L ${startX} ${startY}`,
                            angle: angle,
                            p1: {x: cx, y: cy},
                            p2: {x: startX, y: startY}
                        });
                     }
                }
            });
            return faces;
        }

        // Standard Shapes (Clockwise visual order: Top, Right, Bottom, Left)
        // Note: SVG Y is down.
        // Top Edge: (-w/2, -h/2) -> (w/2, -h/2). Vector (1,0). Angle 0? No.
        // Let's define Faces relative to the standard 0 rotation.
        // Face 0: Bottom Edge. (Standard Punch Ref).
        // For Rect:
        return [
            { // Bottom
                path: `M ${-halfW} ${halfH} L ${halfW} ${halfH}`,
                angle: 0,
                p1: {x: -halfW, y: halfH},
                p2: {x: halfW, y: halfH}
            },
            { // Left
                path: `M ${-halfW} ${-halfH} L ${-halfW} ${halfH}`,
                angle: 90, 
                p1: {x: -halfW, y: -halfH},
                p2: {x: -halfW, y: halfH}
            },
            { // Top
                path: `M ${halfW} ${-halfH} L ${-halfW} ${-halfH}`,
                angle: 180,
                p1: {x: halfW, y: -halfH},
                p2: {x: -halfW, y: -halfH}
            },
            { // Right
                path: `M ${halfW} ${halfH} L ${halfW} ${-halfH}`,
                angle: 270, // or -90
                p1: {x: halfW, y: halfH},
                p2: {x: halfW, y: -halfH}
            }
        ];
    };

    const [activeFaceIndex, setActiveFaceIndex] = useState(0);
    const faces = selectedTool ? getToolFaces(selectedTool) : [];

    // Sync external orientation change to local face index if possible
    useEffect(() => {
        if (!selectedTool || faces.length === 0) return;
        // Logic to find face matching current orientation could be added here
    }, [punchOrientation, selectedToolId]);


    const handleCycleFace = () => {
        if (faces.length === 0) return;
        
        const nextIndex = (activeFaceIndex + 1) % faces.length;
        setActiveFaceIndex(nextIndex);
        
        const face = faces[nextIndex];
        let rotation = -face.angle;
        
        // Normalize to 0-360
        rotation = (rotation % 360);
        if (rotation < 0) rotation += 360;
        
        setPunchOrientation(rotation);
    };

    const renderOrientationPreview = () => {
        if (!selectedTool || faces.length === 0) return null;

        const maxDim = Math.max(selectedTool.width, selectedTool.height) * 1.2;
        const viewBox = `${-maxDim/2} ${-maxDim/2} ${maxDim} ${maxDim}`;
        const strokeWidth = maxDim / 30;
        const highlightColor = "#3b82f6"; // blue-500

        const activeFace = faces[activeFaceIndex];

        return (
            <div className="w-full mt-2">
                <label className="text-xs text-gray-400 mb-1 block">Активная грань (привязка)</label>
                <button 
                    onClick={handleCycleFace}
                    className="w-full h-32 bg-gray-800 border border-gray-600 hover:border-blue-500 rounded cursor-pointer relative group transition-colors flex items-center justify-center overflow-hidden"
                    title="Нажмите, чтобы сменить активную грань"
                >
                    <div className="w-full h-full p-2">
                        <svg viewBox={viewBox} className="w-full h-full drop-shadow-lg">
                            <g>
                                {/* Base Tool */}
                                <g className="text-gray-500 group-hover:text-gray-400 transition-colors">
                                    <ToolSvg tool={selectedTool} />
                                </g>
                                {/* Active Face Highlight */}
                                {activeFace && (
                                    <g>
                                        <path d={activeFace.path} stroke={highlightColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
                                    </g>
                                )}
                            </g>
                        </svg>
                    </div>
                    
                    <div className="absolute top-1 right-2 bg-gray-900/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-blue-400 border border-blue-900/50">
                        {punchOrientation.toFixed(0)}°
                    </div>
                    
                    <div className="absolute bottom-1 w-full text-center text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 py-1">
                        Грань {activeFaceIndex + 1}/{faces.length}
                    </div>
                </button>
            </div>
        );
    };

    return (
    <div className='border-b border-gray-600 pb-3 mb-3'>
        <h3 className="font-bold mb-2 text-gray-300">Параметры вставки</h3>
        <div className="space-y-3">
            {manualPunchMode === ManualPunchMode.Punch && (
                <div>
                    <label className="text-xs text-gray-400 mb-1 block">Привязка к геометрии</label>
                    <select 
                        value={snapMode} 
                        onChange={(e) => setSnapMode(e.target.value as SnapMode)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value={SnapMode.Off}>Отключено</option>
                        <option value={SnapMode.Vertex}>Вершина</option>
                        <option value={SnapMode.SegmentCenter}>Центр сегмента</option>
                        <option value={SnapMode.ClosestPoint}>Ближайшая точка</option>
                        <option value={SnapMode.ShapeCenter}>Центр фигуры</option>
                    </select>
                </div>
            )}
            
            {/* Edge/Offset controls hidden per request. Orientation/Face selection remains relevant for alignment. */}
            {selectedTool && (manualPunchMode === ManualPunchMode.Punch || manualPunchMode === ManualPunchMode.Nibble) && renderOrientationPreview()}
        </div>
    </div>
    )
};

// --- Placed Punches Panel ---
interface GroupedPunchItem {
    type: 'single' | 'group';
    id: string; 
    name: string;
    count: number;
    refIds: string[]; 
}

interface PlacedPunchesPanelProps {
    activePart: Part | null;
    tools: Tool[];
    selectedPunchId: string | null;
    onSelectPunch: (id: string | null) => void;
    onDeletePunch: (id: string | string[]) => void;
    onUpdatePunch: (id: string, updates: Partial<PlacedTool>) => void;
    onClearAll: () => void;
}

export const PlacedPunchesPanel: React.FC<PlacedPunchesPanelProps> = ({ activePart, tools, selectedPunchId, onSelectPunch, onDeletePunch, onUpdatePunch, onClearAll }) => {
    
    const groupedPunches: GroupedPunchItem[] = [];
    const processedLineIds = new Set<string>();

    if (activePart) {
        activePart.punches.forEach(p => {
            if (p.lineId) {
                if (!processedLineIds.has(p.lineId)) {
                    processedLineIds.add(p.lineId);
                    const group = activePart.punches.filter(gp => gp.lineId === p.lineId);
                    const tool = tools.find(t => t.id === p.toolId);
                    groupedPunches.push({
                        type: 'group',
                        id: p.id, 
                        name: `${tool?.name || 'Unknown'} (x${group.length})`,
                        count: group.length,
                        refIds: group.map(gp => gp.id)
                    });
                }
            } else {
                const tool = tools.find(t => t.id === p.toolId);
                groupedPunches.push({
                    type: 'single',
                    id: p.id,
                    name: tool?.name || 'Неизвестный',
                    count: 1,
                    refIds: [p.id]
                });
            }
        });
    }

    const selectedPunch = activePart?.punches.find(p => p.id === selectedPunchId);
    
    const handleUpdate = (field: keyof PlacedTool, value: string) => {
        if (selectedPunchId) {
            onUpdatePunch(selectedPunchId, { [field]: parseFloat(value) || 0 });
        }
    };
    
    return (
        <div className="border-b border-gray-600 pb-3 mb-3">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-300">Размещенный инструмент</h3>
                <button 
                    onClick={onClearAll} 
                    disabled={!activePart || activePart.punches.length === 0}
                    className="text-xs flex items-center space-x-1 bg-red-900/50 hover:bg-red-800 text-red-200 px-2 py-1 rounded border border-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Удалить все"
                >
                    <TrashIconSmall className="w-3 h-3"/>
                    <span>Очистить</span>
                </button>
            </div>
            
            <div className="bg-gray-800 rounded-md p-2 max-h-48 overflow-y-auto mb-3 space-y-1">
                {groupedPunches.map(item => {
                    const isSelected = selectedPunchId && item.refIds.includes(selectedPunchId);
                    
                    return (
                        <div 
                            key={item.id} 
                            onClick={() => onSelectPunch(item.id)} 
                            className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${isSelected ? 'bg-blue-600' : 'bg-gray-900 hover:bg-gray-600'}`}
                        >
                            <div className="flex items-center space-x-2 overflow-hidden">
                                {item.type === 'group' && <span className="text-xs text-yellow-400 font-bold">GRP</span>}
                                <span className="text-sm truncate">{item.name}</span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeletePunch(item.refIds); }} 
                                className="text-gray-500 hover:text-red-500 p-1"
                            >
                                <TrashIconSmall className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
                 {groupedPunches.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-4">Нет размещенных инструментов</p>
                )}
            </div>
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                     <InputField label="X (мм)" type="number" value={selectedPunch?.x.toFixed(3) || ''} onChange={e => handleUpdate('x', e.target.value)} disabled={!selectedPunchId} />
                     <InputField label="Y (мм)" type="number" value={selectedPunch?.y.toFixed(3) || ''} onChange={e => handleUpdate('y', e.target.value)} disabled={!selectedPunchId} />
                </div>
                <InputField label="Угол (°)" type="number" value={selectedPunch?.rotation.toFixed(2) || ''} onChange={e => handleUpdate('rotation', e.target.value)} disabled={!selectedPunchId} />
            </div>
        </div>
    );
};

// --- Part Properties Form ---
interface PartPropertiesFormProps {
    part: Part;
    onUpdate: (updates: Partial<Part>) => void;
    onClosePart: () => void;
}

export const PartPropertiesForm: React.FC<PartPropertiesFormProps> = ({ part, onUpdate, onClosePart }) => {
    const [profileType, setProfileType] = useState<PartProfile['type']>(part.profile?.type || 'flat');
    const [orientation, setOrientation] = useState<PartProfile['orientation']>(part.profile?.orientation || 'vertical');
    const [dims, setDims] = useState(part.profile?.dims || { a: part.faceWidth, b: 0, c: 0 });

    useEffect(() => {
        setProfileType(part.profile?.type || 'flat');
        setOrientation(part.profile?.orientation || 'vertical');
        setDims(part.profile?.dims || { a: part.faceWidth, b: 0, c: 0 });
    }, [part.id, part.profile]);

    const handleDimChange = (key: keyof PartProfile['dims'], val: number) => {
        const newDims = { ...dims, [key]: val };
        setDims(newDims);
        
        let totalW = part.faceWidth;
        let totalH = part.faceHeight;

        if (orientation === 'vertical') {
            // Vertical Bends affect X (Width)
            if (profileType === 'L') totalW = newDims.a + newDims.b;
            else if (profileType === 'U') totalW = newDims.a + newDims.b + newDims.c;
            else totalW = newDims.a;
        } else {
            // Horizontal Bends affect Y (Height)
            if (profileType === 'L') totalH = newDims.a + newDims.b;
            else if (profileType === 'U') totalH = newDims.a + newDims.b + newDims.c;
        }

        onUpdate({ 
            profile: { type: profileType, orientation: orientation, dims: newDims },
            faceWidth: totalW,
            faceHeight: totalH
        });
    };

    const getLabel = (key: 'a'|'b'|'c') => {
        if (orientation === 'vertical') {
            // Vertical Orientation (Split Width)
            // User terminology: "Ширина левая", "Ширина правая"
            if (profileType === 'L') return key === 'a' ? 'Ширина левая (A)' : 'Ширина правая (B)';
            if (profileType === 'U') return key === 'a' ? 'Ширина левая (A)' : key === 'b' ? 'Центральная ширина (B)' : 'Ширина правая (C)';
        } else {
            // Horizontal Orientation (Split Height)
            // User terminology: "Высота верхняя", "Высота нижняя"
            if (profileType === 'L') return key === 'a' ? 'Высота верхняя (A)' : 'Высота нижняя (B)';
            if (profileType === 'U') return key === 'a' ? 'Высота верхняя (A)' : key === 'b' ? 'Центральная высота (B)' : 'Высота нижняя (C)';
        }
        return key.toUpperCase();
    };

    return (
        <div className="space-y-4">
             <div className="flex justify-end">
                 <button type="button" onClick={onClosePart} className="relative z-10 text-xs flex items-center space-x-1 text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-900 bg-red-900/20 cursor-pointer">
                     <XIcon className="w-3 h-3"/> <span>Закрыть / Сброс</span>
                 </button>
             </div>

             <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                <legend className="px-2 font-semibold text-gray-300 text-sm">Основная информация</legend>
                <div className="space-y-3">
                     <InputField label="Название детали" value={part.name} onChange={e => onUpdate({ name: e.target.value })} />
                     
                     <div>
                        <label className="block text-xs text-gray-400 mb-1">Тип профиля (Авто)</label>
                        <div className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-300 cursor-not-allowed opacity-90 flex justify-between">
                            <span>
                                {profileType === 'flat' ? 'Плоская (Лист)' : 
                                 profileType === 'L' ? 'Г-образная (L)' : 
                                 'П-образная (U)'}
                            </span>
                            <span className="text-xs text-gray-500 uppercase">{orientation}</span>
                        </div>
                     </div>

                     {profileType === 'flat' && (
                        <div className="grid grid-cols-2 gap-2">
                            <InputField label="Ширина (X)" type="number" value={part.faceWidth} onChange={e => onUpdate({ faceWidth: parseFloat(e.target.value) || 0 })} />
                            <InputField label="Высота (Y)" type="number" value={part.faceHeight} onChange={e => onUpdate({ faceHeight: parseFloat(e.target.value) || 0 })} />
                        </div>
                     )}

                     {profileType === 'L' && (
                        <div className="space-y-2 bg-gray-700/30 p-2 rounded border border-dashed border-gray-600">
                            <div className="flex space-x-2">
                                <InputField label={getLabel('a')} type="number" value={dims.a} onChange={e => handleDimChange('a', parseFloat(e.target.value)||0)} />
                                <InputField label={getLabel('b')} type="number" value={dims.b} onChange={e => handleDimChange('b', parseFloat(e.target.value)||0)} />
                            </div>
                            <div className="text-[10px] text-gray-400 text-right">
                                {orientation === 'vertical' ? `Развертка X: ${(dims.a + dims.b).toFixed(2)} мм` : `Развертка Y: ${(dims.a + dims.b).toFixed(2)} мм`}
                            </div>
                            
                            {orientation === 'vertical' ? (
                                <InputField label="Высота (Y)" type="number" value={part.faceHeight} onChange={e => onUpdate({ faceHeight: parseFloat(e.target.value) || 0 })} />
                            ) : (
                                <InputField label="Ширина (X)" type="number" value={part.faceWidth} onChange={e => onUpdate({ faceWidth: parseFloat(e.target.value) || 0 })} />
                            )}
                        </div>
                     )}

                     {profileType === 'U' && (
                        <div className="space-y-2 bg-gray-700/30 p-2 rounded border border-dashed border-gray-600">
                            <div className="grid grid-cols-3 gap-2">
                                <InputField label={getLabel('a')} type="number" value={dims.a} onChange={e => handleDimChange('a', parseFloat(e.target.value)||0)} />
                                <InputField label={getLabel('b')} type="number" value={dims.b} onChange={e => handleDimChange('b', parseFloat(e.target.value)||0)} />
                                <InputField label={getLabel('c')} type="number" value={dims.c} onChange={e => handleDimChange('c', parseFloat(e.target.value)||0)} />
                            </div>
                            <div className="text-[10px] text-gray-400 text-right">
                                {orientation === 'vertical' ? `Развертка X: ${(dims.a + dims.b + dims.c).toFixed(2)} мм` : `Развертка Y: ${(dims.a + dims.b + dims.c).toFixed(2)} мм`}
                            </div>
                            {orientation === 'vertical' ? (
                                <InputField label="Высота (Y)" type="number" value={part.faceHeight} onChange={e => onUpdate({ faceHeight: parseFloat(e.target.value) || 0 })} />
                            ) : (
                                <InputField label="Ширина (X)" type="number" value={part.faceWidth} onChange={e => onUpdate({ faceWidth: parseFloat(e.target.value) || 0 })} />
                            )}
                        </div>
                     )}
                </div>
             </fieldset>

             <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                <legend className="px-2 font-semibold text-gray-300 text-sm">Размеры (из DXF)</legend>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                    <div>
                        <span className="block text-gray-500 text-xs">Ширина (X)</span>
                        <span className="font-mono">{part.geometry.width.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="block text-gray-500 text-xs">Высота (Y)</span>
                        <span className="font-mono">{part.geometry.height.toFixed(2)}</span>
                    </div>
                </div>
             </fieldset>
        </div>
    );
};
