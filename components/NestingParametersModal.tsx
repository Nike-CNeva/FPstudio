
import React, { useState, useEffect } from 'react';
import { Part, NestLayout, ScheduledPart, NestingConstraints, SheetStock, SheetUtilizationStrategy } from '../types';
import { SaveIcon, PlusIcon, TrashIcon } from './Icons';
import { ModalInputField } from './common/InputField';
import { SidebarTabButton } from './common/Button';
import { generateId } from '../utils/helpers';

interface NestingParametersModalProps {
    onClose: () => void;
    onSave: (newSettings: NestLayout['settings'], newScheduledParts: ScheduledPart[]) => void;
    activeNest: NestLayout;
    allParts: Part[];
}

const STOP_DEFINITIONS: Record<number, { min: number, max: number, label: string }> = {
    1: { min: 420, max: 2080, label: 'Упор 1 (Стандарт)' },
    2: { min: 83, max: 1743, label: 'Упор 2 (L <= 1900)' },
    3: { min: 0, max: 1660, label: 'Упор 3 (L <= 1360)' },
    4: { min: 0, max: 1660, label: 'Упор 4 (L < 750)' },
};

const resolveAutoStop = (width: number) => {
    if (width < 750) return 4;
    if (width <= 1360) return 3;
    if (width <= 1900) return 2;
    return 1;
};

