
import React, { ChangeEvent } from 'react';
import { AutoPunchSettings, TurretLayout } from '../../types';

interface ToolSourcePanelProps {
    sourceType: AutoPunchSettings['toolSourceType'];
    turretLayoutId: string;
    useTeachCycles: boolean;
    turretLayouts: TurretLayout[];
    onUpdate: (updates: Partial<AutoPunchSettings>) => void;
}

export const ToolSourcePanel: React.FC<ToolSourcePanelProps> = ({
    sourceType,
    turretLayoutId,
    useTeachCycles,
    turretLayouts,
    onUpdate
}): React.JSX.Element => {
    
    const handleSourceChange = (type: AutoPunchSettings['toolSourceType']) => {
        onUpdate({ toolSourceType: type });
    };

    const handleLayoutChange = (e: ChangeEvent<HTMLSelectElement>) => {
        onUpdate({ turretLayoutId: e.target.value });
    };

    const handleLogicChange = (e: ChangeEvent<HTMLInputElement>) => {
        onUpdate({ useTeachCycles: e.target.checked });
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Источник инструмента</legend>
                <div className="space-y-3">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                            type="radio" 
                            checked={sourceType === 'turret'} 
                            onChange={() => handleSourceChange('turret')}
                            className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                        />
                        <span className="text-sm text-gray-200">Только текущий револьвер</span>
                    </label>
                    
                    <div className={`pl-6 transition-all ${sourceType === 'turret' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <select 
                            value={turretLayoutId} 
                            onChange={handleLayoutChange} 
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-sm text-gray-300 focus:ring-1 focus:ring-blue-500"
                        >
                            {turretLayouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>

                    <label className="flex items-center space-x-2 cursor-pointer mt-2">
                        <input 
                            type="radio" 
                            checked={sourceType === 'library'} 
                            onChange={() => handleSourceChange('library')}
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
                            checked={useTeachCycles} 
                            onChange={handleLogicChange} 
                            className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                        />
                        <span className="text-sm text-gray-200">Использовать обучающие циклы</span>
                    </label>
                </div>
            </fieldset>
        </div>
    );
};
