
import React, { ChangeEvent } from 'react';
import { AutoPunchSettings } from '../../types';
import { ModalInputField } from '../common/InputField';

interface GeometrySettingsPanelProps {
    overlap: number;
    extension: number;
    scallopHeight: number;
    vertexTolerance: number;
    checkInwardGouge?: boolean;
    maxInwardGougeTolerance?: number;
    checkOverhang?: boolean;
    maxAllowedOverhang?: number;
    checkLooseSlugs?: boolean;
    minSlugWidth?: number;
    onUpdate: (updates: Partial<AutoPunchSettings>) => void;
}

export const GeometrySettingsPanel: React.FC<GeometrySettingsPanelProps> = ({
    overlap,
    extension,
    scallopHeight,
    vertexTolerance,
    checkInwardGouge = true,
    maxInwardGougeTolerance = 0.05,
    checkOverhang = true,
    maxAllowedOverhang = 20,
    checkLooseSlugs = true,
    minSlugWidth = 1.0,
    onUpdate
}): React.JSX.Element => {

    const handleNumberChange = (field: keyof AutoPunchSettings) => (e: ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        onUpdate({ [field]: isNaN(val) ? 0 : val });
    };

    const handleCheckboxChange = (field: keyof AutoPunchSettings) => (e: ChangeEvent<HTMLInputElement>) => {
        onUpdate({ [field]: e.target.checked });
    };

    return (
        <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50 space-y-4">
            <legend className="px-2 font-semibold text-blue-400 text-xs uppercase">Геометрические и технологические параметры</legend>
            
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

            {/* Контроль контура, выступов и полостей */}
            <div className="border-t border-gray-700 pt-3 space-y-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase flex items-center gap-1.5">
                    🛡 Контроль контура, выступа и полостей
                </h4>

                <div className="grid grid-cols-3 gap-3">
                    {/* 1. Заход за контур */}
                    <div className="bg-gray-900/60 p-2.5 rounded border border-gray-700 space-y-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={checkInwardGouge} 
                                onChange={handleCheckboxChange('checkInwardGouge')}
                                className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500 rounded" 
                            />
                            <span className="text-xs font-semibold text-white">Запрет зарезания</span>
                        </label>
                        <p className="text-[10px] text-gray-400">Блокирует случайный заход пуансона внутрь тела детали.</p>
                        <ModalInputField 
                            label="Допуск захода (мм)" 
                            type="number" 
                            value={maxInwardGougeTolerance} 
                            onChange={handleNumberChange('maxInwardGougeTolerance')} 
                            placeholder="0.05"
                        />
                    </div>

                    {/* 2. Выступ за наружный периметр */}
                    <div className="bg-gray-900/60 p-2.5 rounded border border-gray-700 space-y-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={checkOverhang} 
                                onChange={handleCheckboxChange('checkOverhang')}
                                className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500 rounded" 
                            />
                            <span className="text-xs font-semibold text-white">Ограничение выступа</span>
                        </label>
                        <p className="text-[10px] text-gray-400">Контролирует максимальный вылет инструмента в воздух за деталь.</p>
                        <ModalInputField 
                            label="Макс. вылет (мм)" 
                            type="number" 
                            value={maxAllowedOverhang} 
                            onChange={handleNumberChange('maxAllowedOverhang')} 
                            placeholder="20"
                        />
                    </div>

                    {/* 3. Защита от полостей и выпадающего отхода */}
                    <div className="bg-gray-900/60 p-2.5 rounded border border-gray-700 space-y-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={checkLooseSlugs} 
                                onChange={handleCheckboxChange('checkLooseSlugs')}
                                className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500 rounded" 
                            />
                            <span className="text-xs font-semibold text-white">Контроль полостей</span>
                        </label>
                        <p className="text-[10px] text-gray-400">Предотвращает возникновение тонких выпадающих кусков и заклиниваний.</p>
                        <ModalInputField 
                            label="Мин. перемычка (мм)" 
                            type="number" 
                            value={minSlugWidth} 
                            onChange={handleNumberChange('minSlugWidth')} 
                            placeholder="1.0"
                        />
                    </div>
                </div>
            </div>
        </fieldset>
    );
};