const GlobalParametersTab: React.FC<{ settings: NestLayout['settings'], setSettings: React.Dispatch<React.SetStateAction<NestLayout['settings']>> }> = ({ settings, setSettings }) => {
    
    // Determine active sheet width for validation context
    const activeSheet = settings.availableSheets.find(s => s.id === settings.activeSheetId) || settings.availableSheets[0];
    const sheetWidth = activeSheet ? activeSheet.width : 2560;

    // Resolve current active stop
    const activeStopId = settings.loadingStopId === 0 ? resolveAutoStop(sheetWidth) : settings.loadingStopId;
    const activeStopInfo = STOP_DEFINITIONS[activeStopId];

    const updateMargin = (field: keyof NestLayout['settings'], value: number) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const updateClamp = (index: number, value: string) => {
        const newClamps = [...settings.clampPositions];
        newClamps[index] = parseFloat(value) || 0;
        setSettings(prev => ({...prev, clampPositions: newClamps}));
    }

    const validateClamp = (pos: number, index: number, allClamps: number[]): string | null => {
        if (!pos) return null;
        if (pos < activeStopInfo.min || pos > activeStopInfo.max) {
            return `Выход за пределы (${activeStopInfo.min}-${activeStopInfo.max})`;
        }
        
        // Check distance to other clamps
        for (let i = 0; i < allClamps.length; i++) {
            if (i === index || !allClamps[i]) continue;
            if (Math.abs(pos - allClamps[i]) < 150) {
                return `Конфликт с зажимом ${i+1} (<150мм)`;
            }
        }
        return null;
    };

    const errors = settings.clampPositions.map((c, i) => validateClamp(c, i, settings.clampPositions));

    return (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
                 <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Отступы между деталями</legend>
                    <div className="flex space-x-4">
                        <ModalInputField label="По X (мм)" type="number" value={settings.partSpacingX} onChange={e => setSettings(s => ({...s, partSpacingX: parseFloat(e.target.value) || 0}))} />
                        <ModalInputField label="По Y (мм)" type="number" value={settings.partSpacingY} onChange={e => setSettings(s => ({...s, partSpacingY: parseFloat(e.target.value) || 0}))} />
                    </div>
                </fieldset>
                 <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Поля листа</legend>
                     <div className="grid grid-cols-2 gap-4">
                        <ModalInputField label="Сверху" type="number" value={settings.sheetMarginTop} onChange={e => updateMargin('sheetMarginTop', parseFloat(e.target.value) || 0)} />
                        <ModalInputField label="Снизу" type="number" value={settings.sheetMarginBottom} onChange={e => updateMargin('sheetMarginBottom', parseFloat(e.target.value) || 0)} />
                        <ModalInputField label="Слева" type="number" value={settings.sheetMarginLeft} onChange={e => updateMargin('sheetMarginLeft', parseFloat(e.target.value) || 0)} />
                        <ModalInputField label="Справа" type="number" value={settings.sheetMarginRight} onChange={e => updateMargin('sheetMarginRight', parseFloat(e.target.value) || 0)} />
                    </div>
                </fieldset>

                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Оптимизация</legend>
                     <div className="space-y-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" checked={settings.useCommonLine} onChange={e => setSettings(s => ({...s, useCommonLine: e.target.checked}))} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                            <span>Использовать общую линию (Common Line)</span>
                        </label>
                        <p className="text-xs text-gray-400 pl-6">
                            Разрешает совмещение краев деталей с одинаковой обработкой.
                        </p>
                        
                        <label className="flex items-center space-x-2 cursor-pointer mt-2">
                            <input type="checkbox" checked={settings.vertexSnapping} onChange={e => setSettings(s => ({...s, vertexSnapping: e.target.checked}))} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                            <span>Авто-выравнивание по вершинам</span>
                        </label>
                     </div>
                </fieldset>
            </div>
             <div className="space-y-4">
                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Информация о прижимах и Упорах</legend>
                    
                    <div className="mb-4 bg-gray-700/30 p-2 rounded">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Выбор Упора (Loading Stop)</label>
                        <select 
                            value={settings.loadingStopId} 
                            onChange={(e) => setSettings(s => ({...s, loadingStopId: parseInt(e.target.value)}))}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                        >
                            <option value={0}>Автоматически (по ширине листа)</option>
                            <option value={1}>Упор 1 (420 - 2080)</option>
                            <option value={2}>Упор 2 (83 - 1743)</option>
                            <option value={3}>Упор 3 (0 - 1660)</option>
                            <option value={4}>Упор 4 (0 - 1660)</option>
                        </select>
                        <div className="mt-2 text-xs text-gray-400 flex justify-between">
                            <span>Активный: <strong className="text-blue-400">{activeStopInfo.label}</strong></span>
                            <span>Диапазон: {activeStopInfo.min} - {activeStopInfo.max} мм</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map(idx => (
                            <div key={idx}>
                                <ModalInputField 
                                    label={`Позиция ${idx+1}`} 
                                    type="number" 
                                    value={settings.clampPositions[idx] || ''} 
                                    onChange={e => updateClamp(idx, e.target.value)} 
                                />
                                {errors[idx] && <p className="text-[10px] text-red-400 mt-1 leading-tight">{errors[idx]}</p>}
                            </div>
                        ))}
                    </div>
                     <label className="flex items-center space-x-2 mt-3 cursor-pointer">
                        <input type="checkbox" checked={settings.nestUnderClamps} onChange={e => setSettings(s => ({...s, nestUnderClamps: e.target.checked}))} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                        <span>Раскладывать под прижимами (Опасно)</span>
                    </label>
                </fieldset>

                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Направление раскладки</legend>
                    <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
                        {[6, 7, 8, 3, 4, 5, 0, 1, 2].map(i => (
                            <label key={i} className={`flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-colors ${settings.nestingDirection === i ? 'bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                <input type="radio" name="nesting-direction" value={i} checked={settings.nestingDirection === i} onChange={() => setSettings(s => ({...s, nestingDirection: i}))} className="opacity-0 w-0 h-0" />
                            </label>
                        ))}
                    </div>
                </fieldset>

            </div>
        </div>
    );
};

const PartListTab: React.FC<{ allParts: Part[], scheduledParts: ScheduledPart[], setScheduledParts: React.Dispatch<React.SetStateAction<ScheduledPart[]>> }> = ({ allParts, scheduledParts, setScheduledParts }) => {
    
    const addPart = (partId: string) => {
        setScheduledParts(prev => {
            const existing = prev.find(p => p.partId === partId);
            if (existing) {
                return prev.map(p => p.partId === partId ? { ...p, quantity: p.quantity + 1 } : p);
            }
            const part = allParts.find(p => p.id === partId);
            const defaultNesting: NestingConstraints = part ? { ...part.nesting } : { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: false, canMirror: false };
            return [...prev, { partId, quantity: 1, nesting: defaultNesting }];
        })
    };

    const updateQuantity = (partId: string, val: number) => {
        setScheduledParts(prev => prev.map(p => p.partId === partId ? { ...p, quantity: val } : p));
    };

    const updateNesting = (partId: string, field: keyof NestingConstraints, value: any) => {
        setScheduledParts(prev => prev.map(p => p.partId === partId ? { ...p, nesting: { ...p.nesting, [field]: value } } : p));
    };

    const removePart = (partId: string) => {
        setScheduledParts(prev => prev.filter(p => p.partId !== partId));
    };
    
    return (
        <div className="grid grid-cols-3 gap-x-8">
            <div className="col-span-1">
                <h3 className="font-semibold text-gray-300 mb-2">Доступные детали</h3>
                <div className="bg-gray-900/50 rounded-md p-2 h-80 overflow-y-auto space-y-2">
                    {allParts.map(part => (
                        <div key={part.id} className="bg-gray-700 p-2 rounded flex items-center justify-between">
                            <span className="truncate text-sm" title={part.name}>{part.name}</span>
                            <button onClick={() => addPart(part.id)} className="p-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white">
                                <PlusIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="col-span-2">
                 <h3 className="font-semibold text-gray-300 mb-2">Запланированные детали</h3>
                 <div className="bg-gray-900/50 rounded-md p-2 h-80 overflow-y-auto space-y-2">
                     <div className="grid grid-cols-[1fr,60px,40px,40px,40px,40px,30px] gap-2 text-xs text-gray-400 font-bold px-2 py-1 text-center">
                         <span className="text-left">Название</span>
                         <span>Кол-во</span>
                         <span>0/180</span>
                         <span>90/270</span>
                         <span>Mir</span>
                         <span>Com</span>
                         <span></span>
                     </div>
                     {scheduledParts.map(sp => {
                         const part = allParts.find(p => p.id === sp.partId);
                         return (
                            <div key={sp.partId} className="bg-gray-700 p-2 rounded grid grid-cols-[1fr,60px,40px,40px,40px,40px,30px] items-center gap-2 text-center">
                                <span className="truncate text-left text-sm" title={part?.name}>{part?.name || 'Н/Д'}</span>
                                <input 
                                    type="number" 
                                    value={sp.quantity}
                                    onChange={e => updateQuantity(sp.partId, parseInt(e.target.value, 10) || 1)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded px-1 py-1 text-center text-xs"
                                />
                                <input type="checkbox" checked={sp.nesting.allow0_180} onChange={e => updateNesting(sp.partId, 'allow0_180', e.target.checked)} className="mx-auto form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                                <input type="checkbox" checked={sp.nesting.allow90_270} onChange={e => updateNesting(sp.partId, 'allow90_270', e.target.checked)} className="mx-auto form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                                <input type="checkbox" checked={sp.nesting.canMirror} onChange={e => updateNesting(sp.partId, 'canMirror', e.target.checked)} className="mx-auto form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                                <input type="checkbox" checked={sp.nesting.commonLine} onChange={e => updateNesting(sp.partId, 'commonLine', e.target.checked)} className="mx-auto form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                                
                                <button onClick={() => removePart(sp.partId)} className="text-gray-500 hover:text-red-500 mx-auto">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                         )
                     })}
                 </div>
            </div>
        </div>
    );
};

// MaterialSheetTab: Updated to match screenshot style
const MaterialSheetTab: React.FC<{ settings: NestLayout['settings'], setSettings: React.Dispatch<React.SetStateAction<NestLayout['settings']>> }> = ({ settings, setSettings }) => {
    const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);

    const addSheet = () => {
        const newSheet: SheetStock = {
            id: generateId(),
            width: 2560, // Changed from 2500 to 2560 per request
            height: 1250,
            thickness: 1.0,
            material: 'Zink', // Changed from St-3 to Zink
            quantity: 1,
            cost: 0,
            useInNesting: true
        };
        setSettings(prev => ({
            ...prev,
            availableSheets: [...prev.availableSheets, newSheet],
            activeSheetId: newSheet.id // Select new one
        }));
        setSelectedSheetId(newSheet.id);
    };

    const removeSheet = () => {
        if (!selectedSheetId) return;
        setSettings(prev => {
            const newSheets = prev.availableSheets.filter(s => s.id !== selectedSheetId);
            return { 
                ...prev, 
                availableSheets: newSheets, 
                activeSheetId: newSheets.length > 0 ? newSheets[0].id : null 
            };
        });
        setSelectedSheetId(null);
    };

    const updateSelectedSheet = (field: keyof SheetStock, value: any) => {
        if (!selectedSheetId) return;
        setSettings(prev => ({
            ...prev,
            availableSheets: prev.availableSheets.map(s => s.id === selectedSheetId ? { ...s, [field]: value } : s)
        }));
    };

    const moveSheet = (direction: 'up' | 'top') => {
        if (!selectedSheetId) return;
        setSettings(prev => {
            const sheets = [...prev.availableSheets];
            const idx = sheets.findIndex(s => s.id === selectedSheetId);
            if (idx <= 0) return prev; // Already top

            const item = sheets[idx];
            sheets.splice(idx, 1);
            if (direction === 'top') {
                sheets.unshift(item);
            } else {
                sheets.splice(idx - 1, 0, item);
            }
            return { ...prev, availableSheets: sheets };
        });
    };

    const selectedSheet = settings.availableSheets.find(s => s.id === selectedSheetId);

    return (
        <div className="space-y-6">
            
            {/* Top Section: Reserved Sheets List */}
            <div className="flex space-x-4 h-64">
                <fieldset className="border border-gray-600 p-2 rounded-md bg-gray-800/50 flex-1 flex flex-col overflow-hidden">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Reserved sheets</legend>
                    <div className="flex-1 overflow-auto bg-white text-black">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-gray-200 sticky top-0">
                                <tr>
                                    <th className="p-1 border border-gray-300">Sheet ID</th>
                                    <th className="p-1 border border-gray-300">Size-X</th>
                                    <th className="p-1 border border-gray-300">Size-Y</th>
                                    <th className="p-1 border border-gray-300">Reserved</th>
                                    <th className="p-1 border border-gray-300">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {settings.availableSheets.map(sheet => (
                                    <tr 
                                        key={sheet.id} 
                                        onClick={() => setSelectedSheetId(sheet.id)}
                                        className={`cursor-pointer ${selectedSheetId === sheet.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
                                    >
                                        <td className="p-1 border border-gray-300">{sheet.material}</td>
                                        <td className="p-1 border border-gray-300">{sheet.width}</td>
                                        <td className="p-1 border border-gray-300">{sheet.height}</td>
                                        <td className="p-1 border border-gray-300">{sheet.quantity}</td>
                                        <td className="p-1 border border-gray-300">{sheet.cost}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </fieldset>

                <div className="flex flex-col space-y-2 w-32 pt-2">
                    <button onClick={addSheet} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black text-xs rounded border border-gray-400">New...</button>
                    {/* Modify is essentially just enabling inputs below, but visual consistency */}
                    <button disabled={!selectedSheetId} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black text-xs rounded border border-gray-400 disabled:opacity-50">Modify...</button>
                    <button onClick={removeSheet} disabled={!selectedSheetId} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black text-xs rounded border border-gray-400 disabled:opacity-50">Delete</button>
                    <div className="h-4"></div>
                    <button onClick={() => moveSheet('up')} disabled={!selectedSheetId} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black text-xs rounded border border-gray-400 disabled:opacity-50">Switch up</button>
                    <button onClick={() => moveSheet('top')} disabled={!selectedSheetId} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-black text-xs rounded border border-gray-400 disabled:opacity-50">Move to top</button>
                </div>
            </div>

            {/* Middle Section: Edit Fields (Hidden mostly, but active if modifying) */}
            {selectedSheet && (
                <div className="bg-gray-700/50 p-2 rounded border border-gray-600 grid grid-cols-5 gap-2 text-xs">
                    <div className="col-span-1"><label className="block text-gray-400 mb-1">Sheet ID</label><input type="text" value={selectedSheet.material} onChange={e => updateSelectedSheet('material', e.target.value)} className="w-full bg-gray-900 border border-gray-500 px-1 py-0.5"/></div>
                    <div className="col-span-1"><label className="block text-gray-400 mb-1">Size X</label><input type="number" value={selectedSheet.width} onChange={e => updateSelectedSheet('width', parseFloat(e.target.value)||0)} className="w-full bg-gray-900 border border-gray-500 px-1 py-0.5"/></div>
                    <div className="col-span-1"><label className="block text-gray-400 mb-1">Size Y</label><input type="number" value={selectedSheet.height} onChange={e => updateSelectedSheet('height', parseFloat(e.target.value)||0)} className="w-full bg-gray-900 border border-gray-500 px-1 py-0.5"/></div>
                    <div className="col-span-1"><label className="block text-gray-400 mb-1">Reserved</label><input type="number" value={selectedSheet.quantity} onChange={e => updateSelectedSheet('quantity', parseFloat(e.target.value)||0)} className="w-full bg-gray-900 border border-gray-500 px-1 py-0.5"/></div>
                    <div className="col-span-1"><label className="block text-gray-400 mb-1">Cost</label><input type="number" value={selectedSheet.cost || 0} onChange={e => updateSelectedSheet('cost', parseFloat(e.target.value)||0)} className="w-full bg-gray-900 border border-gray-500 px-1 py-0.5"/></div>
                </div>
            )}

            {/* Bottom Section: Utilization & Coil */}
            <div className="grid grid-cols-2 gap-4">
                <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Sheet utilization option</legend>
                    <div className="space-y-2 text-xs">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="utilization" 
                                checked={settings.utilizationStrategy === SheetUtilizationStrategy.ListedOrder} 
                                onChange={() => setSettings(s => ({...s, utilizationStrategy: SheetUtilizationStrategy.ListedOrder}))}
                                className="form-radio h-3 w-3 text-blue-600" 
                            />
                            <span>Use in listed order</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="utilization" 
                                checked={settings.utilizationStrategy === SheetUtilizationStrategy.SmallestFirst} 
                                onChange={() => setSettings(s => ({...s, utilizationStrategy: SheetUtilizationStrategy.SmallestFirst}))}
                                className="form-radio h-3 w-3 text-blue-600" 
                            />
                            <span>Use smallest</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="radio" disabled className="form-radio h-3 w-3 text-gray-600" />
                            <span className="text-gray-500">Use only the first sheet size</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="utilization" 
                                checked={settings.utilizationStrategy === SheetUtilizationStrategy.BestFit} 
                                onChange={() => setSettings(s => ({...s, utilizationStrategy: SheetUtilizationStrategy.BestFit}))}
                                className="form-radio h-3 w-3 text-blue-600" 
                            />
                            <span>Advanced (Best Fit)</span>
                        </label>
                        <div className="pl-6 text-gray-400 flex items-center space-x-2">
                            <span>Number of sizes to try:</span>
                            <input type="number" disabled value="2" className="w-10 bg-gray-700 px-1 border border-gray-600 text-gray-500" />
                        </div>
                    </div>
                </fieldset>

                <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50 opacity-50 pointer-events-none">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Coil nesting</legend>
                    <div className="space-y-2 text-xs">
                        <label className="flex items-center space-x-2">
                            <input type="checkbox" className="form-checkbox h-3 w-3" />
                            <span>Enable</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-right">
                            <div className="flex justify-end items-center gap-2"><label>Min length:</label><input type="text" className="w-12 bg-gray-700" /></div>
                            <div className="flex justify-end items-center gap-2"><label>Max length:</label><input type="text" className="w-12 bg-gray-700" /></div>
                            <div className="flex justify-end items-center gap-2"><label>Step:</label><input type="text" className="w-12 bg-gray-700" /></div>
                        </div>
                    </div>
                </fieldset>
            </div>

            {/* Other Options */}
            <div className="flex space-x-4 text-xs text-gray-300">
                <div className="flex items-center space-x-2">
                    <label>Sort sheet queue:</label>
                    <select className="bg-gray-700 border border-gray-600 rounded px-2 py-1">
                        <option>No sorting</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="flex items-center space-x-2"><input type="checkbox" /> <span>Square last sheet</span></label>
                    <label className="flex items-center space-x-2"><input type="checkbox" /> <span>Set maximum number of nested sheets</span></label>
                </div>
            </div>
        </div>
    );
};


export const NestingParametersModal: React.FC<NestingParametersModalProps> = ({ onClose, onSave, activeNest, allParts }) => {
    const [activeTab, setActiveTab] = useState<'global' | 'parts' | 'sheet'>('sheet'); // Default to sheet as requested
    const [settings, setSettings] = useState<NestLayout['settings']>(() => JSON.parse(JSON.stringify(activeNest.settings)));
    const [scheduledParts, setScheduledParts] = useState<ScheduledPart[]>(() => JSON.parse(JSON.stringify(activeNest.scheduledParts)));

    const handleSave = () => {
        onSave(settings, scheduledParts);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl flex flex-col max-h-[95vh] border border-gray-600">
                <div className="flex justify-between items-center p-3 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-sm font-bold text-white">Nesting parameters</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
                </div>
                
                <div className="flex border-b border-gray-700 px-4 bg-gray-800 pt-2">
                    <SidebarTabButton label="Global parameters" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
                    <SidebarTabButton label="Part list" active={activeTab === 'parts'} onClick={() => setActiveTab('parts')} />
                    <SidebarTabButton label="Material sheet list" active={activeTab === 'sheet'} onClick={() => setActiveTab('sheet')} />
                </div>

                <div className="p-6 overflow-y-auto bg-gray-800 flex-1">
                    {activeTab === 'global' && <GlobalParametersTab settings={settings} setSettings={setSettings} />}
                    {activeTab === 'parts' && <PartListTab allParts={allParts} scheduledParts={scheduledParts} setScheduledParts={setScheduledParts} />}
                    {activeTab === 'sheet' && <MaterialSheetTab settings={settings} setSettings={setSettings} />}
                </div>

                <div className="p-3 bg-gray-900 flex justify-between items-center rounded-b-lg border-t border-gray-700">
                    <button className="px-4 py-1 bg-gray-700 hover:bg-gray-600 rounded-md text-xs text-gray-300 border border-gray-500">Use as default</button>
                    <div className="flex space-x-2">
                        <button onClick={handleSave} className="px-6 py-1 bg-gray-200 hover:bg-white text-black rounded-md text-xs border border-gray-400 shadow">OK</button>
                        <button onClick={onClose} className="px-6 py-1 bg-gray-200 hover:bg-white text-black rounded-md text-xs border border-gray-400 shadow">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
