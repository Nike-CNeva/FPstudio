
/**
 * ОТВЕТСТВЕННОСТЬ: Параметры шага, нахлеста и режимов (Nibbling, Destruct).
 */
import { useState } from 'react';
import { ManualPunchMode, NibbleSettings, DestructSettings } from '../../types';

export const usePunchSettingsState = () => {
    const [manualPunchMode, setManualPunchMode] = useState<ManualPunchMode>(ManualPunchMode.Punch);
    
    const [nibbleSettings, setNibbleSettings] = useState<NibbleSettings>({ 
        extensionStart: 0, 
        extensionEnd: 0, 
        minOverlap: 1, 
        hitPointMode: 'offset', 
        toolPosition: 'long' 
    });

    const [destructSettings, setDestructSettings] = useState<DestructSettings>({ 
        overlap: 0.7, 
        scallop: 0.25, 
        notchExpansion: 0.25 
    });

    return {
        manualPunchMode, setManualPunchMode,
        nibbleSettings, setNibbleSettings,
        destructSettings, setDestructSettings
    };
};
