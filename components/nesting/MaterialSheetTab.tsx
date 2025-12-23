
/**
 * ОТВЕТСТВЕННОСТЬ: Учет складских листов, выбор активного размера и стратегии использования.
 */
import React, { useState } from 'react';
import { NestingSettings, SheetStock, SheetUtilizationStrategy } from '../../types';
import { generateId } from '../../utils/helpers';

interface MaterialSheetTabProps {
    settings: NestingSettings;
    setSettings: React.Dispatch<React.SetStateAction<NestingSettings>>;
}

export const MaterialSheetTab: React.FC<MaterialSheetTabProps> = ({ settings, setSettings }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedSheet = settings.availableSheets.find(s => s.id === selectedId);

    const updateSheet = (id: string, updates: Partial<SheetStock>) => {
        setSettings(prev => ({
            ...prev,
            availableSheets: prev.availableSheets.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex space-x-4 h-64">
                <fieldset className="border border-gray-600 p-2 rounded-md bg-gray-800/50 flex-1 flex flex-col overflow-hidden">
                    <legend className="px-2 font-semibold text-gray-300 text-xs">Reserved sheets</legend>
                    <div className="flex-1 overflow-auto bg-white text-black text-[10px]">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr><th className="p-1 border">ID</th><th className="p-1 border">X</th><th className="p-1 border">Y</th><th className="p-1 border">Qty</th></tr>
                            </thead>
                            <tbody>
                                {settings.availableSheets.map(s => (
                                    <tr key={s.id} onClick={() => setSelectedId(s.id)} className={`cursor-pointer ${selectedId === s.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}>
                                        <td className="p-1 border">{s.material}</td><td className="p-1 border">{s.width}</td><td className="p-1 border">{s.height}</td><td className="p-1 border">{s.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </fieldset>
                <div className="flex flex-col space-y-2 w-32 pt-2">
                    <button onClick={() => {
                        const ns = { id: generateId(), width: 2560, height: 1250, thickness: 1, material: 'Zink', quantity: 1, cost: 0, useInNesting: true };
                        setSettings(p => ({ ...p, availableSheets: [...p.availableSheets, ns], activeSheetId: ns.id }));
                        setSelectedId(ns.id);
                    }} className="px-2 py-1 bg-gray-200 text-black text-xs rounded">New...</button>
                    <button disabled={!selectedId} onClick={() => setSettings(p => ({ ...p, availableSheets: p.availableSheets.filter(s => s.id !== selectedId) }))} className="px-2 py-1 bg-gray-200 text-black text-xs rounded disabled:opacity-50">Delete</button>
                </div>
            </div>

            {selectedSheet && (
                <div className="bg-gray-700/50 p-2 rounded border border-gray-600 grid grid-cols-4 gap-2 text-[10px]">
                    <div><label className="text-gray-400">ID</label><input type="text" value={selectedSheet.material} onChange={e => updateSheet(selectedSheet.id, { material: e.target.value })} className="w-full bg-gray-900 px-1 border border-gray-500" /></div>
                    <div><label className="text-gray-400">X</label><input type="number" value={selectedSheet.width} onChange={e => updateSheet(selectedSheet.id, { width: parseFloat(e.target.value)||0 })} className="w-full bg-gray-900 px-1 border border-gray-500" /></div>
                    <div><label className="text-gray-400">Y</label><input type="number" value={selectedSheet.height} onChange={e => updateSheet(selectedSheet.id, { height: parseFloat(e.target.value)||0 })} className="w-full bg-gray-900 px-1 border border-gray-500" /></div>
                    <div><label className="text-gray-400">Qty</label><input type="number" value={selectedSheet.quantity} onChange={e => updateSheet(selectedSheet.id, { quantity: parseInt(e.target.value)||1 })} className="w-full bg-gray-900 px-1 border border-gray-500" /></div>
                </div>
            )}

            <fieldset className="border border-gray-600 p-3 rounded-md bg-gray-800/50">
                <legend className="px-2 font-semibold text-gray-300 text-xs uppercase">Strategy</legend>
                <div className="space-y-1 text-xs">
                    {[SheetUtilizationStrategy.ListedOrder, SheetUtilizationStrategy.SmallestFirst, SheetUtilizationStrategy.BestFit].map(st => (
                        <label key={st} className="flex items-center space-x-2 cursor-pointer">
                            <input type="radio" name="strat" checked={settings.utilizationStrategy === st} onChange={() => setSettings(s => ({ ...s, utilizationStrategy: st }))} />
                            <span className="capitalize">{st.replace('-', ' ')}</span>
                        </label>
                    ))}
                </div>
            </fieldset>
        </div>
    );
};
