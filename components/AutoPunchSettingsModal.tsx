
import React, { useState } from 'react';
import { AutoPunchSettings, TurretLayout } from '../types';
import { PlayIcon } from './Icons';
import { ModalInputField } from './common/InputField';

export const AutoPunchSettingsModal: React.FC<{ 
    onClose: () => void; 
    onApply: (settings: AutoPunchSettings) => void;
    turretLayouts: TurretLayout[];
}> = ({ onClose, onApply, turretLayouts }) => {
    
    const [settings, setSettings] = useState<AutoPunchSettings>({
        toolSourceType: 'library',
        turretLayoutId: turretLayouts[0]?.id || '',
        useTeachCycles: true,
        
        extension: 1.0,
        overlap: 0.7,
        scallopHeight: 0.1,
        vertexTolerance: 2.5,
        minToolUtilization: 0, // Hidden/Unused
        
        toleranceRound: 2.5,
        toleranceRectLength: 2.5,
        toleranceRectWidth: 2.5,

        microJointsEnabled: false,
        microJointType: 'all',
        microJointLength: 1.5,
        microJointDistance: 0, // Hidden/Unused
    });

    const handleApply = () => {
        onApply(settings);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col border border-gray-700 max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white">Авто-расстановка (Autotool)</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                    
                    {/* --- 1. SOURCE & GENERAL --- */}
                    <div className="grid grid-cols-2 gap-4">
                        <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                            <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Источник инструмента</legend>
                            <div className="space-y-3">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        checked={settings.toolSourceType === 'turret'} 
                                        onChange={() => setSettings(s => ({...s, toolSourceType: 'turret'}))}
                                        className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                                    />
                                    <span className="text-sm text-gray-200">Только текущий револьвер</span>
                                </label>
                                
                                <div className={`pl-6 transition-all ${settings.toolSourceType === 'turret' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                    <select 
                                        value={settings.turretLayoutId} 
                                        onChange={e => setSettings(s=>({...s, turretLayoutId: e.target.value}))} 
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-sm text-gray-300 focus:ring-1 focus:ring-blue-500"
                                    >
                                        {turretLayouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </div>

                                <label className="flex items-center space-x-2 cursor-pointer mt-2">
                                    <input 
                                        type="radio" 
                                        checked={settings.toolSourceType === 'library'} 
                                        onChange={() => setSettings(s => ({...s, toolSourceType: 'library'}))}
                                        className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                                    />
                                    <span className="text-sm text-gray-200">Вся библиотека</span>
                                </label>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                            <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Логика</legend>
                            <div className="space-y-3">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={settings.useTeachCycles} 
                                        onChange={e => setSettings(s => ({...s, useTeachCycles: e.target.checked}))} 
                                        className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                                    />
                                    <span className="text-sm text-gray-200">Использовать обучающие циклы</span>
                                </label>
                            </div>
                        </fieldset>
                    </div>

                    {/* --- 2. GEOMETRY SETTINGS --- */}
                    <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                        <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Геометрические параметры</legend>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-700 pb-1">Линии (Прямоугольники)</h4>
                                <ModalInputField 
                                    label="Нахлест (мм)" 
                                    type="number" 
                                    value={settings.overlap} 
                                    onChange={e => setSettings(s=>({...s, overlap: parseFloat(e.target.value) || 0}))} 
                                    placeholder="0.7"
                                />
                                <ModalInputField 
                                    label="Удлинение концов (мм)" 
                                    type="number" 
                                    value={settings.extension} 
                                    onChange={e => setSettings(s=>({...s, extension: parseFloat(e.target.value) || 0}))} 
                                    placeholder="1.0"
                                />
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-700 pb-1">Дуги (Круги)</h4>
                                <ModalInputField 
                                    label="Высота гребешка (Scallop) (мм)" 
                                    type="number" 
                                    value={settings.scallopHeight} 
                                    onChange={e => setSettings(s=>({...s, scallopHeight: parseFloat(e.target.value) || 0}))} 
                                    placeholder="0.25"
                                />
                                <ModalInputField 
                                    label="Допуск вершин (мм)" 
                                    type="number" 
                                    value={settings.vertexTolerance} 
                                    onChange={e => setSettings(s=>({...s, vertexTolerance: parseFloat(e.target.value) || 0}))} 
                                />
                            </div>
                        </div>
                    </fieldset>

                    {/* --- 3. MICRO-JOINTS --- */}
                    <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                        <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Перемычки (Micro-joints)</legend>
                        
                        <div className="mb-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={settings.microJointsEnabled} 
                                    onChange={e => setSettings(s=>({...s, microJointsEnabled: e.target.checked}))} 
                                    className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-500" 
                                />
                                <span className="font-bold text-sm text-white">Включить угловые/концевые перемычки</span>
                            </label>
                        </div>

                        <div className={`grid grid-cols-2 gap-6 transition-opacity ${settings.microJointsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            <div className="space-y-2">
                                <span className="text-xs text-gray-400 block mb-1">Ориентация</span>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" checked={settings.microJointType === 'all'} onChange={() => setSettings(s=>({...s, microJointType: 'all'}))} className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" />
                                    <span className="text-sm text-gray-300">Все стороны</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" checked={settings.microJointType === 'vertical'} onChange={() => setSettings(s=>({...s, microJointType: 'vertical'}))} className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" />
                                    <span className="text-sm text-gray-300">Только вертикальные</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" checked={settings.microJointType === 'horizontal'} onChange={() => setSettings(s=>({...s, microJointType: 'horizontal'}))} className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" />
                                    <span className="text-sm text-gray-300">Только горизонтальные</span>
                                </label>
                            </div>
                            <div className="space-y-3">
                                <ModalInputField 
                                    label="Размер перемычки (мм)" 
                                    type="number" 
                                    value={settings.microJointLength} 
                                    onChange={e => setSettings(s=>({...s, microJointLength: parseFloat(e.target.value) || 0}))} 
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Отступ от вершин (углов) с обеих сторон.
                                </p>
                            </div>
                        </div>
                    </fieldset>
                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm text-white">Отмена</button>
                    <button onClick={handleApply} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2 text-sm font-bold shadow-lg text-white">
                        <PlayIcon className="w-4 h-4"/>
                        <span>Выполнить расстановку</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
