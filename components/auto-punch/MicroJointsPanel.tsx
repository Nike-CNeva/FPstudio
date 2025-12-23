
import React, { ChangeEvent } from 'react';
import { AutoPunchSettings } from '../../types';
import { ModalInputField } from '../common/InputField';

interface MicroJointsPanelProps {
    enabled: boolean;
    type: AutoPunchSettings['microJointType'];
    length: number;
    onUpdate: (updates: Partial<AutoPunchSettings>) => void;
}

export const MicroJointsPanel: React.FC<MicroJointsPanelProps> = ({
    enabled,
    type,
    length,
    onUpdate
}): React.JSX.Element => {

    const handleEnabledChange = (e: ChangeEvent<HTMLInputElement>) => {
        onUpdate({ microJointsEnabled: e.target.checked });
    };

    const handleTypeChange = (newType: AutoPunchSettings['microJointType']) => {
        onUpdate({ microJointType: newType });
    };

    const handleLengthChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        onUpdate({ microJointLength: isNaN(val) ? 0 : val });
    };

    return (
        <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
            <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Перемычки (Micro-joints)</legend>
            
            <div className="mb-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={enabled} 
                        onChange={handleEnabledChange} 
                        className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-500" 
                    />
                    <span className="font-bold text-sm text-white">Включить угловые/концевые перемычки</span>
                </label>
            </div>

            <div className={`grid grid-cols-2 gap-6 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="space-y-2">
                    <span className="text-xs text-gray-400 block mb-1">Ориентация</span>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                            type="radio" 
                            checked={type === 'auto'} 
                            onChange={() => handleTypeChange('auto')} 
                            className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                        />
                        <span className="text-sm text-gray-300">Авто-подбор (4 угла)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                            type="radio" 
                            checked={type === 'vertical'} 
                            onChange={() => handleTypeChange('vertical')} 
                            className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                        />
                        <span className="text-sm text-gray-300">Только вертикальные</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                            type="radio" 
                            checked={type === 'horizontal'} 
                            onChange={() => handleTypeChange('horizontal')} 
                            className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-500" 
                        />
                        <span className="text-sm text-gray-300">Только горизонтальные</span>
                    </label>
                </div>
                <div className="space-y-3">
                    <ModalInputField 
                        label="Размер перемычки (мм)" 
                        type="number" 
                        value={length} 
                        onChange={handleLengthChange} 
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                        Отступ от вершин (углов) с обеих сторон.
                    </p>
                </div>
            </div>
        </fieldset>
    );
};
