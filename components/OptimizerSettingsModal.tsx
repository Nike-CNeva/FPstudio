
import React, { useState } from 'react';
import { OptimizerSettings } from '../types';
import { SaveIcon, CodeIcon, PlayIcon } from './Icons';

interface OptimizerSettingsModalProps {
    initialSettings: OptimizerSettings;
    onClose: () => void;
    onGenerate: (settings: OptimizerSettings) => void;
}

export const OptimizerSettingsModal: React.FC<OptimizerSettingsModalProps> = ({ initialSettings, onClose, onGenerate }) => {
    const [settings, setSettings] = useState<OptimizerSettings>(initialSettings);

    const handleGenerate = () => {
        onGenerate(settings);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg flex flex-col border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <CodeIcon className="w-5 h-5 mr-2 text-green-500" />
                        Параметры Оптимизатора
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Tool Sequence */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-300 mb-2 border-b border-gray-600 pb-1">Порядок Инструмента</h4>
                        <div className="space-y-2">
                            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={settings.toolSequence === 'station-order'} onChange={() => setSettings(s => ({...s, toolSequence: 'station-order'}))} className="form-radio text-blue-500" />
                                <div>
                                    <span className="block text-sm text-gray-200">По номеру станции (T1, T2...)</span>
                                    <span className="text-xs text-gray-500">Минимизирует вращение башни</span>
                                </div>
                            </label>
                            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={settings.toolSequence === 'tool-size-desc'} onChange={() => setSettings(s => ({...s, toolSequence: 'tool-size-desc'}))} className="form-radio text-blue-500" />
                                <div>
                                    <span className="block text-sm text-gray-200">По размеру (Сначала крупные)</span>
                                    <span className="text-xs text-gray-500">Уменьшает деформацию листа</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Path Optimization */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-300 mb-2 border-b border-gray-600 pb-1">Оптимизация Пути</h4>
                        <div className="space-y-2">
                            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={settings.pathOptimization === 'shortest-path'} onChange={() => setSettings(s => ({...s, pathOptimization: 'shortest-path'}))} className="form-radio text-blue-500" />
                                <span className="text-sm text-gray-200">Кратчайший путь (TSP)</span>
                            </label>
                            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={settings.pathOptimization === 'x-band'} onChange={() => setSettings(s => ({...s, pathOptimization: 'x-band'}))} className="form-radio text-blue-500" />
                                <span className="text-sm text-gray-200">Полосы по X (Змейка)</span>
                            </label>
                            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={settings.pathOptimization === 'y-band'} onChange={() => setSettings(s => ({...s, pathOptimization: 'y-band'}))} className="form-radio text-blue-500" />
                                <span className="text-sm text-gray-200">Полосы по Y (Змейка)</span>
                            </label>
                        </div>
                    </div>

                    {/* Code Options */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-300 mb-2 border-b border-gray-600 pb-1">Параметры G-кода</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" checked={settings.useG76LinearPatterns} onChange={e => setSettings(s => ({...s, useG76LinearPatterns: e.target.checked}))} className="form-checkbox text-blue-500 bg-gray-700 border-gray-500" />
                                <span className="text-xs text-gray-300">Использовать G76 (Линии)</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" checked={settings.enableCommonLineCuts} onChange={e => setSettings(s => ({...s, enableCommonLineCuts: e.target.checked}))} className="form-checkbox text-blue-500 bg-gray-700 border-gray-500" />
                                <span className="text-xs text-gray-300">Common Line Cuts</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" checked={settings.prioritizeContourTools} onChange={e => setSettings(s => ({...s, prioritizeContourTools: e.target.checked}))} className="form-checkbox text-blue-500 bg-gray-700 border-gray-500" />
                                <span className="text-xs text-gray-300">Контуры в конце</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm text-white">Отмена</button>
                    <button onClick={handleGenerate} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md flex items-center space-x-2 text-sm font-bold text-white shadow-lg">
                        <PlayIcon className="w-4 h-4"/>
                        <span>Рассчитать и Создать NC</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
