
import React, { useState } from 'react';
import { AutoPunchSettings, TurretLayout } from '../types';
import { PlayIcon } from './Icons';
import { ToolSourcePanel } from './auto-punch/ToolSourcePanel';
import { GeometrySettingsPanel } from './auto-punch/GeometrySettingsPanel';
import { MicroJointsPanel } from './auto-punch/MicroJointsPanel';

interface AutoPunchSettingsModalProps { 
    onClose: () => void; 
    onApply: (settings: AutoPunchSettings) => void;
    turretLayouts: TurretLayout[];
}

/**
 * **AutoPunchSettingsModal**
 * 
 * Configuration dialog for the Automatic Tool Placement algorithm.
 * 
 * **Features:**
 * - **Tool Source:** Select whether to use all tools in the library or only those currently mounted on a specific Turret Layout.
 * - **Geometry:** Configure overlaps, extensions, and scallop height for nibbling.
 * - **Micro-joints:** Settings to automatically leave gaps in the contouring path to keep the part attached to the sheet.
 * 
 * @param {AutoPunchSettingsModalProps} props
 */
export const AutoPunchSettingsModal: React.FC<AutoPunchSettingsModalProps> = ({ onClose, onApply, turretLayouts }): React.JSX.Element => {
    
    const [settings, setSettings] = useState<AutoPunchSettings>({
        toolSourceType: 'library',
        turretLayoutId: turretLayouts[0]?.id || '',
        useTeachCycles: true,
        
        extension: 1.0,
        overlap: 0.7,
        scallopHeight: 0.1,
        vertexTolerance: 2.5,
        minToolUtilization: 0, 
        
        toleranceRound: 2.5,
        toleranceRectLength: 2.5,
        toleranceRectWidth: 2.5,

        microJointsEnabled: false,
        microJointType: 'auto',
        microJointLength: 1.5,
        microJointDistance: 0,
    });

    const handleUpdate = (updates: Partial<AutoPunchSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
    };

    const handleApply = () => {
        onApply(settings);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col border border-gray-700 max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white">Авто-расстановка (Autotool)</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                    
                    <ToolSourcePanel 
                        sourceType={settings.toolSourceType}
                        turretLayoutId={settings.turretLayoutId || ''}
                        useTeachCycles={settings.useTeachCycles}
                        turretLayouts={turretLayouts}
                        onUpdate={handleUpdate}
                    />

                    <GeometrySettingsPanel 
                        overlap={settings.overlap}
                        extension={settings.extension}
                        scallopHeight={settings.scallopHeight}
                        vertexTolerance={settings.vertexTolerance}
                        onUpdate={handleUpdate}
                    />

                    <MicroJointsPanel 
                        enabled={settings.microJointsEnabled}
                        type={settings.microJointType}
                        length={settings.microJointLength}
                        onUpdate={handleUpdate}
                    />
                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm text-white">Отмена</button>
                    <button onClick={handleApply} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2 text-sm font-bold shadow-lg text-white">
                        <PlayIcon className="w-4 h-4"/>
                        <span>Выполнить расстановку</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
