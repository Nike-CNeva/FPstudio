
import React from 'react';
import { Tool, SnapMode, ManualPunchMode } from '../../types';
import { ToolSvg } from '../common/ToolDisplay';
import { InputField } from '../common/InputField';
import { usePlacementFaces } from '../../hooks/sidebar/usePlacementFaces';

interface PlacementSettingsProps {
    punchOrientation: number;
    setPunchOrientation: (angle: number) => void;
    selectedToolId: string | null;
    tools: Tool[];
    manualPunchMode: ManualPunchMode;
    snapMode: SnapMode;
    setSnapMode: (mode: SnapMode) => void;
    punchOffset: number;
    setPunchOffset: (offset: number) => void;
}

export const PlacementSettingsPanel: React.FC<PlacementSettingsProps> = (props) => {
    const { punchOrientation, setPunchOrientation, selectedToolId, tools, manualPunchMode, snapMode, setSnapMode, punchOffset, setPunchOffset } = props;
    const selectedTool = tools.find(t => t.id === selectedToolId);
    const { faces, activeFaceIndex, handleCycleFace } = usePlacementFaces(selectedTool, setPunchOrientation);

    return (
        <div className='border-b border-gray-600 pb-3 mb-3'>
            <h3 className="font-bold mb-2 text-gray-300">Параметры вставки</h3>
            <div className="space-y-3">
                {manualPunchMode === ManualPunchMode.Punch && (
                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 block">Привязка (Snap)</label>
                        <select value={snapMode} onChange={(e) => setSnapMode(e.target.value as SnapMode)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200">
                            <option value={SnapMode.Off}>Отключено</option>
                            <option value={SnapMode.Vertex}>Вершина</option>
                            <option value={SnapMode.SegmentCenter}>Центр сегмента</option>
                            <option value={SnapMode.ClosestPoint}>Ближайшая точка</option>
                            <option value={SnapMode.ShapeCenter}>Центр фигуры</option>
                        </select>
                        {snapMode === SnapMode.Vertex && <InputField label="Смещение (мм)" type="number" value={punchOffset} onChange={(e) => setPunchOffset(parseFloat(e.target.value) || 0)} />}
                    </div>
                )}
                
                {selectedTool && (manualPunchMode === ManualPunchMode.Punch || manualPunchMode === ManualPunchMode.Nibble) && (
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Активная грань</label>
                        <button onClick={handleCycleFace} className="w-full h-32 bg-gray-800 border border-gray-600 hover:border-blue-500 rounded cursor-pointer relative group flex items-center justify-center overflow-hidden">
                            <svg viewBox={`${-selectedTool.width/1.5} ${-selectedTool.height/1.5} ${selectedTool.width*1.3} ${selectedTool.height*1.3}`} className="w-full h-full drop-shadow-lg p-2">
                                <g className="text-gray-500"><ToolSvg tool={selectedTool} /></g>
                                {faces[activeFaceIndex] && <path d={faces[activeFaceIndex].path} stroke="#3b82f6" strokeWidth={selectedTool.width/15} fill="none" strokeLinecap="round" />}
                            </svg>
                            <div className="absolute top-1 right-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono text-blue-400 border border-blue-900/50">{punchOrientation.toFixed(0)}°</div>
                            <div className="absolute bottom-0 w-full text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 bg-black/50 py-1 transition-opacity">Нажмите для смены стороны</div>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
