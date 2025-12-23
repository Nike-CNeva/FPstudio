
/**
 * ОТВЕТСТВЕННОСТЬ: Выбор деталей из библиотеки и настройка их количества/вращения.
 */
import React from 'react';
import { Part, ScheduledPart, NestingConstraints } from '../../types';
import { PlusIcon, TrashIcon } from '../Icons';

interface PartListTabProps {
    allParts: Part[];
    scheduledParts: ScheduledPart[];
    setScheduledParts: React.Dispatch<React.SetStateAction<ScheduledPart[]>>;
}

export const PartListTab: React.FC<PartListTabProps> = ({ allParts, scheduledParts, setScheduledParts }) => {
    const addPart = (partId: string) => {
        setScheduledParts(prev => {
            const existing = prev.find(p => p.partId === partId);
            if (existing) return prev.map(p => p.partId === partId ? { ...p, quantity: p.quantity + 1 } : p);
            const part = allParts.find(p => p.id === partId);
            return [...prev, { partId, quantity: 1, nesting: part?.nesting || { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: false, canMirror: false } }];
        });
    };

    const updatePart = (partId: string, updates: Partial<ScheduledPart> | { nesting: Partial<NestingConstraints> }) => {
        setScheduledParts(prev => prev.map(p => {
            if (p.partId !== partId) return p;
            if ('nesting' in updates) return { ...p, nesting: { ...p.nesting, ...updates.nesting } };
            return { ...p, ...updates };
        }));
    };

    return (
        <div className="grid grid-cols-3 gap-x-8">
            <div className="col-span-1">
                <h3 className="font-semibold text-gray-300 mb-2 text-sm">Библиотека</h3>
                <div className="bg-gray-900/50 rounded-md p-2 h-80 overflow-y-auto space-y-2">
                    {allParts.map(part => (
                        <div key={part.id} className="bg-gray-700 p-2 rounded flex items-center justify-between text-xs">
                            <span className="truncate flex-1">{part.name}</span>
                            <button onClick={() => addPart(part.id)} className="p-1 bg-blue-600 rounded-full hover:bg-blue-500"><PlusIcon className="w-3 h-3" /></button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="col-span-2">
                <h3 className="font-semibold text-gray-300 mb-2 text-sm">Очередь раскроя</h3>
                <div className="bg-gray-900/50 rounded-md p-2 h-80 overflow-y-auto space-y-2">
                    <div className="grid grid-cols-[1fr,60px,40px,40px,40px,30px] gap-2 text-[10px] text-gray-500 font-bold px-2 uppercase">
                        <span>Деталь</span><span>Кол</span><span>0°</span><span>90°</span><span>Зерк</span><span></span>
                    </div>
                    {scheduledParts.map(sp => (
                        <div key={sp.partId} className="bg-gray-700 p-2 rounded grid grid-cols-[1fr,60px,40px,40px,40px,30px] items-center gap-2 text-xs">
                            <span className="truncate">{allParts.find(p => p.id === sp.partId)?.name || '...'}</span>
                            <input type="number" value={sp.quantity} onChange={e => updatePart(sp.partId, { quantity: parseInt(e.target.value) || 1 })} className="bg-gray-800 border-gray-600 rounded px-1 text-center" />
                            <input type="checkbox" checked={sp.nesting.allow0_180} onChange={e => updatePart(sp.partId, { nesting: { allow0_180: e.target.checked } })} className="mx-auto" />
                            <input type="checkbox" checked={sp.nesting.allow90_270} onChange={e => updatePart(sp.partId, { nesting: { allow90_270: e.target.checked } })} className="mx-auto" />
                            <input type="checkbox" checked={sp.nesting.canMirror} onChange={e => updatePart(sp.partId, { nesting: { canMirror: e.target.checked } })} className="mx-auto" />
                            <button onClick={() => setScheduledParts(prev => prev.filter(p => p.partId !== sp.partId))} className="text-gray-500 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
