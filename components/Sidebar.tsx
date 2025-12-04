
import React, { ChangeEvent } from 'react';
import { AppMode, NestLayout, Part, Tool, ManualPunchMode, SnapMode, NibbleSettings, DestructSettings, PlacedTool, TeachCycle, ScheduledPart } from '../../types';
import { PartEditorSidebar } from './sidebar/PartEditorSidebar';
import { NestingSidebarPanel } from './sidebar/NestingSidebarPanel';
import { TrashIcon, PlayIcon } from './Icons';

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
    onClearAllPunches: () => void;
    punchOrientation: number;
    setPunchOrientation: (angle: number) => void;
    onCyclePunchOrientation: () => void;
    snapMode: SnapMode;
    setSnapMode: (mode: SnapMode) => void;
    punchOffset: number; 
    setPunchOffset: (offset: number) => void;
    
    // Nesting Settings Prop
    onUpdateNestingSettings?: (settings: NestLayout['settings'], scheduledParts: ScheduledPart[]) => void;
    onUpdateNestMetadata?: (metadata: { customer?: string, workOrder?: string }) => void;
    
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
    isNestingProcessing?: boolean; 
    onClearNest?: () => void;
    selectedNestPartId?: string | null;
    onMoveNestPart?: (id: string, dx: number, dy: number) => void;
    onRotateNestPart?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
    const { 
        mode, activePart, tools, activeNest, parts,
        onRunNesting, isNestingProcessing, onClearNest, selectedNestPartId, onMoveNestPart, onRotateNestPart,
        onUpdateNestingSettings, onUpdateNestMetadata
    } = props;

    return (
        <aside className="w-80 bg-gray-700 p-4 flex flex-col space-y-4 overflow-y-auto border-r border-gray-600">
            {mode === AppMode.PartEditor && (
                <PartEditorSidebar 
                    activePart={activePart}
                    parts={parts}
                    tools={tools}
                    onFileUpload={props.onFileUpload}
                    manualPunchMode={props.manualPunchMode}
                    setManualPunchMode={props.setManualPunchMode}
                    selectedToolId={props.selectedToolId}
                    setSelectedToolId={props.setSelectedToolId}
                    selectedPunchId={props.selectedPunchId}
                    setSelectedPunchId={props.setSelectedPunchId}
                    onDeletePunch={props.onDeletePunch}
                    onUpdatePunch={props.onUpdatePunch}
                    onClearAllPunches={props.onClearAllPunches}
                    punchOrientation={props.punchOrientation}
                    setPunchOrientation={props.setPunchOrientation}
                    onCyclePunchOrientation={props.onCyclePunchOrientation}
                    snapMode={props.snapMode}
                    setSnapMode={props.setSnapMode}
                    nibbleSettings={props.nibbleSettings}
                    setNibbleSettings={props.setNibbleSettings}
                    destructSettings={props.destructSettings}
                    setDestructSettings={props.setDestructSettings}
                    onSavePartAsScript={props.onSavePartAsScript}
                    onSavePartAsStatic={props.onSavePartAsStatic}
                    onUpdateActivePart={props.onUpdateActivePart}
                    onClosePart={props.onClosePart}
                    teachMode={props.teachMode}
                    setTeachMode={props.setTeachMode}
                    onSaveTeachCycle={props.onSaveTeachCycle}
                    teachCycles={props.teachCycles}
                    onDeleteTeachCycle={props.onDeleteTeachCycle}
                />
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
                                onMetadataChange={onUpdateNestMetadata}
                            />
                        )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-600 space-y-3 flex-none">
                        <button 
                            onClick={onRunNesting} 
                            disabled={isNestingProcessing}
                            className={`w-full flex items-center justify-center space-x-2 p-3 rounded-md shadow-lg font-bold text-white transition-all ${isNestingProcessing ? 'bg-yellow-600 cursor-progress' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {isNestingProcessing ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Выполняется...</span>
                                </>
                            ) : (
                                <>
                                    <PlayIcon className="w-5 h-5"/>
                                    <span>Выполнить Раскрой</span>
                                </>
                            )}
                        </button>
                        
                        <button onClick={onClearNest} disabled={isNestingProcessing} className="w-full flex items-center justify-center space-x-2 bg-red-900/50 hover:bg-red-800 p-2 rounded-md text-red-200 border border-red-800 disabled:opacity-50">
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
