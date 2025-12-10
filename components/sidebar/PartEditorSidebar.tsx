
import React, { useRef, ChangeEvent } from 'react';
import { Part, Tool, ManualPunchMode, SnapMode, NibbleSettings, DestructSettings, PlacedTool, TeachCycle, NestLayout } from '../../types';
import { FolderIcon, SaveIcon, CodeIcon, PlusIcon, TrashIcon } from '../Icons';
import { SidebarTabButton } from '../common/Button';
import { 
    PartPropertiesForm, 
    PlacedPunchesPanel, 
    ManualPunchModeSelector, 
    NibbleSettingsPanel, 
    DestructSettingsPanel, 
    PlacementSettings 
} from './SidebarPanels';

interface PartEditorSidebarProps {
    activePart: Part | null;
    parts: Part[]; // For listing? Or not used here.
    tools: Tool[];
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
    onClearAllPunches: () => void;
    punchOrientation: number;
    setPunchOrientation: (angle: number) => void;
    onCyclePunchOrientation: () => void;
    snapMode: SnapMode;
    setSnapMode: (mode: SnapMode) => void;
    punchOffset: number; 
    setPunchOffset: (offset: number) => void;
    
    nibbleSettings: NibbleSettings;
    setNibbleSettings: (settings: NibbleSettings) => void;
    destructSettings: DestructSettings;
    setDestructSettings: (settings: DestructSettings) => void;
    
    // Actions
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
}

export const PartEditorSidebar: React.FC<PartEditorSidebarProps> = ({
    activePart, onFileUpload, tools,
    manualPunchMode, setManualPunchMode, selectedToolId,
    selectedPunchId, setSelectedPunchId, onDeletePunch, onUpdatePunch, onClearAllPunches,
    punchOrientation, setPunchOrientation, onCyclePunchOrientation,
    snapMode, setSnapMode, punchOffset, setPunchOffset,
    nibbleSettings, setNibbleSettings, destructSettings, setDestructSettings,
    onSavePartAsScript, onSavePartAsStatic, onUpdateActivePart, onClosePart,
    teachMode, setTeachMode, onSaveTeachCycle, teachCycles, onDeleteTeachCycle
}) => {
    const [sidebarTab, setSidebarTab] = React.useState<'properties' | 'punching' | 'teach'>('properties');
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
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
                                onClearAll={onClearAllPunches}
                            />
                            <ManualPunchModeSelector manualPunchMode={manualPunchMode} setManualPunchMode={setManualPunchMode} />
                            {manualPunchMode === ManualPunchMode.Nibble && <NibbleSettingsPanel nibbleSettings={nibbleSettings} setNibbleSettings={setNibbleSettings} />}
                            {manualPunchMode === ManualPunchMode.Destruct && <DestructSettingsPanel destructSettings={destructSettings} setDestructSettings={setDestructSettings} />}
                            <PlacementSettings 
                                punchOrientation={punchOrientation}
                                setPunchOrientation={setPunchOrientation}
                                onCyclePunchOrientation={onCyclePunchOrientation}
                                selectedToolId={selectedToolId}
                                tools={tools}
                                manualPunchMode={manualPunchMode}
                                snapMode={snapMode}
                                setSnapMode={setSnapMode}
                                punchOffset={punchOffset}
                                setPunchOffset={setPunchOffset}
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
    );
};
