
/**
 * ОТВЕТСТВЕННОСТЬ: Боковая панель навигации по библиотеке скриптов.
 */
import React from 'react';
import { ParametricScript } from '../../types';
import { CodeIcon, FileExcelIcon } from '../Icons';
import { ScriptCard } from './ScriptCard';

interface ScriptListProps {
    scripts: ParametricScript[];
    selectedScriptId: string | null;
    onSelect: (id: string) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onExcelImportClick: () => void;
}

export const ScriptList: React.FC<ScriptListProps> = ({ 
    scripts, selectedScriptId, onSelect, searchQuery, onSearchChange, onExcelImportClick 
}) => (
    <div className="w-1/3 min-w-[300px] flex flex-col border-r border-gray-700 bg-gray-900/30">
        <div className="p-4 border-b border-gray-700 bg-gray-800">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-white flex items-center">
                    <CodeIcon className="w-5 h-5 mr-2 text-purple-400" />
                    Библиотека
                </h2>
                <button 
                    onClick={onExcelImportClick} 
                    className="bg-green-600 hover:bg-green-500 text-white p-2 rounded shadow text-xs flex items-center space-x-1"
                    title="Импорт из Excel"
                >
                    <FileExcelIcon className="w-4 h-4" />
                    <span>Импорт</span>
                </button>
            </div>
            <input 
                type="text" 
                placeholder="Поиск..." 
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
        </div>
        <div className="flex-1 overflow-y-auto">
            <div className="divide-y divide-gray-700">
                {scripts.map(script => (
                    <ScriptCard 
                        key={script.id} 
                        script={script} 
                        isSelected={selectedScriptId === script.id} 
                        onClick={() => onSelect(script.id)}
                    />
                ))}
                {scripts.length === 0 && (
                    <div className="p-8 text-center text-gray-500 text-sm italic">
                        Скрипты не найдены
                    </div>
                )}
            </div>
        </div>
    </div>
);
