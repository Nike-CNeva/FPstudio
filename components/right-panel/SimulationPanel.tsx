
/**
 * ОТВЕТСТВЕННОСТЬ: Контроллер проигрывания пути инструмента.
 */
import React from 'react';
import { PlayIcon } from '../Icons';

interface SimulationPanelProps {
    step: number;
    total: number;
    isSimulating: boolean;
    onToggle: () => void;
    onStop: () => void;
    onStepChange: (s: number) => void;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
    step, total, isSimulating, onToggle, onStop, onStepChange
}) => {
    if (total === 0) return null;

    return (
        <div className="p-3 bg-gray-900 border-t border-gray-700 space-y-2 flex-none">
            <div className="flex justify-between items-center text-xs text-gray-400">
                <span className="uppercase font-bold text-blue-400">Симуляция</span>
                <span>{step} / {total}</span>
            </div>
            
            <input 
                type="range" 
                min="0" 
                max={total - 1} 
                value={step} 
                onChange={(e) => onStepChange(parseInt(e.target.value))}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />

            <div className="flex space-x-2">
                <button 
                    onClick={onToggle} 
                    className={`flex-1 py-1.5 rounded text-xs font-bold text-white transition-colors flex items-center justify-center ${isSimulating ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500'}`}
                >
                    <PlayIcon className="w-3 h-3 mr-1"/>
                    {isSimulating ? 'Пауза' : 'Старт'}
                </button>
                <button onClick={onStop} className="px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-xs text-white">Стоп</button>
            </div>
        </div>
    );
};
