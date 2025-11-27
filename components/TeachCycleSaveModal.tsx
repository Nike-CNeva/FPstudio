
import React, { useState } from 'react';
import { CycleSymmetry } from '../types';
import { SaveIcon } from './Icons';
import { ModalInputField } from './common/InputField';

interface TeachCycleSaveModalProps {
    onClose: () => void;
    onSave: (name: string, symmetry: CycleSymmetry) => void;
}

export const TeachCycleSaveModal: React.FC<TeachCycleSaveModalProps> = ({ onClose, onSave }) => {
    const [name, setName] = useState('Новый цикл');
    const [symmetry, setSymmetry] = useState<CycleSymmetry>('none');

    const handleSave = () => {
        if (!name.trim()) return;
        onSave(name, symmetry);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-96 flex flex-col border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white">Сохранить цикл</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-4">
                    <ModalInputField 
                        label="Название цикла" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        placeholder="Например: Угловая высечка"
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Симметрия</label>
                        <div className="space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={symmetry === 'none'} onChange={() => setSymmetry('none')} className="form-radio text-blue-600" />
                                <span className="text-gray-300 text-sm">Нет</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={symmetry === 'horizontal'} onChange={() => setSymmetry('horizontal')} className="form-radio text-blue-600" />
                                <span className="text-gray-300 text-sm">Горизонтальная (Mirror Y)</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={symmetry === 'vertical'} onChange={() => setSymmetry('vertical')} className="form-radio text-blue-600" />
                                <span className="text-gray-300 text-sm">Вертикальная (Mirror X)</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-700">
                                <input type="radio" checked={symmetry === 'full'} onChange={() => setSymmetry('full')} className="form-radio text-blue-600" />
                                <span className="text-gray-300 text-sm">Полная (Все 4 угла)</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm text-white">Отмена</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md flex items-center space-x-2 text-sm font-bold text-white shadow-lg">
                        <SaveIcon className="w-4 h-4"/>
                        <span>Сохранить</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
