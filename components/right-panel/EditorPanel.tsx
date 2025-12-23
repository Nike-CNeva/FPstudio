
/**
 * ОТВЕТСТВЕННОСТЬ: Отображение и поиск инструментов в библиотеке.
 */
import React, { useState } from 'react';
import { Tool, ToolShape } from '../../types';
import { ToolPreview } from '../common/ToolDisplay';
import { LayersIcon, SettingsIcon } from '../Icons';

interface EditorPanelProps {
    tools: Tool[];
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    onOpenTurretView: () => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({ 
    tools, selectedToolId, setSelectedToolId, onOpenTurretView 
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredTools = tools.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-300 uppercase flex items-center">
                    <LayersIcon className="w-4 h-4 mr-2"/>
                    Инструменты
                </h3>
                <button onClick={onOpenTurretView} className="text-gray-400 hover:text-white" title="Настройка револьвера">
                    <SettingsIcon className="w-4 h-4"/>
                </button>
            </div>
            
            <div className="p-2 border-b border-gray-700">
                <input 
                    type="text" 
                    placeholder="Поиск..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                />
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {filteredTools.map(t => (
                    <div 
                        key={t.id} 
                        className={`p-2 rounded-md flex items-center space-x-3 cursor-pointer transition-all border ${selectedToolId === t.id ? 'bg-blue-600 border-blue-400 ring-1 ring-blue-300' : 'bg-gray-800 border-gray-600 hover:bg-gray-600'}`} 
                        onClick={() => setSelectedToolId(selectedToolId === t.id ? null : t.id)}
                    >
                        <div className="w-10 h-10 flex items-center justify-center scale-75 flex-shrink-0 bg-white rounded shadow-sm">
                            <ToolPreview tool={t}/>
                        </div>
                        <div className="overflow-hidden">
                            <span className="truncate block font-medium text-sm text-gray-200">{t.name}</span>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                                <span>{t.shape === ToolShape.Circle ? `Ø${t.width}` : `${t.width}x${t.height}`}</span>
                                <span className={`px-1 rounded ${t.stationNumber ? 'bg-green-900 text-green-300' : 'bg-gray-700'}`}>
                                    {t.stationNumber ? `ST:${t.stationNumber}` : 'Lib'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
                {filteredTools.length === 0 && <p className="text-center text-xs text-gray-500 mt-4">Не найдено</p>}
            </div>
        </div>
    );
};
