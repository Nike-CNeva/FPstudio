
/**
 * ОТВЕТСТВЕННОСТЬ: Интерфейс для выбора, создания и удаления наборов инструментов (Layouts).
 */
import React from 'react';
import { TurretLayout } from '../../types';
import { SettingsIcon, SaveIcon, TrashIcon } from '../Icons';

interface TurretLayoutManagerProps {
    layouts: TurretLayout[];
    activeLayoutId: string;
    onLoad: (id: string) => void;
    onDelete: (id: string) => void;
    newName: string;
    setNewName: (n: string) => void;
    onSave: () => void;
}

export const TurretLayoutManager: React.FC<TurretLayoutManagerProps> = (props) => (
    <div className="p-4 border-b border-gray-700 bg-gray-900">
        <h2 className="text-lg font-bold text-blue-400 mb-2 flex items-center">
            <SettingsIcon className="w-5 h-5 mr-2"/> Настройка Револьвера
        </h2>
        <div className="space-y-2">
            <div>
                 <label className="text-xs text-gray-400 block mb-1">Текущая конфигурация</label>
                 <div className="flex space-x-2">
                    <select 
                        value={props.activeLayoutId} 
                        onChange={(e) => props.onLoad(e.target.value)} 
                        className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
                    >
                        {props.layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <button onClick={() => props.onDelete(props.activeLayoutId)} className="bg-red-800 hover:bg-red-700 p-1 rounded text-white">
                        <TrashIcon className="w-4 h-4"/>
                    </button>
                 </div>
            </div>
            <div className="flex space-x-2 pt-2 border-t border-gray-700">
                 <input 
                    type="text" 
                    placeholder="Новое имя..." 
                    value={props.newName}
                    onChange={e => props.setNewName(e.target.value)}
                    className="flex-1 bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 text-sm"
                />
                <button onClick={props.onSave} className="bg-green-600 hover:bg-green-500 p-1 rounded text-white">
                    <SaveIcon className="w-4 h-4"/>
                </button>
            </div>
        </div>
    </div>
);
