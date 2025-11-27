

import React, { useState, useEffect } from 'react';
import { Part, NestLayout, ScheduledPart, NestingConstraints, SheetStock } from '../types';
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

const GlobalParametersTab: React.FC<{ settings: NestLayout['settings'], setSettings: React.Dispatch<React.SetStateAction<NestLayout['settings']>> }> = ({ settings, setSettings }) => {
    
    const updateMargin = (field: keyof NestLayout['settings'], value: number) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const updateClamp = (index: number, value: string) => {
        const newClamps = [...settings.clampPositions];
        newClamps[index] = parseFloat(value) || 0;
        setSettings(prev => ({...prev, clampPositions: newClamps}));
    }

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
                    <legend className="px-2 font-semibold text-gray-300">Информация о прижимах</legend>
                    <div className="grid grid-cols-3 gap-2">
                        <ModalInputField label="Позиция 1" type="number" value={settings.clampPositions[0] || ''} onChange={e => updateClamp(0, e.target.value)} />
                        <ModalInputField label="Позиция 2" type="number" value={settings.clampPositions[1] || ''} onChange={e => updateClamp(1, e.target.value)} />
                        <ModalInputField label="Позиция 3" type="number" value={settings.clampPositions[2] || ''} onChange={e => updateClamp(2, e.target.value)} />
                    </div>
                     <label className="flex items-center space-x-2 mt-3 cursor-pointer">
                        <input type="checkbox" checked={settings.nestUnderClamps} onChange={e => setSettings(s => ({...s, nestUnderClamps: e.target.checked}))} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                        <span>Раскладывать под прижимами</span>
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

const MaterialSheetTab: React.FC<{ settings: NestLayout['settings'], setSettings: React.Dispatch<React.SetStateAction<NestLayout['settings']>> }> = ({ settings, setSettings }) => {
    
    const addSheet = () => {
        const newSheet: SheetStock = {
            id: generateId(),
            width: 2500,
            height: 1250,
            thickness: 1.0,
            material: 'St-3',
            quantity: 10
        };
        setSettings(prev => ({
            ...prev,
            availableSheets: [...prev.availableSheets, newSheet]
        }));
    };

    const removeSheet = (id: string) => {
        setSettings(prev => {
            const newSheets = prev.availableSheets.filter(s => s.id !== id);
            // If active was removed, set to first available or null
            const newActiveId = prev.activeSheetId === id ? (newSheets[0]?.id || null) : prev.activeSheetId;
            return { ...prev, availableSheets: newSheets, activeSheetId: newActiveId };
        });
    };

    const updateSheet = (id: string, field: keyof SheetStock, value: any) => {
        setSettings(prev => ({
            ...prev,
            availableSheets: prev.availableSheets.map(s => s.id === id ? { ...s, [field]: value } : s)
        }));
    };

    const setActive = (id: string) => {
        setSettings(prev => ({ ...prev, activeSheetId: id }));
    };

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center mb-2">
                 <h3 className="font-semibold text-gray-300">Список доступных листов</h3>
                 <button onClick={addSheet} className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white flex items-center space-x-1">
                     <PlusIcon className="w-4 h-4" /> <span>Добавить размер</span>
                 </button>
             </div>
             
             <div className="bg-gray-900/50 rounded-md border border-gray-700 overflow-hidden">
                 <table className="w-full text-left text-sm">
                     <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                         <tr>
                             <th className="p-3 text-center">Активен</th>
                             <th className="p-3">Ширина</th>
                             <th className="p-3">Высота</th>
                             <th className="p-3">Материал</th>
                             <th className="p-3">Толщина</th>
                             <th className="p-3">Кол-во</th>
                             <th className="p-3 w-10"></th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-700">
                         {settings.availableSheets.map(sheet => (
                             <tr key={sheet.id} className={settings.activeSheetId === sheet.id ? 'bg-blue-900/20' : ''}>
                                 <td className="p-2 text-center">
                                     <input 
                                        type="radio" 
                                        name="active_sheet" 
                                        checked={settings.activeSheetId === sheet.id} 
                                        onChange={() => setActive(sheet.id)}
                                        className="form-radio h-4 w-4 text-blue-500"
                                     />
                                 </td>
                                 <td className="p-2">
                                     <input type="number" value={sheet.width} onChange={e => updateSheet(sheet.id, 'width', parseFloat(e.target.value)||0)} className="w-20 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs" />
                                 </td>
                                 <td className="p-2">
                                     <input type="number" value={sheet.height} onChange={e => updateSheet(sheet.id, 'height', parseFloat(e.target.value)||0)} className="w-20 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs" />
                                 </td>
                                 <td className="p-2">
                                     <input type="text" value={sheet.material} onChange={e => updateSheet(sheet.id, 'material', e.target.value)} className="w-20 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs" />
                                 </td>
                                 <td className="p-2">
                                     <input type="number" value={sheet.thickness} onChange={e => updateSheet(sheet.id, 'thickness', parseFloat(e.target.value)||0)} className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs" />
                                 </td>
                                 <td className="p-2">
                                     <input type="number" value={sheet.quantity} onChange={e => updateSheet(sheet.id, 'quantity', parseFloat(e.target.value)||0)} className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs" />
                                 </td>
                                 <td className="p-2 text-center">
                                     <button onClick={() => removeSheet(sheet.id)} className="text-gray-500 hover:text-red-500">
                                         <TrashIcon className="w-4 h-4" />
                                     </button>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
                 {settings.availableSheets.length === 0 && <div className="p-4 text-center text-gray-500">Список пуст</div>}
             </div>
        </div>
    );
};


export const NestingParametersModal: React.FC<NestingParametersModalProps> = ({ onClose, onSave, activeNest, allParts }) => {
    const [activeTab, setActiveTab] = useState<'global' | 'parts' | 'sheet'>('global');
    const [settings, setSettings] = useState<NestLayout['settings']>(() => JSON.parse(JSON.stringify(activeNest.settings)));
    const [scheduledParts, setScheduledParts] = useState<ScheduledPart[]>(() => JSON.parse(JSON.stringify(activeNest.scheduledParts)));

    const handleSave = () => {
        onSave(settings, scheduledParts);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold">Параметры Раскроя</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                </div>
                
                <div className="flex border-b border-gray-700 px-4">
                    <SidebarTabButton label="Глобальные параметры" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
                    <SidebarTabButton label="Список Деталей" active={activeTab === 'parts'} onClick={() => setActiveTab('parts')} />
                    <SidebarTabButton label="Материал" active={activeTab === 'sheet'} onClick={() => setActiveTab('sheet')} />
                </div>

                <div className="p-6 overflow-y-auto">
                    {activeTab === 'global' && <GlobalParametersTab settings={settings} setSettings={setSettings} />}
                    {activeTab === 'parts' && <PartListTab allParts={allParts} scheduledParts={scheduledParts} setScheduledParts={setScheduledParts} />}
                    {activeTab === 'sheet' && <MaterialSheetTab settings={settings} setSettings={setSettings} />}
                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg mt-auto">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Отмена</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2">
                        <SaveIcon className="w-5 h-5"/>
                        <span>OK</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
