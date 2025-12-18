
import React, { useState, useRef } from 'react';
import { NestLayout, ScheduledPart, Part, SheetStock, NestingConstraints, SheetUtilizationStrategy } from '../../types';
import { ModalInputField } from '../common/InputField';
import { SidebarTabButton } from '../common/Button';
import { PlusIcon, TrashIcon, SaveIcon, DownloadIcon } from '../Icons';
import { generateId } from '../../utils/helpers';

interface NestingSidebarPanelProps {
    activeNest: NestLayout;
    allParts: Part[];
    onSettingsChange: (settings: NestLayout['settings'], scheduledParts: ScheduledPart[]) => void;
    onMetadataChange?: (metadata: { customer?: string, workOrder?: string }) => void;
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

export const NestingSidebarPanel: React.FC<NestingSidebarPanelProps> = ({ activeNest, allParts, onSettingsChange, onMetadataChange }) => {
    const [activeTab, setActiveTab] = useState<'parts' | 'params' | 'sheet'>('parts');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const settings = activeNest.settings;
    const scheduledParts = activeNest.scheduledParts;

    // Determine active sheet width for validation context
    const activeSheet = settings.availableSheets.find(s => s.id === settings.activeSheetId) || settings.availableSheets[0];
    const sheetWidth = activeSheet ? activeSheet.width : 2500;

    // Resolve current active stop
    const activeStopId = settings.loadingStopId === 0 ? resolveAutoStop(sheetWidth) : settings.loadingStopId;
    const activeStopInfo = STOP_DEFINITIONS[activeStopId];

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

    const validateClamp = (pos: number, index: number, allClamps: number[]): string | null => {
        if (!pos) return null;
        if (pos < activeStopInfo.min || pos > activeStopInfo.max) {
            return `Выход за пределы (${activeStopInfo.min}-${activeStopInfo.max})`;
        }
        for (let i = 0; i < allClamps.length; i++) {
            if (i === index || !allClamps[i]) continue;
            if (Math.abs(pos - allClamps[i]) < 150) {
                return `Конфликт с зажимом ${i+1} (<150мм)`;
            }
        }
        return null;
    };

    const clampErrors = settings.clampPositions.map((c, i) => validateClamp(c, i, settings.clampPositions));

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
    const updateGlobalMaterial = (val: string) => {
        const updatedSheets = settings.availableSheets.map(s => ({...s, material: val}));
        updateSettings({ defaultMaterial: val, availableSheets: updatedSheets });
    };

    const updateGlobalThickness = (val: number) => {
        const updatedSheets = settings.availableSheets.map(s => ({...s, thickness: val}));
        updateSettings({ defaultThickness: val, availableSheets: updatedSheets });
    };

    const addSheet = () => {
        const newSheet: SheetStock = { 
            id: generateId(), 
            width: 2560, 
            height: 1250, 
            thickness: settings.defaultThickness || 1.0, 
            material: settings.defaultMaterial || 'Zink', 
            quantity: 10, 
            cost: 0, 
            useInNesting: true 
        };
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
    const moveSheet = (index: number, direction: 'up' | 'down') => {
        const sheets = [...settings.availableSheets];
        if (direction === 'up' && index > 0) {
            [sheets[index], sheets[index - 1]] = [sheets[index - 1], sheets[index]];
        } else if (direction === 'down' && index < sheets.length - 1) {
            [sheets[index], sheets[index + 1]] = [sheets[index + 1], sheets[index]];
        }
        updateSettings({ availableSheets: sheets });
    };

    const handleSaveProject = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeNest));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `nest_project_${activeNest.workOrder || 'draft'}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleLoadProject = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                window.dispatchEvent(new CustomEvent('fp-load-nest', { detail: json }));
            } catch (err) {
                alert("Invalid project file");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    return (
        <div className="flex flex-col h-full">
            {/* Metadata Section */}
            <div className="p-3 bg-gray-800 border-b border-gray-600 space-y-2">
                <div className="flex space-x-2">
                    <input 
                        type="text" 
                        placeholder="Заказчик" 
                        className="w-1/2 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                        value={activeNest.customer || ''}
                        onChange={(e) => onMetadataChange && onMetadataChange({ customer: e.target.value })}
                    />
                    <input 
                        type="text" 
                        placeholder="№ Заказа" 
                        className="w-1/2 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                        value={activeNest.workOrder || ''}
                        onChange={(e) => onMetadataChange && onMetadataChange({ workOrder: e.target.value })}
                    />
                </div>
                <div className="flex space-x-2">
                    <button onClick={handleSaveProject} className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-1 rounded flex items-center justify-center space-x-1">
                        <SaveIcon className="w-3 h-3"/> <span>Сохранить</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs py-1 rounded flex items-center justify-center space-x-1">
                        <DownloadIcon className="w-3 h-3 rotate-180"/> <span>Загрузить</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleLoadProject} accept=".json" className="hidden" />
                </div>
            </div>

            <div className="flex border-b border-gray-600 mb-2 text-xs bg-gray-700 pt-1">
                <SidebarTabButton label="Детали" active={activeTab === 'parts'} onClick={() => setActiveTab('parts')} />
                <SidebarTabButton label="Параметры" active={activeTab === 'params'} onClick={() => setActiveTab('params')} />
                <SidebarTabButton label="Лист" active={activeTab === 'sheet'} onClick={() => setActiveTab('sheet')} />
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 p-2">
                
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
                            <legend className="text-xs font-bold text-blue-400 px-1">Алгоритм</legend>
                            <label className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-700/50 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={settings.nestAsRectangle} 
                                    onChange={e => updateSettings({nestAsRectangle: e.target.checked})} 
                                    className="form-checkbox h-4 w-4 text-blue-600 bg-gray-900 border-gray-500" 
                                />
                                <span className="text-xs text-white">Раскладывать прямоугольником</span>
                            </label>
                            <p className="text-[10px] text-gray-400 mt-1 pl-6 italic">
                                Отключите для плотной укладки деталей сложной формы.
                            </p>
                        </fieldset>

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
                            <legend className="text-xs font-bold text-blue-400 px-1">Прижимы и Упор</legend>
                            
                            <div className="mb-3 bg-gray-700/50 p-2 rounded">
                                <label className="block text-[10px] text-gray-400 mb-1">Выбор Упора</label>
                                <select 
                                    value={settings.loadingStopId} 
                                    onChange={(e) => updateSettings({ loadingStopId: parseInt(e.target.value) })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
                                >
                                    <option value={0}>Автоматически (по ширине)</option>
                                    <option value={1}>Упор 1 (Стандарт)</option>
                                    <option value={2}>Упор 2 (L {'<='} 1900)</option>
                                    <option value={3}>Упор 3 (L {'<='} 1360)</option>
                                    <option value={4}>Упор 4 (L {'<'} 750)</option>
                                </select>
                                <div className="mt-1 text-[9px] text-gray-400 flex justify-between">
                                    <span className="text-blue-300 font-bold">{activeStopInfo.label.split(' ')[0]} {activeStopInfo.label.split(' ')[1]}</span>
                                    <span>{activeStopInfo.min}-{activeStopInfo.max} мм</span>
                                </div>
                            </div>

                             <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col">
                                    <ModalInputField label="Зажим 1" type="number" value={settings.clampPositions[0] || ''} onChange={e => updateClamp(0, e.target.value)} />
                                    {clampErrors[0] && <span className="text-[9px] text-red-400 leading-tight mt-0.5">{clampErrors[0]}</span>}
                                </div>
                                <div className="flex flex-col">
                                    <ModalInputField label="Зажим 2" type="number" value={settings.clampPositions[1] || ''} onChange={e => updateClamp(1, e.target.value)} />
                                    {clampErrors[1] && <span className="text-[9px] text-red-400 leading-tight mt-0.5">{clampErrors[1]}</span>}
                                </div>
                                <div className="flex flex-col">
                                    <ModalInputField label="Зажим 3" type="number" value={settings.clampPositions[2] || ''} onChange={e => updateClamp(2, e.target.value)} />
                                    {clampErrors[2] && <span className="text-[9px] text-red-400 leading-tight mt-0.5">{clampErrors[2]}</span>}
                                </div>
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
                    <div className="space-y-4">
                        <fieldset className="border border-gray-600 p-2 rounded bg-gray-800/50">
                            <legend className="text-xs font-bold text-blue-400 px-1">Стратегия выбора</legend>
                            <div className="space-y-1 text-[10px]">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="strategy" 
                                        checked={settings.utilizationStrategy === SheetUtilizationStrategy.FirstOnly} 
                                        onChange={() => updateSettings({utilizationStrategy: SheetUtilizationStrategy.FirstOnly})}
                                        className="text-blue-500 form-radio h-3 w-3"
                                    />
                                    <span>Только первый из списка</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="strategy" 
                                        checked={settings.utilizationStrategy === SheetUtilizationStrategy.ListedOrder} 
                                        onChange={() => updateSettings({utilizationStrategy: SheetUtilizationStrategy.ListedOrder})}
                                        className="text-blue-500 form-radio h-3 w-3"
                                    />
                                    <span>По очереди (начиная с первого)</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="strategy" 
                                        checked={settings.utilizationStrategy === SheetUtilizationStrategy.SelectedOnly} 
                                        onChange={() => updateSettings({utilizationStrategy: SheetUtilizationStrategy.SelectedOnly})}
                                        className="text-blue-500 form-radio h-3 w-3"
                                    />
                                    <span>Только выбранные (галочка)</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="strategy" 
                                        checked={settings.utilizationStrategy === SheetUtilizationStrategy.SmallestFirst} 
                                        onChange={() => updateSettings({utilizationStrategy: SheetUtilizationStrategy.SmallestFirst})}
                                        className="text-blue-500 form-radio h-3 w-3"
                                    />
                                    <span>Сначала наименьшие (по площади)</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer mt-1">
                                    <input 
                                        type="radio" 
                                        name="strategy" 
                                        checked={settings.utilizationStrategy === SheetUtilizationStrategy.AutoCalculation} 
                                        onChange={() => updateSettings({utilizationStrategy: SheetUtilizationStrategy.AutoCalculation})}
                                        className="text-green-500 form-radio h-3 w-3"
                                    />
                                    <span className="font-bold text-green-400">Авто-расчет длины</span>
                                </label>
                                <div className="pl-5 text-gray-500 italic">
                                    Макс. рекоменд. 2560мм. Шаг ~100мм.
                                </div>
                            </div>
                        </fieldset>

                        <div className="bg-gray-800 p-2 rounded border border-gray-600">
                            <h4 className="text-xs font-bold text-gray-400 mb-2">Параметры материала (для всех)</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <ModalInputField 
                                    label="Материал" 
                                    value={settings.defaultMaterial || 'Zink'} 
                                    onChange={e => updateGlobalMaterial(e.target.value)} 
                                />
                                <ModalInputField 
                                    label="Толщина" 
                                    type="number"
                                    value={settings.defaultThickness || 1.0} 
                                    onChange={e => updateGlobalThickness(parseFloat(e.target.value) || 0)} 
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-gray-400">Список Листов</span>
                                <button onClick={addSheet} className="text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white flex items-center gap-1">
                                    <PlusIcon className="w-3 h-3"/> Добавить
                                </button>
                            </div>
                            
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {settings.availableSheets.map((sheet, idx) => (
                                    <div key={sheet.id} className={`p-2 rounded border text-xs ${settings.activeSheetId === sheet.id ? 'bg-blue-900/20 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                                        
                                        <div className="flex items-center gap-2 mb-1">
                                            <input 
                                                type="checkbox" 
                                                checked={sheet.useInNesting} 
                                                onChange={e => updateSheet(sheet.id, 'useInNesting', e.target.checked)} 
                                                className="form-checkbox h-3 w-3 text-blue-500 flex-shrink-0"
                                                title="Использовать"
                                            />
                                            <span className="font-mono text-gray-400 truncate flex-1" title={sheet.id}>#{idx+1}</span>
                                            <div className="flex space-x-1">
                                                <button onClick={() => moveSheet(idx, 'up')} className="text-gray-400 hover:text-white" disabled={idx === 0}>▲</button>
                                                <button onClick={() => moveSheet(idx, 'down')} className="text-gray-400 hover:text-white" disabled={idx === settings.availableSheets.length - 1}>▼</button>
                                            </div>
                                            <button onClick={() => removeSheet(sheet.id)} className="text-red-500 hover:bg-gray-700 p-0.5 rounded"><TrashIcon className="w-3 h-3"/></button>
                                        </div>
                                        
                                        <div className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 items-end">
                                            <div>
                                                <label className="block text-[9px] text-gray-500 mb-0.5">Ширина</label>
                                                <input 
                                                    type="number" 
                                                    value={sheet.width} 
                                                    onChange={e => updateSheet(sheet.id, 'width', parseFloat(e.target.value)||0)} 
                                                    className="w-full bg-gray-900 border border-gray-600 px-1 py-0.5 rounded text-white" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] text-gray-500 mb-0.5">Высота</label>
                                                <input 
                                                    type="number" 
                                                    value={sheet.height} 
                                                    onChange={e => updateSheet(sheet.id, 'height', parseFloat(e.target.value)||0)} 
                                                    className="w-full bg-gray-900 border border-gray-600 px-1 py-0.5 rounded text-white" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] text-gray-500 mb-0.5">Кол-во</label>
                                                <input 
                                                    type="number" 
                                                    value={sheet.quantity} 
                                                    onChange={e => updateSheet(sheet.id, 'quantity', parseFloat(e.target.value)||0)} 
                                                    className="w-full bg-gray-900 border border-gray-600 px-1 py-0.5 rounded text-white" 
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-2 pt-1 border-t border-gray-700 mt-2 cursor-pointer" onClick={() => updateSettings({activeSheetId: sheet.id})}>
                                            <div className={`w-2 h-2 rounded-full ${settings.activeSheetId === sheet.id ? 'bg-blue-500' : 'bg-gray-600'}`}></div>
                                            <span className={`text-[9px] ${settings.activeSheetId === sheet.id ? 'text-blue-400 font-bold' : 'text-gray-500'}`}>
                                                {settings.activeSheetId === sheet.id ? 'Редактируется' : 'Выбрать для редакт.'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {settings.availableSheets.length === 0 && <p className="text-gray-500 text-center text-xs">Нет листов</p>}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
