
import React from 'react';
import { Part } from '../../types';
import { XIcon } from '../Icons';
import { InputField } from '../common/InputField';
import { usePartProperties } from '../../hooks/sidebar/usePartProperties';

interface PartPropertiesFormProps {
    part: Part;
    onUpdate: (updates: Partial<Part>) => void;
    onClosePart: () => void;
}

export const PartPropertiesForm: React.FC<PartPropertiesFormProps> = ({ part, onUpdate, onClosePart }) => {
    const { profileType, orientation, dims, handleDimChange, getLabel } = usePartProperties(part, onUpdate);

    return (
        <div className="space-y-4">
             <div className="flex justify-end">
                 <button type="button" onClick={onClosePart} className="relative z-10 text-xs flex items-center space-x-1 text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-900 bg-red-900/20 cursor-pointer">
                     <XIcon className="w-3 h-3"/> <span>Закрыть / Сброс</span>
                 </button>
             </div>

             <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                <legend className="px-2 font-semibold text-gray-300 text-sm">Основная информация</legend>
                <div className="space-y-3">
                     <InputField label="Название детали" value={part.name} onChange={e => onUpdate({ name: e.target.value })} />
                     
                     <div>
                        <label className="block text-xs text-gray-400 mb-1">Тип профиля (Авто)</label>
                        <div className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-300 cursor-not-allowed opacity-90 flex justify-between">
                            <span>
                                {profileType === 'flat' ? 'Плоская (Лист)' : profileType === 'L' ? 'Г-образная (L)' : 'П-образная (U)'}
                            </span>
                            <span className="text-xs text-gray-500 uppercase">{orientation}</span>
                        </div>
                     </div>

                     {profileType === 'flat' && (
                        <div className="grid grid-cols-2 gap-2">
                            <InputField label="Ширина (X)" type="number" value={part.faceWidth} onChange={e => onUpdate({ faceWidth: parseFloat(e.target.value) || 0 })} />
                            <InputField label="Высота (Y)" type="number" value={part.faceHeight} onChange={e => onUpdate({ faceHeight: parseFloat(e.target.value) || 0 })} />
                        </div>
                     )}

                     {(profileType === 'L' || profileType === 'U') && (
                        <div className="space-y-2 bg-gray-700/30 p-2 rounded border border-dashed border-gray-600">
                            <div className={`grid ${profileType === 'U' ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                                <InputField label={getLabel('a')} type="number" value={dims.a} onChange={e => handleDimChange('a', parseFloat(e.target.value)||0)} />
                                <InputField label={getLabel('b')} type="number" value={dims.b} onChange={e => handleDimChange('b', parseFloat(e.target.value)||0)} />
                                {profileType === 'U' && <InputField label={getLabel('c')} type="number" value={dims.c} onChange={e => handleDimChange('c', parseFloat(e.target.value)||0)} />}
                            </div>
                            <div className="text-[10px] text-gray-400 text-right">
                                Развертка {orientation === 'vertical' ? 'X' : 'Y'}: {(dims.a + dims.b + (profileType === 'U' ? dims.c : 0)).toFixed(2)} мм
                            </div>
                            {orientation === 'vertical' ? (
                                <InputField label="Высота (Y)" type="number" value={part.faceHeight} onChange={e => onUpdate({ faceHeight: parseFloat(e.target.value) || 0 })} />
                            ) : (
                                <InputField label="Ширина (X)" type="number" value={part.faceWidth} onChange={e => onUpdate({ faceWidth: parseFloat(e.target.value) || 0 })} />
                            )}
                        </div>
                     )}
                </div>
             </fieldset>
        </div>
    );
};
