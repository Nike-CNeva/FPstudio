
import React, { useState } from 'react';
import { Part, Tool, PartProfile } from '../types';
import { TrashIcon, BoxIcon, PlayIcon } from './Icons';

interface PartLibraryViewProps {
    parts: Part[];
    tools: Tool[];
    onLoadPart: (part: Part) => void;
    onDeletePart: (id: string) => void;
    onUpdatePart: (part: Part) => void;
}

export const PartLibraryView: React.FC<PartLibraryViewProps> = ({ parts, onLoadPart, onDeletePart }) => {
    const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredParts = parts.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedPart = parts.find(p => p.id === selectedPartId);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Delete' && selectedPartId) {
            onDeletePart(selectedPartId);
            setSelectedPartId(null);
        }
    };

    // Helper to format dimensions based on profile type
    const formatPartDimensions = (part: Part) => {
        if (!part.profile || part.profile.type === 'flat') {
            return `${part.faceWidth} x ${part.faceHeight}`;
        }
        const { type, orientation, dims } = part.profile;
        const { a, b, c } = dims;
        
        const f = (n: number) => parseFloat(n.toFixed(1)); // Clean float

        if (type === 'L') {
            if (orientation === 'vertical') return `${f(a)} + ${f(b)} x ${part.faceHeight}`;
            return `${part.faceWidth} x ${f(a)} + ${f(b)}`;
        }
        if (type === 'U') {
            if (orientation === 'vertical') return `${f(a)} + ${f(b)} + ${f(c)} x ${part.faceHeight}`;
            return `${part.faceWidth} x ${f(a)} + ${f(b)} + ${f(c)}`;
        }
        return `${part.faceWidth} x ${part.faceHeight}`;
    };

    return (
        <main className="flex-1 bg-gray-800 flex overflow-hidden h-full" onKeyDown={handleKeyDown} tabIndex={0}>
            {/* Left Panel: List */}
            <div className="w-1/3 min-w-[350px] flex flex-col border-r border-gray-700 bg-gray-900/30">
                <div className="p-4 border-b border-gray-700 bg-gray-800">
                    <h2 className="text-lg font-bold text-white flex items-center mb-3">
                        <BoxIcon className="w-5 h-5 mr-2 text-blue-400" />
                        Библиотека Деталей
                    </h2>
                    <input 
                        type="text" 
                        placeholder="Поиск по названию..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredParts.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            {parts.length === 0 ? "Библиотека пуста" : "Детали не найдены"}
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-gray-800 text-gray-400 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 font-medium">Название</th>
                                    <th className="p-3 font-medium">Размеры (Лицо)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredParts.map(part => {
                                    const isSelected = selectedPartId === part.id;
                                    return (
                                        <tr 
                                            key={part.id} 
                                            onClick={() => setSelectedPartId(part.id)}
                                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                                        >
                                            <td className="p-3 font-semibold truncate max-w-[150px]" title={part.name}>{part.name}</td>
                                            <td className="p-3 whitespace-nowrap font-mono text-xs">{formatPartDimensions(part)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-2 border-t border-gray-700 text-xs text-center text-gray-500 bg-gray-800">
                    Всего деталей: {filteredParts.length}
                </div>
            </div>

            {/* Right Panel: Preview & Details */}
            <div className="flex-1 flex flex-col bg-gray-800 relative">
                {selectedPart ? (
                    <div className="flex flex-col h-full">
                         {/* Detail Header */}
                        <div className="flex-none flex justify-between items-start p-6 bg-gray-800">
                            <div>
                                <h2 className="text-2xl font-bold text-white">{selectedPart.name}</h2>
                                <div className="flex items-center space-x-2 mt-1">
                                    <span className="text-gray-400 text-sm">ID: {selectedPart.id}</span>
                                    {selectedPart.profile && selectedPart.profile.type !== 'flat' && (
                                        <span className="px-2 py-0.5 rounded bg-purple-900/50 border border-purple-700 text-[10px] text-purple-200 font-mono uppercase">
                                            {selectedPart.profile.type}-Profile ({selectedPart.profile.orientation})
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => { onDeletePart(selectedPart.id); setSelectedPartId(null); }}
                                    className="px-3 py-2 bg-red-900/50 text-red-200 hover:bg-red-800 rounded border border-red-700 transition-colors flex items-center text-sm"
                                >
                                    <TrashIcon className="w-4 h-4 mr-2"/> Удалить
                                </button>
                                <button 
                                    onClick={() => onLoadPart(selectedPart)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg flex items-center font-bold transition-colors"
                                >
                                    <PlayIcon className="w-5 h-5 mr-2"/> Редактировать
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="flex flex-col h-full">
                                    {/* Preview Area */}
                                <div className="flex-1 bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center p-8 min-h-[300px] relative overflow-hidden mb-6">
                                    <svg 
                                        viewBox={`0 ${-selectedPart.geometry.height} ${selectedPart.geometry.width} ${selectedPart.geometry.height}`}
                                        className="w-full h-full max-w-full max-h-full drop-shadow-xl"
                                        preserveAspectRatio="xMidYMid meet"
                                    >
                                        <defs>
                                            <pattern id="smallGridPreview" width="10" height="10" patternUnits="userSpaceOnUse">
                                                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5"/>
                                            </pattern>
                                            <pattern id="gridPreview" width="100" height="100" patternUnits="userSpaceOnUse">
                                                <rect width="100" height="100" fill="url(#smallGridPreview)"/>
                                                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1"/>
                                            </pattern>
                                        </defs>
                                        {/* Background Grid handles its own tiling, no flip needed for it specifically if it fills rect */}
                                        <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#gridPreview)" /> 
                                        
                                        <g transform="scale(1, -1)">
                                            <path d={selectedPart.geometry.path} fill="#2d3748" stroke="#63b3ed" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                            {selectedPart.punches.map((p, i) => (
                                                <circle key={i} cx={p.x} cy={p.y} r="2" fill="yellow" opacity="0.8" vectorEffect="non-scaling-stroke" />
                                            ))}
                                        </g>
                                    </svg>
                                    <div className="absolute bottom-4 right-4 bg-gray-800/80 px-2 py-1 rounded text-xs text-gray-300 pointer-events-none">
                                        Геометрия (DXF)
                                    </div>
                                </div>

                                {/* Detailed Properties */}
                                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                                    <div className="bg-gray-700/50 p-3 rounded border border-gray-600">
                                        <span className="block text-xs text-gray-400 uppercase">Габариты (Лицо)</span>
                                        <span className="text-lg font-mono font-bold text-white">
                                            {formatPartDimensions(selectedPart)} <span className="text-sm text-gray-400 font-normal">мм</span>
                                        </span>
                                    </div>
                                    <div className="bg-gray-700/50 p-3 rounded border border-gray-600">
                                        <span className="block text-xs text-gray-400 uppercase">Габариты (Развертка)</span>
                                        <span className="text-lg font-mono text-gray-200">{selectedPart.geometry.width.toFixed(1)} x {selectedPart.geometry.height.toFixed(1)} мм</span>
                                    </div>
                                    <div className="bg-gray-700/50 p-3 rounded border border-gray-600">
                                        <span className="block text-xs text-gray-400 uppercase">Инструмент</span>
                                        <span className="text-lg font-bold text-yellow-400">{selectedPart.punches.length} <span className="text-sm text-gray-400 font-normal">ударов</span></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <div className="w-24 h-24 mb-4 rounded-full bg-gray-700 flex items-center justify-center">
                            <BoxIcon className="w-12 h-12 opacity-50" />
                        </div>
                        <p className="text-lg font-medium">Выберите деталь для просмотра</p>
                        <p className="text-sm mt-2">или используйте поиск слева</p>
                    </div>
                )}
            </div>
        </main>
    );
};
