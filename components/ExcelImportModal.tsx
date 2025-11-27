
import React, { useState, useRef } from 'react';
import { FileExcelIcon, DownloadIcon } from './Icons';

interface ExcelImportModalProps {
    onClose: () => void;
    onProcess: (file: File) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ onClose, onProcess }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
        }
    };

    const handleProcess = () => {
        if (selectedFile) {
            onProcess(selectedFile);
        }
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col border border-gray-700">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <FileExcelIcon className="w-5 h-5 mr-2 text-green-500"/>
                        Пакетная генерация из Excel
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-6">
                    
                    {/* Instructions */}
                    <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600">
                        <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase">Требования к структуре файла</h3>
                        <p className="text-xs text-gray-400 mb-3">
                            Загрузите файл <code>.xlsx</code> или <code>.csv</code> со следующими столбцами в первой строке (заголовки):
                        </p>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-gray-800 text-gray-400">
                                    <tr>
                                        <th className="p-2 border border-gray-600">Script</th>
                                        <th className="p-2 border border-gray-600">Name</th>
                                        <th className="p-2 border border-gray-600">Width</th>
                                        <th className="p-2 border border-gray-600">Height</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    <tr>
                                        <td className="p-2 border border-gray-600">Имя скрипта в библиотеке (напр. "Box 1")</td>
                                        <td className="p-2 border border-gray-600">Название новой детали</td>
                                        <td className="p-2 border border-gray-600">Ширина детали (X)</td>
                                        <td className="p-2 border border-gray-600">Высота детали (Y)</td>
                                    </tr>
                                    <tr className="bg-gray-800/30">
                                        <td className="p-2 border border-gray-600 font-mono text-gray-500">Box Template</td>
                                        <td className="p-2 border border-gray-600 font-mono text-gray-500">Order_123_Box</td>
                                        <td className="p-2 border border-gray-600 font-mono text-gray-500">500</td>
                                        <td className="p-2 border border-gray-600 font-mono text-gray-500">300</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2">
                            * Названия колонок должны совпадать (регистр не важен). Числовые значения должны быть без единиц измерения.
                        </p>
                    </div>

                    {/* Upload Area */}
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-8 hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept=".xlsx,.xls,.csv" 
                            className="hidden" 
                        />
                        <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mb-3">
                            <DownloadIcon className="w-6 h-6 text-gray-400 rotate-180" /> 
                        </div>
                        {selectedFile ? (
                            <div className="text-center">
                                <p className="font-bold text-green-400">{selectedFile.name}</p>
                                <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-sm font-medium text-gray-300">Нажмите для выбора файла</p>
                                <p className="text-xs text-gray-500">или перетащите его сюда</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm text-white">Отмена</button>
                    <button 
                        onClick={handleProcess} 
                        disabled={!selectedFile}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-md flex items-center space-x-2 text-sm font-bold text-white shadow-lg transition-colors"
                    >
                        <FileExcelIcon className="w-4 h-4"/>
                        <span>Обработать файл</span>
                    </button>
                </div>
            </div>
        </div>
    );
};