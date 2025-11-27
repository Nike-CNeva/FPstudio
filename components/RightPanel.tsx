
import React, { useState } from 'react';
import { Tool, ToolShape, NestLayout, Part } from '../types';
import { FilterButton } from './common/Button';
import { ToolPreview } from './common/ToolDisplay';

interface RightPanelProps {
    tools: Tool[];
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    onOpenTurretView: () => void;
    
    // Nesting Mode Props
    isNestingMode?: boolean;
    activeNest?: NestLayout | null;
    activeSheetIndex?: number;
    setActiveSheetIndex?: (idx: number) => void;
    allParts?: Part[];
}

export const RightPanel: React.FC<RightPanelProps> = ({ 
    tools, selectedToolId, setSelectedToolId, onOpenTurretView,
    isNestingMode, activeNest, activeSheetIndex, setActiveSheetIndex, allParts 
}) => {
    const [toolFilter, setToolFilter] = useState<'all' | ToolShape>('all');

    // --- NESTING MODE RENDER ---
    if (isNestingMode && activeNest) {
        const currentSheet = (typeof activeSheetIndex === 'number' && activeNest.sheets[activeSheetIndex]) || null;
        
        // Collect unique parts on this sheet
        const uniquePartsOnSheet = new Map<string, number>();
        if (currentSheet) {
            currentSheet.placedParts.forEach(pp => {
                const count = uniquePartsOnSheet.get(pp.partId) || 0;
                uniquePartsOnSheet.set(pp.partId, count + 1);
            });
        }

        // Global Statistics Calculation
        const totalSheets = activeNest.sheets.reduce((acc, s) => acc + s.quantity, 0);
        const totalMaps = activeNest.sheets.length;
        
        // Weighted Average Scrap
        let totalScrapWeighted = 0;
        let totalAreaWeighted = 0;
        
        activeNest.sheets.forEach(s => {
            totalScrapWeighted += s.scrapPercentage * s.quantity;
            totalAreaWeighted += s.quantity; // Just weighting by count for average %
        });
        const globalScrap = totalAreaWeighted > 0 ? (totalScrapWeighted / totalAreaWeighted).toFixed(1) : "0.0";

        return (
            <aside className="w-72 bg-gray-700 border-l border-gray-600 flex flex-col h-full">
                <div className="p-4 border-b border-gray-600 bg-gray-800">
                    <h2 className="text-lg font-semibold text-gray-100">Результаты Раскроя</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    
                    {/* Global Statistics */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Общая Статистика</h4>
                        <div className="bg-gray-800 p-3 rounded-md border border-gray-600 grid grid-cols-2 gap-2 text-xs">
                             <span className="text-gray-400">Всего листов:</span>
                             <span className="text-right text-white font-mono font-bold">{totalSheets}</span>
                             
                             <span className="text-gray-400">Типов карт:</span>
                             <span className="text-right text-white font-mono">{totalMaps}</span>
                             
                             <span className="text-gray-400">Ср. отход:</span>
                             <span className={`text-right font-mono font-bold ${parseFloat(globalScrap) < 20 ? 'text-green-400' : 'text-yellow-400'}`}>{globalScrap}%</span>
                        </div>
                    </div>

                    {/* Sheet List */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Карты Раскроя</h4>
                        <div className="bg-gray-800 rounded-md max-h-40 overflow-y-auto border border-gray-600">
                            {activeNest.sheets.length > 0 ? (
                                activeNest.sheets.map((sheet, idx) => (
                                    <div 
                                        key={sheet.id}
                                        onClick={() => setActiveSheetIndex && setActiveSheetIndex(idx)}
                                        className={`p-2 text-sm cursor-pointer flex justify-between items-center border-b border-gray-700 last:border-0 ${activeSheetIndex === idx ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{sheet.sheetName}</span>
                                            <span className="text-[10px] text-gray-400">{sheet.width}x{sheet.height}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold text-blue-300">x{sheet.quantity}</span>
                                            <span className={`text-[10px] ${sheet.scrapPercentage < 20 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {Math.round(sheet.scrapPercentage)}% отх.
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-gray-500 p-4 text-center">Нет сгенерированных листов</p>
                            )}
                        </div>
                    </div>

                    {/* Statistics for Active Sheet */}
                    {currentSheet && (
                        <div>
                             <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Детали (Выбранная карта)</h4>
                             <div className="bg-gray-800 rounded-md border border-gray-600 overflow-hidden">
                                 <table className="w-full text-xs text-left">
                                     <thead className="bg-gray-900 text-gray-500">
                                         <tr>
                                             <th className="p-2">Название</th>
                                             <th className="p-2 text-right">На листе</th>
                                         </tr>
                                     </thead>
                                     <tbody className="divide-y divide-gray-700">
                                         {Array.from(uniquePartsOnSheet.entries()).map(([partId, count]) => {
                                             const part = allParts?.find(p => p.id === partId);
                                             return (
                                                 <tr key={partId}>
                                                     <td className="p-2 truncate max-w-[120px]" title={part?.name}>{part?.name || 'Unknown'}</td>
                                                     <td className="p-2 text-right font-mono text-white">{count}</td>
                                                 </tr>
                                             )
                                         })}
                                     </tbody>
                                 </table>
                             </div>
                        </div>
                    )}

                </div>
            </aside>
        );
    }

    // --- STANDARD TOOL LIBRARY RENDER ---

    const filteredTools = tools.filter(tool => {
        if (toolFilter === 'all') return true;
        return tool.shape === toolFilter;
    });

    return (
        <aside className="w-64 bg-gray-700 border-l border-gray-600 flex flex-col h-full">
            <div className="p-4 border-b border-gray-600 bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-100 mb-2">Библиотека</h2>
                <div className="flex flex-wrap gap-1">
                    <FilterButton label="Все" active={toolFilter === 'all'} onClick={() => setToolFilter('all')} />
                    <FilterButton label="Круг" active={toolFilter === ToolShape.Circle} onClick={() => setToolFilter(ToolShape.Circle)} />
                    <FilterButton label="Кв." active={toolFilter === ToolShape.Square} onClick={() => setToolFilter(ToolShape.Square)} />
                    <FilterButton label="Прям." active={toolFilter === ToolShape.Rectangle} onClick={() => setToolFilter(ToolShape.Rectangle)} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredTools.map(t => (
                    <div 
                        key={t.id} 
                        className={`p-2 rounded-md flex items-center space-x-3 cursor-pointer transition-all border ${selectedToolId === t.id ? 'bg-blue-600 border-blue-400 ring-1 ring-blue-300' : 'bg-gray-800 border-gray-600 hover:bg-gray-600'}`} 
                        onClick={() => setSelectedToolId(t.id)}
                    >
                        <div className="w-10 h-10 flex items-center justify-center scale-75 flex-shrink-0 bg-white rounded shadow-sm">
                            <ToolPreview tool={t}/>
                        </div>
                        <div className="overflow-hidden">
                            <span className="truncate block font-medium text-sm text-gray-200">{t.name}</span>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                                <span>{t.shape === ToolShape.Circle ? `Ø${t.width}` : `${t.width}x${t.height}`}</span>
                                <span className={`px-1 rounded ${t.stationNumber ? 'bg-green-900 text-green-300' : 'bg-gray-700'}`}>
                                    {t.stationNumber ? `ST:${t.stationNumber}` : 'Lib'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
                {filteredTools.length === 0 && (
                    <p className="text-center text-gray-500 text-sm py-4">Инструменты не найдены</p>
                )}
            </div>
            
            <div className="p-2 border-t border-gray-600 bg-gray-800">
                 <button onClick={onOpenTurretView} className="w-full text-xs bg-gray-600 hover:bg-gray-500 py-2 rounded text-gray-200">
                    Открыть Револьвер...
                </button>
            </div>
        </aside>
    );
};
