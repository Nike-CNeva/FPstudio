
import React, { ChangeEvent, useRef } from 'react';
import { AppMode, NestLayout, Part, Tool, ManualPunchMode, PlacementReference, SnapMode, NibbleSettings, DestructSettings, PlacedTool, PlacementSide, TeachCycle, ScheduledPart } from '../../types';
import { FolderIcon, SaveIcon, PlusIcon, TrashIcon, PlayIcon, SettingsIcon, CodeIcon } from './Icons';
import { SidebarTabButton, ActionButton } from './common/Button';
import { 
    PartPropertiesForm, 
    PlacedPunchesPanel, 
    ManualPunchModeSelector, 
    NibbleSettingsPanel, 
    DestructSettingsPanel, 
    PlacementSettings 
} from './sidebar/SidebarPanels';
import { NestingSidebarPanel } from './sidebar/NestingSidebarPanel';

interface SidebarProps {
    mode: AppMode;
    parts: Part[]; 
    activePart: Part | null;
    activePartId: string | null;
    setActivePartId: (id: string) => void;
    onDeletePart: (id: string) => void;
    tools: Tool[];
    activeNest: NestLayout | null;
    activeSheetIndex?: number;
    setActiveSheetIndex?: (idx: number) => void;
    onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
    // Manual Punching
    manualPunchMode: ManualPunchMode;
    setManualPunchMode: (mode: ManualPunchMode) => void;
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    selectedPunchId: string | null;
    setSelectedPunchId: (id: string | null) => void;
    onDeletePunch: (id: string | string[]) => void;
    onUpdatePunch: (id: string, updates: Partial<PlacedTool>) => void;
    placementReference: PlacementReference;
    setPlacementReference: (ref: PlacementReference) => void;
    placementSide: PlacementSide;
    setPlacementSide: (side: PlacementSide) => void;
    punchOrientation: number;
    setPunchOrientation: (angle: number) => void;
    onCyclePunchOrientation: () => void;
    snapMode: SnapMode;
    setSnapMode: (mode: SnapMode) => void;
    punchOffset: number;
    setPunchOffset: (offset: number) => void;
    
    // Nesting Settings Prop - Replaces onOpenNestingSettings
    onUpdateNestingSettings?: (settings: NestLayout['settings'], scheduledParts: ScheduledPart[]) => void;
    
