import React from 'react';
import { DownloadIcon, FileExcelIcon } from './Icons';
import { generatePdfReport } from '../services/reportGenerator';
import { NestResultSheet, Part, Tool, ScheduledPart } from '../types';

export const GCodeModal: React.FC<{
    gcode: string;
    onClose: () => void;
    onDownload: () => void;
    // New Props for Report
    sheet?: NestResultSheet;
    parts?: Part[];
    tools?: Tool[];
    clampPositions?: number[];
    scheduledParts?: ScheduledPart[];
    nestName?: string;
    allSheets?: NestResultSheet[];
}> = ({ gcode, onClose, onDownload, sheet, parts, tools, clampPositions, scheduledParts, nestName, allSheets }) => {

    const handleDownloadReport = () => {
        if (sheet && parts && tools) {
            // Pass the raw nestName (which now acts as the full path) directly to the generator
            // The generator will handle file system sanitization for the .save() call, 
            // but use this string as-is for the PDF header.
            const displayName = nestName || 'Program';
            
            generatePdfReport(
                sheet,
                parts,
                tools,
                displayName,
                clampPositions || [],
                scheduledParts || [],
                allSheets || []
            );
        }
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-3/4 max-w-4xl h-3/4 flex flex-col p-4 border border-gray-700">
                <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
                    <h2 className="text-xl font-bold text-white">Результат генерации</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                </div>
                
                <div className="flex-1 flex flex-col space-y-2">
                    <label className="text-xs text-gray-400 font-bold uppercase">Предпросмотр G-Code</label>
                    <textarea 
                        readOnly 
                        value={gcode} 
                        className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-md resize-none w-full border border-gray-600 focus:outline-none focus:border-blue-500"
                    />
                </div>

                <div className="mt-6 flex justify-end space-x-4 pt-4 border-t border-gray-600">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white font-medium transition-colors">
                        Закрыть
                    </button>
                    
                    {sheet && (
                        <button 
                            onClick={handleDownloadReport} 
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-md flex items-center space-x-2 text-white font-bold shadow-lg transition-colors"
                        >
                            <FileExcelIcon className="w-5 h-5"/>
                            <span>Скачать Отчет (PDF)</span>
                        </button>
                    )}

                    <button 
                        onClick={onDownload} 
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2 text-white font-bold shadow-lg transition-colors"
                    >
                        <DownloadIcon className="w-5 h-5"/>
                        <span>Скачать .nc файл</span>
                    </button>
                </div>
            </div>
        </div>
    );
};