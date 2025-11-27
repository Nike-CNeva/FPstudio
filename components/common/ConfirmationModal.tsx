import React from 'react';
import { ConfirmationState } from '../../hooks/useConfirmation';

interface ConfirmationModalProps {
    state: ConfirmationState;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ state, onCancel }) => {
    if (!state.isOpen) return null;
    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-96 flex flex-col p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-2">{state.title}</h3>
                <p className="text-gray-300 text-sm mb-6">{state.message}</p>
                <div className="flex justify-end space-x-3">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white text-sm">Отмена</button>
                    <button onClick={state.onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md text-white text-sm font-bold">Да, выполнить</button>
                </div>
            </div>
        </div>
    );
};