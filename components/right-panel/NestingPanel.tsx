
/**
 * ОТВЕТСТВЕННОСТЬ: Статистика раскроя, список листов и состав выбранного листа.
 */
import React, { useMemo } from 'react';
import { NestLayout, Part } from '../../types';

interface NestingPanelProps {
    activeNest: NestLayout | null;
    activeSheetIndex: number;
    setActiveSheetIndex: (index: number) => void;
    allParts: Part[];
}

export const NestingPanel: React.FC<NestingPanelProps> = ({
    activeNest, activeSheetIndex, setActiveSheetIndex, allParts
}) => {
    
    const stats = useMemo(() => {
        if (!activeNest || activeNest.sheets.length === 0) return null;
        let totalArea = 0, totalUsedArea = 0, totalSheets = 0;
        const sheetsByDim: Record<string, number> = {};

        activeNest.sheets.forEach(sheet => {
            const area = sheet.width * sheet.height;
            totalArea += area * sheet.quantity;
            totalUsedArea += (sheet.usedArea / 100) * area * sheet.quantity;
            totalSheets += sheet.quantity;
            const dimKey = `${sheet.width}x${sheet.height}`;
            sheetsByDim[dimKey] = (sheetsByDim[dimKey] || 0) + sheet.quantity;
        });

        return {
            totalScrap: totalArea > 0 ? (1 - totalUsedArea / totalArea) * 100 : 0,
            totalSheets,
            uniqueLayouts: activeNest.sheets.length,
            sheetsByDim
        };
    }, [activeNest]);

    const getPartsOnSheet = (idx: number) => {
        if (!activeNest?.sheets[idx]) return [];
        const counts: Record<string, number> = {};
        activeNest.sheets[idx].placedParts.forEach(pp => counts[pp.partId] = (counts[pp.partId] || 0) + 1);
        return Object.entries(counts).map(([partId, count]) => ({
            name: allParts.find(p => p.id === partId)?.name || 'Unknown',
            count
        }));
    };

    if (!activeNest || activeNest.sheets.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                <p className="mb-2">Нет результатов раскроя</p>
                <p className="text-xs">Запустите раскрой в левой панели для получения карт.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Global Summary */}
            <div className="p-4 bg-gray-800 border-b border-gray-700 space-y-3 shadow-md z-10 flex-none">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Общий отход:</span>
                    <span className={`font-bold text-lg ${stats!.totalScrap > 20 ? 'text-red-400' : 'text-green-400'}`}>
                        {stats!.totalScrap.toFixed(1)}%
                    </span>
                </div>
                <div className="bg-gray-700/50 p-2 rounded text-xs space-y-1">
                    <div className="flex justify-between text-gray-300 border-b border-gray-600 pb-1 mb-1">
                        <span>Карт раскроя:</span>
                        <span className="font-bold">{stats!.uniqueLayouts}</span>
                    </div>
                    {Object.entries(stats!.sheetsByDim).map(([dim, count]) => (
                        <div key={dim} className="flex justify-between text-gray-200">
                            <span>{dim} мм</span>
                            <span className="font-mono">x{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* List of Sheets */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                <div className="text-[10px] font-bold text-gray-500 uppercase pl-1">Список карт</div>
                {activeNest.sheets.map((sheet, idx) => (
                    <div 
                        key={sheet.id}
                        onClick={() => setActiveSheetIndex(idx)}
                        className={`p-3 rounded border cursor-pointer transition-all flex justify-between items-center ${idx === activeSheetIndex ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/50' : 'bg-gray-700 border-gray-600 hover:border-gray-500'}`}
                    >
                        <div>
                            <div className="font-bold text-white text-xs">{sheet.sheetName || `Лист ${idx+1}`}</div>
                            <div className="text-[10px] text-gray-400">{sheet.width} x {sheet.height}</div>
                        </div>
                        <div className="text-right">
                            <div className="bg-gray-800 px-2 py-0.5 rounded text-white font-mono text-xs mb-1">x{sheet.quantity}</div>
                            <div className={`text-[10px] font-bold ${sheet.scrapPercentage > 20 ? 'text-red-400' : 'text-green-400'}`}>
                                {sheet.scrapPercentage.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Composition of active sheet */}
            <div className="h-56 bg-gray-900 border-t border-gray-700 flex flex-col flex-none">
                <div className="p-2 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
                    <h4 className="text-xs font-bold text-gray-300">Состав листа {activeSheetIndex + 1}</h4>
                    <span className="text-[10px] text-gray-500">{activeNest.sheets[activeSheetIndex]?.placedParts.length || 0} деталей</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {getPartsOnSheet(activeSheetIndex).map((p, i) => (
                        <div key={i} className="flex justify-between items-center bg-gray-800 p-2 rounded text-xs border border-gray-700 hover:bg-gray-700 transition-colors">
                            <span className="text-gray-300 truncate mr-2" title={p.name}>{p.name}</span>
                            <span className="font-mono font-bold text-blue-400">{p.count} шт</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
