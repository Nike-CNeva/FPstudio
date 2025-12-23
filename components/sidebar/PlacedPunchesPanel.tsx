
import React from 'react';
import { Part, Tool, PlacedTool } from '../../types';
import { TrashIcon } from '../Icons';
import { InputField } from '../common/InputField';
import { useGroupedPunches } from '../../hooks/sidebar/useGroupedPunches';

interface PlacedPunchesPanelProps {
    activePart: Part | null;
    tools: Tool[];
    selectedPunchId: string | null;
    onSelectPunch: (id: string | null) => void;
    onDeletePunch: (id: string | string[]) => void;
    onUpdatePunch: (id: string, updates: Partial<PlacedTool>) => void;
    onClearAll: () => void;
}

export const PlacedPunchesPanel: React.FC<PlacedPunchesPanelProps> = ({ 
    activePart, tools, selectedPunchId, onSelectPunch, onDeletePunch, onUpdatePunch, onClearAll 
}) => {
    const groupedPunches = useGroupedPunches(activePart, tools);
    const selectedPunch = activePart?.punches.find(p => p.id === selectedPunchId);
    
    return (
        <div className="border-b border-gray-600 pb-3 mb-3">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-300">Размещенный инструмент</h3>
                <button onClick={onClearAll} disabled={!activePart || activePart.punches.length === 0} className="text-xs flex items-center space-x-1 bg-red-900/50 hover:bg-red-800 text-red-200 px-2 py-1 rounded border border-red-800 disabled:opacity-50">
                    <TrashIcon className="w-3 h-3"/> <span>Очистить</span>
                </button>
            </div>
            
            <div className="bg-gray-800 rounded-md p-2 max-h-48 overflow-y-auto mb-3 space-y-1 custom-scrollbar">
                {groupedPunches.map(item => (
                    <div key={item.id} onClick={() => onSelectPunch(item.id)} className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${selectedPunchId && item.refIds.includes(selectedPunchId) ? 'bg-blue-600' : 'bg-gray-900 hover:bg-gray-600'}`}>
                        <div className="flex items-center space-x-2 overflow-hidden">
                            {item.type === 'group' && <span className="text-[10px] bg-yellow-600 px-1 rounded font-bold">GRP</span>}
                            <span className="text-sm truncate">{item.name}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onDeletePunch(item.refIds); }} className="text-gray-500 hover:text-red-500 p-1">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {groupedPunches.length === 0 && <p className="text-xs text-gray-500 text-center py-4 italic">Инструмент не размещен</p>}
            </div>

            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                     <InputField label="X (мм)" type="number" value={selectedPunch?.x.toFixed(3) || ''} onChange={e => selectedPunchId && onUpdatePunch(selectedPunchId, { x: parseFloat(e.target.value)||0 })} disabled={!selectedPunchId} />
                     <InputField label="Y (мм)" type="number" value={selectedPunch?.y.toFixed(3) || ''} onChange={e => selectedPunchId && onUpdatePunch(selectedPunchId, { y: parseFloat(e.target.value)||0 })} disabled={!selectedPunchId} />
                </div>
                <InputField label="Угол (°)" type="number" value={selectedPunch?.rotation.toFixed(2) || ''} onChange={e => selectedPunchId && onUpdatePunch(selectedPunchId, { rotation: parseFloat(e.target.value)||0 })} disabled={!selectedPunchId} />
            </div>
        </div>
    );
};
