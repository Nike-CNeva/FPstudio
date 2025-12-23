
/**
 * ОТВЕТСТВЕННОСТЬ: Управление временным состоянием настроек раскроя до нажатия "OK".
 * ДОЛЖЕН СОДЕРЖАТЬ: Логику обновления настроек, списка деталей и смены вкладок.
 */
import { useState } from 'react';
import { NestLayout, ScheduledPart, NestingSettings } from '../types';

export const useNestingModalState = (activeNest: NestLayout) => {
    const [activeTab, setActiveTab] = useState<'global' | 'parts' | 'sheet'>('sheet');
    const [settings, setSettings] = useState<NestingSettings>(() => 
        JSON.parse(JSON.stringify(activeNest.settings))
    );
    const [scheduledParts, setScheduledParts] = useState<ScheduledPart[]>(() => 
        JSON.parse(JSON.stringify(activeNest.scheduledParts))
    );

    const updateSettings = (updates: Partial<NestingSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
    };

    return {
        activeTab, setActiveTab,
        settings, setSettings,
        updateSettings,
        scheduledParts, setScheduledParts
    };
};
