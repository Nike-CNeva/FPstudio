
import React, { useState } from 'react';
import { Part } from '../types';
import { SaveIcon } from './Icons';
import { ModalInputField } from './common/InputField';

interface PartPropertiesModalProps {
    part: Part;
    onClose: () => void;
    onSave: (updatedPart: Part) => void;
}

export const PartPropertiesModal: React.FC<PartPropertiesModalProps> = ({ part, onClose, onSave }) => {
    const [general, setGeneral] = useState({ name: part.name, customer: part.customer || '', workOrder: part.workOrder || '' });

    const handleSave = () => {
        onSave({
            ...part,
            name: general.name,
            customer: general.customer,
            workOrder: general.workOrder,
            // material remains unchanged from original part, but hidden from edit
            nesting: part.nesting
        });
        onClose();
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold">Свойства детали</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
                    
                    {/* General Info */}
                    <div className="grid grid-cols-3 gap-4">
                        <ModalInputField label="Имя детали" value={general.name} onChange={e => setGeneral(p => ({...p, name: e.target.value}))} />
                        <ModalInputField label="Заказчик" value={general.customer} onChange={e => setGeneral(p => ({...p, customer: e.target.value}))} />
                        <ModalInputField label="Заказ (Work Order)" value={general.workOrder} onChange={e => setGeneral(p => ({...p, workOrder: e.target.value}))} />
                    </div>

                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Отмена</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2">
                        <SaveIcon className="w-5 h-5"/>
                        <span>Применить</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
