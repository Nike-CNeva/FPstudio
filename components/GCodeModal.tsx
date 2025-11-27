import React from 'react';
import { DownloadIcon } from './Icons';

export const GCodeModal: React.FC<{
    gcode: string;
    onClose: () => void;
    onDownload: () => void;
}> = ({ gcode, onClose, onDownload }) => (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg shadow-xl w-1/2 h-3/4 flex flex-col p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Сгенерированный G-Code</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            <textarea readOnly value={gcode} className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-2 rounded-md resize-none w-full"/>
            <div className="mt-4 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Закрыть</button>
                <button onClick={onDownload} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2">
                    <DownloadIcon className="w-5 h-5"/>
                    <span>Скачать .nc файл</span>
                </button>
            </div>
        </div>
    </div>
);
