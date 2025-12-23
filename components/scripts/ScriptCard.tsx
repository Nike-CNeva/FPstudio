
/**
 * ОТВЕТСТВЕННОСТЬ: Отображение краткой информации о скрипте в списке.
 */
import React from 'react';
import { ParametricScript } from '../../types';

interface ScriptCardProps {
    script: ParametricScript;
    isSelected: boolean;
    onClick: () => void;
}

export const ScriptCard: React.FC<ScriptCardProps> = ({ script, isSelected, onClick }) => (
    <div 
        onClick={onClick}
        className={`p-3 cursor-pointer transition-colors ${
            isSelected 
                ? 'bg-purple-900/50 text-white border-l-4 border-purple-500' 
                : 'hover:bg-gray-700 text-gray-300 border-l-4 border-transparent'
        }`}
    >
        <div className="font-semibold truncate">{script.name}</div>
    </div>
);
