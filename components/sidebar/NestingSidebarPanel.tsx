
import React, { useState } from 'react';
import { NestLayout, ScheduledPart, Part, SheetStock, NestingConstraints } from '../../types';
import { ModalInputField } from '../common/InputField';
import { SidebarTabButton } from '../common/Button';
import { PlusIcon, TrashIcon } from '../Icons';
import { generateId } from '../../utils/helpers';

interface NestingSidebarPanelProps {
    activeNest: NestLayout;
    allParts: Part[];
    onSettingsChange: (settings: NestLayout['settings'], scheduledParts: ScheduledPart[]) => void;
}

export const NestingSidebarPanel: React.FC<NestingSidebarPanelProps> = ({ activeNest, allParts, onSettingsChange }) => {
    const [activeTab, setActiveTab] = useState<'parts' | 'params' | 'sheet'>('parts');
    
    const settings = activeNest.settings;
    const scheduledParts = activeNest.scheduledParts;

    const updateSettings = (updates: Partial<NestLayout['settings']>) => {
        onSettingsChange({ ...settings, ...updates }, scheduledParts);
    };

    const updateScheduledParts = (newParts: ScheduledPart[]) => {
        onSettingsChange(settings, newParts);
    };

    const updateClamp = (index: number, value: string) => {
        const newClamps = [...settings.clampPositions];
        newClamps[index] = parseFloat(value) || 0;
        updateSettings({ clampPositions: newClamps });
    }

    // --- PARTS LOGIC ---
    const addPart = (partId: string) => {
        const existing = scheduledParts.find(p => p.partId === partId);
        if (existing) {
            updateScheduledParts(scheduledParts.map(p => p.partId === partId ? { ...p, quantity: p.quantity + 1 } : p));
        } else {
            const part = allParts.find(p => p.id === partId);
            const defaultNesting: NestingConstraints = part ? { ...part.nesting } : { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: false, canMirror: false };
            updateScheduledParts([...scheduledParts, { partId, quantity: 1, nesting: defaultNesting }]);
        }
    };

    const removePart = (partId: string) => {
        updateScheduledParts(scheduledParts.filter(p => p.partId !== partId));
    };
    
    const updatePartQuantity = (partId: string, q: number) => {
        updateScheduledParts(scheduledParts.map(p => p.partId === partId ? { ...p, quantity: q } : p));
    };

    const updatePartNesting = (partId: string, field: keyof NestingConstraints, val: boolean) => {
        updateScheduledParts(scheduledParts.map(p => p.partId === partId ? { ...p, nesting: { ...p.nesting, [field]: val } } : p));
    };

    // --- SHEET LOGIC ---
    const addSheet = () => {
        const newSheet: SheetStock = { id: generateId(), width: 2500, height: 1250, thickness: 1.0, material: 'St-3', quantity: 10 };
        updateSettings({ availableSheets: [...settings.availableSheets, newSheet] });
    };
    const updateSheet = (id: string, field: keyof SheetStock, val: any) => {
        updateSettings({ availableSheets: settings.availableSheets.map(s => s.id === id ? {...s, [field]: val} : s) });
    };
    const removeSheet = (id: string) => {
         const newSheets = settings.availableSheets.filter(s => s.id !== id);
         const newActiveId = settings.activeSheetId === id ? (newSheets[0]?.id || null) : settings.activeSheetId;
         updateSettings({ availableSheets: newSheets, activeSheetId: newActiveId });
    };


    return (
        <div className="flex flex-col h-full">
            <div className="flex border-b border-gray-600 mb-2 text-xs">
                <SidebarTabButton label="Детали" active={activeTab === 'parts'} onClick={() => setActiveTab('parts')} />
                <SidebarTabButton label="Параметры" active={activeTab === 'params'} onClick={() => setActiveTab('params')} />
                <SidebarTabButton label="Лист" active={activeTab === 'sheet'} onClick={() => setActiveTab('sheet')} />
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                
                {/* --- PARTS TAB --- */}
                {activeTab === 'parts' && (
                    <div className="space-y-4">
                        <div className="bg-gray-800 p-2 rounded border border-gray-600">
                            <h4 className="text-xs font-bold text-gray-400 mb-2">Библиотека</h4>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                                {allParts.map(part => (
                                    <div key={part.id} className="flex justify-between items-center bg-gray-700 p-1 rounded hover:bg-gray-600 text-xs">
                                        <span className="truncate flex-1 mr-2" title={part.name}>{part.name}</span>
                                        <button onClick={() => addPart(part.id)} className="bg-blue-600 text-white p-0.5 rounded flex-shrink-0"><PlusIcon className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-gray-400 mb-2">В раскрой</h4>
                            <div className="space-y-2">
                                {scheduledParts.map(sp => {
                                    const part = allParts.find(p => p.id === sp.partId);
                                    return (
                                        <div key={sp.partId} className="bg-gray-800 p-2 rounded border border-gray-600 text-xs">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-blue-300 truncate flex-1 mr-2" title={part?.name}>{part?.name}</span>
                                                <button onClick={() => removePart(sp.partId)} className="text-red-400 flex-shrink-0"><TrashIcon className="w-3 h-3"/></button>
                                            </div>
                                            <div className="flex items-center space-x-2 mb-2">
                                                <span className="text-gray-500">Кол-во:</span>
                                                <input type="number" value={sp.quantity} onChange={(e) => updatePartQuantity(sp.partId, parseInt(e.target.value)||1)} className="w-12 bg-gray-900 border border-gray-600 rounded px-1" />
                                            </div>
                                            <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-400">
                                                <label><input type="checkbox" checked={sp.nesting.allow0_180} onChange={e => updatePartNesting(sp.partId, 'allow0_180', e.target.checked)} /> 0/180</label>
                                                <label><input type="checkbox" checked={sp.nesting.allow90_270} onChange={e => updatePartNesting(sp.partId, 'allow90_270', e.target.checked)} /> 90/270</label>
                                                {/* <label><input type="checkbox" checked={sp.nesting.commonLine} onChange={e => updatePartNesting(sp.partId, 'commonLine', e.target.checked)} /> Common</label> */}
                                            </div>
                                        </div>
                                    )
                                })}
                                {scheduledParts.length === 0 && <p className="text-xs text-gray-500 text-center">Список пуст</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- PARAMS TAB --- */}
                {activeTab === 'params' && (
                    <div className="space-y-4">
                        <fieldset className="border border-gray-600 p-2 rounded bg-gray-800/50">
                            <legend className="text-xs font-bold text-blue-400 px-1">Зазор и Отступы</legend>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <ModalInputField label="Зазор X" type="number" value={settings.partSpacingX} onChange={e => updateSettings({partSpacingX: parseFloat(e.target.value)||0})} />
                                <ModalInputField label="Зазор Y" type="number" value={settings.partSpacingY} onChange={e => updateSettings({partSpacingY: parseFloat(e.target.value)||0})} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <ModalInputField label="Отступ Сверху" type="number" value={settings.sheetMarginTop} onChange={e => updateSettings({sheetMarginTop: parseFloat(e.target.value)||0})} />
                                <ModalInputField label="Отступ Снизу" type="number" value={settings.sheetMarginBottom} onChange={e => updateSettings({sheetMarginBottom: parseFloat(e.target.value)||0})} />
                                <ModalInputField label="Отступ Слева" type="number" value={settings.sheetMarginLeft} onChange={e => updateSettings({sheetMarginLeft: parseFloat(e.target.value)||0})} />
                                <ModalInputField label="Отступ Справа" type="number" value={settings.sheetMarginRight} onChange={e => updateSettings({sheetMarginRight: parseFloat(e.target.value)||0})} />
                            </div>
                        </fieldset>
                        
                        <fieldset className="border border-gray-600 p-2 rounded bg-gray-800/50">
                            <legend className="text-xs font-bold text-blue-400 px-1">Прижимы</legend>
                             <div className="grid grid-cols-3 gap-2">
                                <ModalInputField label="Зажим 1" type="number" value={settings.clampPositions[0] || ''} onChange={e => updateClamp(0, e.target.value)} />
                                <ModalInputField label="Зажим 2" type="number" value={settings.clampPositions[1] || ''} onChange={e => updateClamp(1, e.target.value)} />
                                <ModalInputField label="Зажим 3" type="number" value={settings.clampPositions[2] || ''} onChange={e => updateClamp(2, e.target.value)} />
                            </div>
                            <label className="flex items-center space-x-2 mt-2 cursor-pointer">
                                <input type="checkbox" checked={settings.nestUnderClamps} onChange={e => updateSettings({nestUnderClamps: e.target.checked})} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-900 border-gray-500" />
                                <span className="text-xs">Раскладывать под прижимами</span>
                            </label>
                        </fieldset>

                         <fieldset className="border border-gray-600 p-2 rounded bg-gray-800/50">
                            <legend className="text-xs font-bold text-blue-400 px-1">Опции</legend>
                            <label className="flex items-center space-x-2 cursor-pointer mb-2">
                                <input type="checkbox" checked={settings.useCommonLine} onChange={e => updateSettings({useCommonLine: e.target.checked})} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-900 border-gray-500" />
                                <span className="text-xs">Common Line (Авто)</span>
                            </label>
                            
                            <label className="text-xs text-gray-400 block mb-1">Направление укладки</label>
                            <div className="grid grid-cols-3 gap-1 w-20">
                                {[6, 7, 8, 3, 4, 5, 0, 1, 2].map(i => (
                                    <button 
                                        key={i} 
                                        onClick={() => updateSettings({nestingDirection: i})}
                                        className={`w-5 h-5 rounded-sm border ${settings.nestingDirection === i ? 'bg-blue-600 border-blue-400' : 'bg-gray-700 border-gray-600'}`}
                                    />
                                ))}
                            </div>
                         </fieldset>
                    </div>
                )}

                {/* --- SHEET TAB --- */}
                {activeTab === 'sheet' && (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-gray-400">Список Листов</span>
                            <button onClick={addSheet} className="text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white">Добавить</button>
                        </div>
                        {settings.availableSheets.map(sheet => (
                            <div key={sheet.id} className={`p-2 rounded border text-xs space-y-1 ${settings.activeSheetId === sheet.id ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                                <div className="flex justify-between">
                                    <label className="flex items-center space-x-2">
                                        <input type="radio" checked={settings.activeSheetId === sheet.id} onChange={() => updateSettings({activeSheetId: sheet.id})} />
                                        <span className="font-bold text-gray-300">Размер {sheet.width}x{sheet.height}</span>
                                    </label>
                                    <button onClick={() => removeSheet(sheet.id)} className="text-red-500"><TrashIcon className="w-3 h-3"/></button>
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                    <input type="number" value={sheet.width} onChange={e => updateSheet(sheet.id, 'width', parseFloat(e.target.value)||0)} className="bg-gray-900 border border-gray-600 px-1 rounded" placeholder="Ширина" />
                                    <input type="number" value={sheet.height} onChange={e => updateSheet(sheet.id, 'height', parseFloat(e.target.value)||0)} className="bg-gray-900 border border-gray-600 px-1 rounded" placeholder="Высота" />
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                    <input type="number" value={sheet.thickness} onChange={e => updateSheet(sheet.id, 'thickness', parseFloat(e.target.value)||0)} className="bg-gray-900 border border-gray-600 px-1 rounded" placeholder="Толщина" />
                                    <input type="number" value={sheet.quantity} onChange={e => updateSheet(sheet.id, 'quantity', parseFloat(e.target.value)||0)} className="bg-gray-900 border border-gray-600 px-1 rounded" placeholder="Кол-во" />
                                </div>
                                <div className="flex space-x-1 items-center">
                                    <span>Мат:</span>
                                    <input type="text" value={sheet.material} onChange={e => updateSheet(sheet.id, 'material', e.target.value)} className="bg-gray-900 border border-gray-600 px-1 rounded flex-1" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
};
