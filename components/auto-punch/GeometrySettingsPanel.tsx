
import React, { ChangeEvent } from 'react';
import { AutoPunchSettings } from '../../types';
import { ModalInputField } from '../common/InputField';

interface GeometrySettingsPanelProps {
    overlap: number;
    extension: number;
    scallopHeight: number;
    vertexTolerance: number;
    onUpdate: (updates: Partial<AutoPunchSettings>) => void;
}

export const GeometrySettingsPanel: React.FC<GeometrySettingsPanelProps> = ({
    overlap,
    extension,
    scallopHeight,
    vertexTolerance,
    onUpdate
}): React.JSX.Element => {

    const handleNumberChange = (field: keyof AutoPunchSettings) => (e: ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        onUpdate({ [field]: isNaN(val) ? 0 : val });
    };

    return (
        <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
            <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Геометрические параметры</legend>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-700 pb-1">Линии (Прямоугольники)</h4>
                    <ModalInputField 
                        label="Нахлест (мм)" 
                        type="number" 
                        value={overlap} 
                        onChange={handleNumberChange('overlap')} 
                        placeholder="0.7"
                    />
                    <ModalInputField 
                        label="Удлинение концов (мм)" 
                        type="number" 
                        value={extension} 
                        onChange={handleNumberChange('extension')} 
                        placeholder="1.0"
                    />
                </div>
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-700 pb-1">Дуги (Круги)</h4>
                    <ModalInputField 
                        label="Высота гребешка (Scallop) (мм)" 
                        type="number" 
                        value={scallopHeight} 
                        onChange={handleNumberChange('scallopHeight')} 
                        placeholder="0.25"
                    />
                    <ModalInputField 
                        label="Допуск вершин (мм)" 
                        type="number" 
                        value={vertexTolerance} 
                        onChange={handleNumberChange('vertexTolerance')} 
                    />
                </div>
            </div>
        </fieldset>
    );
};
