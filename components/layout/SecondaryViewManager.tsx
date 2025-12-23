
/**
 * ОТВЕТСТВЕННОСТЬ: Переключение между полноэкранными представлениями (библиотеки, настройки).
 */
import React from 'react';
import { AppMode } from '../../types';
import { ToolLibraryView } from '../ToolLibraryView';
import { TurretSetupView } from '../TurretSetupView';
import { ScriptLibraryView } from '../ScriptLibraryView';
import { PartLibraryView } from '../PartLibraryView';
import { MachineSetupView } from '../MachineSetupView';

interface SecondaryViewManagerProps {
    mode: AppMode;
    data: any;
    handlers: any;
}

export const SecondaryViewManager: React.FC<SecondaryViewManagerProps> = ({ mode, data, handlers }) => {
    switch (mode) {
        case AppMode.PartLibrary:
            return <PartLibraryView {...data.partLibrary} {...handlers.partLibrary} />;
        case AppMode.ScriptLibrary:
            return <ScriptLibraryView {...data.scriptLibrary} {...handlers.scriptLibrary} />;
        case AppMode.ToolLibrary:
            return <ToolLibraryView {...data.toolLibrary} {...handlers.toolLibrary} />;
        case AppMode.TurretSetup:
            return <TurretSetupView {...data.turretSetup} {...handlers.turretSetup} />;
        case AppMode.MachineSetup:
            return <MachineSetupView {...data.machineSetup} {...handlers.machineSetup} />;
        default:
            return null;
    }
};
