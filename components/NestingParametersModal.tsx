
import React from 'react';
import { Part, NestLayout, ScheduledPart } from '../types';
import { SidebarTabButton } from './common/Button';
import { useNestingModalState } from '../hooks/useNestingModalState';
import { GlobalParametersTab } from './nesting/GlobalParametersTab';
import { PartListTab } from './nesting/PartListTab';
import { MaterialSheetTab } from './nesting/MaterialSheetTab';

interface NestingParametersModalProps {
    onClose: () => void;
    onSave: (newSettings: NestLayout['settings'], newScheduledParts: ScheduledPart[]) => void;
    activeNest: NestLayout;
    allParts: Part[];
}

/**
 * КОРНЕВОЙ КОМПОНЕНТ: Nesting Parameters
 * Собирает вкладки и управляет процессом сохранения.
 */
export const NestingParametersModal: React.FC<NestingParametersModalProps> = ({ onClose, onSave, activeNest, allParts }) => {
    const { 
        activeTab, setActiveTab, 
        settings, setSettings, updateSettings, 
        scheduledParts, setScheduledParts 
    } = useNestingModalState(activeNest);

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl flex flex-col max-h-[95vh] border border-gray-600">
                <div className="flex justify-between items-center p-3 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Nesting parameters</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
                </div>
                
                <div className="flex border-b border-gray-700 px-4 bg-gray-800 pt-2">
                    <SidebarTabButton label="Global parameters" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
                    <SidebarTabButton label="Part list" active={activeTab === 'parts'} onClick={() => setActiveTab('parts')} />
                    <SidebarTabButton label="Material sheet list" active={activeTab === 'sheet'} onClick={() => setActiveTab('sheet')} />
                </div>

                <div className="p-6 overflow-y-auto bg-gray-800 flex-1 custom-scrollbar">
                    {activeTab === 'global' && <GlobalParametersTab settings={settings} updateSettings={updateSettings} />}
                    {activeTab === 'parts' && <PartListTab allParts={allParts} scheduledParts={scheduledParts} setScheduledParts={setScheduledParts} />}
                    {activeTab === 'sheet' && <MaterialSheetTab settings={settings} setSettings={setSettings} />}
                </div>

                <div className="p-3 bg-gray-900 flex justify-end items-center rounded-b-lg border-t border-gray-700 space-x-2">
                    <button onClick={() => onSave(settings, scheduledParts)} className="px-6 py-1 bg-gray-200 hover:bg-white text-black rounded-md text-xs font-bold border border-gray-400 shadow transition-all">OK</button>
                    <button onClick={onClose} className="px-6 py-1 bg-gray-200 hover:bg-white text-black rounded-md text-xs border border-gray-400 shadow transition-all">Cancel</button>
                </div>
            </div>
        </div>
    );
};