    nibbleSettings: NibbleSettings;
    setNibbleSettings: (settings: NibbleSettings) => void;
    destructSettings: DestructSettings;
    setDestructSettings: (settings: DestructSettings) => void;
    // Actions
    onOpenTurretView: () => void;
    onSavePartAsScript: () => void;
    onSavePartAsStatic: () => void;
    onUpdateActivePart: (updates: Partial<Part>) => void;
    onClosePart: () => void;
    // Teach Mode
    teachMode: boolean;
    setTeachMode: (val: boolean) => void;
    onSaveTeachCycle: () => void;
    teachCycles: TeachCycle[];
    onDeleteTeachCycle: (id: string) => void;
    // Nesting Actions
    onRunNesting?: () => void;
    onClearNest?: () => void;
    selectedNestPartId?: string | null;
    onMoveNestPart?: (id: string, dx: number, dy: number) => void;
    onRotateNestPart?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    mode, activePart, onFileUpload, tools, activeNest, activeSheetIndex, setActiveSheetIndex, parts,
    manualPunchMode, setManualPunchMode, selectedToolId,
    selectedPunchId, setSelectedPunchId, onDeletePunch, onUpdatePunch, 
    placementReference, setPlacementReference, placementSide, setPlacementSide, punchOrientation, setPunchOrientation, onCyclePunchOrientation,
    snapMode, setSnapMode, punchOffset, setPunchOffset, 
    onUpdateNestingSettings,
    nibbleSettings, setNibbleSettings, destructSettings, setDestructSettings,
    onSavePartAsScript, onSavePartAsStatic, onUpdateActivePart, onClosePart,
    teachMode, setTeachMode, onSaveTeachCycle, teachCycles, onDeleteTeachCycle,
    onRunNesting, onClearNest, selectedNestPartId, onMoveNestPart, onRotateNestPart
}) => {
    const [sidebarTab, setSidebarTab] = React.useState<'properties' | 'punching' | 'teach'>('properties');
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <aside className="w-80 bg-gray-700 p-4 flex flex-col space-y-4 overflow-y-auto border-r border-gray-600">
            {mode === AppMode.PartEditor && (
                <div>
                    <div className="flex border-b border-gray-600 mb-4">
                        <SidebarTabButton label="Свойства" active={sidebarTab==='properties'} onClick={() => setSidebarTab('properties')} />
                        <SidebarTabButton label="Пробивка" active={sidebarTab==='punching'} onClick={() => setSidebarTab('punching')} />
                        <SidebarTabButton label="Обучение" active={sidebarTab==='teach'} onClick={() => setSidebarTab('teach')} />
                    </div>

                    {sidebarTab === 'properties' && (
                        <div className="space-y-4">
                            {!activePart ? (
                                <div className="text-center py-8 space-y-4">
                                    <p className="text-gray-400 text-sm">Нет активной детали.<br/>Загрузите файл для начала работы.</p>
                                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 p-3 rounded-md shadow-lg">
                                        <FolderIcon className="w-6 h-6"/>
                                        <span className="font-bold">Открыть файл (DXF / CP)</span>
                                    </button>
                                    <input type="file" ref={fileInputRef} onChange={onFileUpload} accept=".dxf,.cp" className="hidden" />
                                </div>
                            ) : (
                                <>
                                    <PartPropertiesForm part={activePart} onUpdate={onUpdateActivePart} onClosePart={onClosePart} />
                                    
                                    <div className="pt-4 border-t border-gray-600 grid grid-cols-2 gap-2">
                                        <button onClick={onSavePartAsStatic} className="flex flex-col items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 rounded-md shadow-lg text-white transition-colors">
                                            <SaveIcon className="w-5 h-5 mb-1"/>
                                            <span className="font-bold text-xs">Сохранить Деталь</span>
                                        </button>
                                        <button onClick={onSavePartAsScript} className="flex flex-col items-center justify-center p-2 bg-purple-600 hover:bg-purple-700 rounded-md shadow-lg text-white transition-colors">
                                            <CodeIcon className="w-5 h-5 mb-1"/>
                                            <span className="font-bold text-xs">Сохранить Скрипт</span>
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 text-center mt-2">
                                        "Деталь" - для текущего раскроя. "Скрипт" - в библиотеку.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {sidebarTab === 'punching' && (
                        <div>
                            {!activePart ? (
                                <p className="text-center text-gray-500 py-4 text-sm">Загрузите деталь для работы с инструментом.</p>
                            ) : (
                                <>
                                    <PlacedPunchesPanel 
                                        activePart={activePart}
                                        tools={tools}
                                        selectedPunchId={selectedPunchId}
                                        onSelectPunch={setSelectedPunchId}
                                        onDeletePunch={onDeletePunch}
                                        onUpdatePunch={onUpdatePunch}
                                    />
                                    <ManualPunchModeSelector manualPunchMode={manualPunchMode} setManualPunchMode={setManualPunchMode} />
                                    {manualPunchMode === ManualPunchMode.Nibble && <NibbleSettingsPanel nibbleSettings={nibbleSettings} setNibbleSettings={setNibbleSettings} />}
                                    {manualPunchMode === ManualPunchMode.Destruct && <DestructSettingsPanel destructSettings={destructSettings} setDestructSettings={setDestructSettings} />}
                                    <PlacementSettings 
                                        placementReference={placementReference}
                                        setPlacementReference={setPlacementReference}
                                        placementSide={placementSide}
                                        setPlacementSide={setPlacementSide}
                                        punchOrientation={punchOrientation}
                                        setPunchOrientation={setPunchOrientation}
                                        onCyclePunchOrientation={onCyclePunchOrientation}
                                        selectedToolId={selectedToolId}
                                        tools={tools}
                                        punchOffset={punchOffset}
                                        setPunchOffset={setPunchOffset}
                                        manualPunchMode={manualPunchMode}
                                        snapMode={snapMode}
                                        setSnapMode={setSnapMode}
                                    />
                                </>
                            )}
                        </div>
                    )}

                    {sidebarTab === 'teach' && (
                        <div>
                            {!activePart ? (
                                <p className="text-center text-gray-500 py-4 text-sm">Загрузите деталь для создания циклов.</p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-gray-800 p-3 rounded-md">
                                        <h3 className="font-bold text-gray-300 mb-2">Обучающие циклы</h3>
                                        <p className="text-xs text-gray-400 mb-3">
                                            Создавайте шаблоны обработки для автоматического повторения на похожей геометрии.
                                        </p>
                                        
                                        {!teachMode ? (
                                            <button 
                                                onClick={() => setTeachMode(true)} 
                                                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded flex items-center justify-center space-x-2"
                                            >
                                                <PlusIcon className="w-5 h-5"/>
                                                <span>Создать цикл</span>
                                            </button>
                                        ) : (
                                            <div className="space-y-2 border border-purple-500 p-2 rounded bg-purple-900/20">
                                                <p className="text-xs text-purple-300 font-semibold text-center">РЕЖИМ ЗАПИСИ</p>
                                                <p className="text-[10px] text-gray-300 text-center">
                                                    Выберите линии контура и установленные инструменты на чертеже.
                                                </p>
                                                <div className="flex space-x-2">
                                                    <button onClick={() => setTeachMode(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 py-1 rounded text-sm">Отмена</button>
                                                    <button onClick={onSaveTeachCycle} className="flex-1 bg-green-600 hover:bg-green-500 py-1 rounded text-sm font-bold">Сохранить</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase">Список циклов</h4>
                                        <div className="max-h-60 overflow-y-auto space-y-1">
                                            {teachCycles.map(cycle => (
                                                <div key={cycle.id} className="bg-gray-800 p-2 rounded flex justify-between items-center group">
                                                    <div>
                                                        <div className="text-sm font-semibold">{cycle.name}</div>
                                                        <div className="text-[10px] text-gray-500">Sym: {cycle.symmetry}</div>
                                                    </div>
                                                    <button onClick={() => onDeleteTeachCycle(cycle.id)} className="text-gray-500 hover:text-red-500">
                                                        <TrashIcon className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            ))}
                                            {teachCycles.length === 0 && <p className="text-center text-xs text-gray-500 py-2">Нет сохраненных циклов</p>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

             {mode === AppMode.Nesting && activeNest && (
                <div className="flex flex-col h-full">
                    <h2 className="text-lg font-semibold mb-2 border-b border-gray-500 pb-2">Параметры Раскроя</h2>
                    <div className="flex-1 overflow-hidden">
                        {onUpdateNestingSettings && (
                            <NestingSidebarPanel 
                                activeNest={activeNest} 
                                allParts={parts} 
                                onSettingsChange={onUpdateNestingSettings} 
                            />
                        )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-600 space-y-3 flex-none">
                        <button onClick={onRunNesting} className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 p-3 rounded-md shadow-lg font-bold text-white">
                            <PlayIcon className="w-5 h-5"/>
                            <span>Выполнить Раскрой</span>
                        </button>
                        
                        <button onClick={onClearNest} className="w-full flex items-center justify-center space-x-2 bg-red-900/50 hover:bg-red-800 p-2 rounded-md text-red-200 border border-red-800">
                            <TrashIcon className="w-4 h-4"/>
                            <span>Сбросить результаты</span>
                        </button>
                    </div>
                    
                    {selectedNestPartId && (
                         <div className="bg-gray-800 p-2 rounded mt-3 border border-gray-600">
                             <p className="text-xs text-center text-gray-400 mb-1">Корректировка позиции</p>
                             <div className="grid grid-cols-3 gap-1 mb-2">
                                 <div></div>
                                 <button onClick={() => onMoveNestPart && onMoveNestPart(selectedNestPartId, 0, -5)} className="bg-gray-600 hover:bg-gray-500 p-1 rounded">▲</button>
                                 <div></div>
                                 <button onClick={() => onMoveNestPart && onMoveNestPart(selectedNestPartId, -5, 0)} className="bg-gray-600 hover:bg-gray-500 p-1 rounded">◄</button>
                                 <button onClick={() => onRotateNestPart && onRotateNestPart(selectedNestPartId)} className="bg-blue-600 hover:bg-blue-500 p-1 rounded text-xs font-bold">↻</button>
                                 <button onClick={() => onMoveNestPart && onMoveNestPart(selectedNestPartId, 5, 0)} className="bg-gray-600 hover:bg-gray-500 p-1 rounded">►</button>
                                 <div></div>
                                 <button onClick={() => onMoveNestPart && onMoveNestPart(selectedNestPartId, 0, 5)} className="bg-gray-600 hover:bg-gray-500 p-1 rounded">▼</button>
                                 <div></div>
                             </div>
                         </div>
                    )}
                </div>
            )}
        </aside>
    );
};
