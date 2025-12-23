
/**
 * ОТВЕТСТВЕННОСТЬ: Интерфейс для настройки отступов, прижимов и упоров.
 */
import React from 'react';
import { NestingSettings } from '../../types';
import { ModalInputField } from '../common/InputField';

const STOP_DEFINITIONS: Record<number, { min: number, max: number, label: string }> = {
    1: { min: 420, max: 2080, label: 'Упор 1 (Стандарт)' },
    2: { min: 83, max: 1743, label: 'Упор 2 (L <= 1900)' },
    3: { min: 0, max: 1660, label: 'Упор 3 (L <= 1360)' },
    4: { min: 0, max: 1660, label: 'Упор 4 (L < 750)' },
};

const resolveAutoStop = (width: number) => {
    if (width < 750) return 4;
    if (width <= 1360) return 3;
    if (width <= 1900) return 2;
    return 1;
};

interface GlobalParametersTabProps {
    settings: NestingSettings;
    updateSettings: (u: Partial<NestingSettings>) => void;
}

export const GlobalParametersTab: React.FC<GlobalParametersTabProps> = ({ settings, updateSettings }) => {
    const activeSheet = settings.availableSheets.find(s => s.id === settings.activeSheetId) || settings.availableSheets[0];
    const sheetWidth = activeSheet ? activeSheet.width : 2560;
    const activeStopId = settings.loadingStopId === 0 ? resolveAutoStop(sheetWidth) : settings.loadingStopId;
    const activeStopInfo = STOP_DEFINITIONS[activeStopId];

    const updateClamp = (index: number, value: string) => {
        const newClamps = [...settings.clampPositions];
        newClamps[index] = parseFloat(value) || 0;
        updateSettings({ clampPositions: newClamps });
    };

    const validateClamp = (pos: number, index: number, allClamps: number[]): string | null => {
        if (!pos) return null;
        if (pos < activeStopInfo.min || pos > activeStopInfo.max) return `Выход за пределы (${activeStopInfo.min}-${activeStopInfo.max})`;
        for (let i = 0; i < allClamps.length; i++) {
            if (i === index || !allClamps[i]) continue;
            if (Math.abs(pos - allClamps[i]) < 150) return `Конфликт с зажимом ${i+1} (<150мм)`;
        }
        return null;
    };

    return (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Отступы между деталями</legend>
                    <div className="flex space-x-4">
                        <ModalInputField label="По X (мм)" type="number" value={settings.partSpacingX} onChange={e => updateSettings({partSpacingX: parseFloat(e.target.value) || 0})} />
                        <ModalInputField label="По Y (мм)" type="number" value={settings.partSpacingY} onChange={e => updateSettings({partSpacingY: parseFloat(e.target.value) || 0})} />
                    </div>
                </fieldset>
                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Поля листа</legend>
                    <div className="grid grid-cols-2 gap-4">
                        {(['sheetMarginTop', 'sheetMarginBottom', 'sheetMarginLeft', 'sheetMarginRight'] as const).map(field => (
                            <ModalInputField key={field} label={field.replace('sheetMargin', '')} type="number" value={settings[field]} onChange={e => updateSettings({ [field]: parseFloat(e.target.value) || 0 })} />
                        ))}
                    </div>
                </fieldset>
            </div>
            <div className="space-y-4">
                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Прижимы и Упоры</legend>
                    <div className="mb-4 bg-gray-700/30 p-2 rounded">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Выбор Упора</label>
                        <select value={settings.loadingStopId} onChange={(e) => updateSettings({ loadingStopId: parseInt(e.target.value) })} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200">
                            <option value={0}>Автоматически</option>
                            {[1, 2, 3, 4].map(id => <option key={id} value={id}>{STOP_DEFINITIONS[id].label}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {settings.clampPositions.map((c, i) => (
                            <div key={i}>
                                <ModalInputField label={`Поз. ${i+1}`} type="number" value={c || ''} onChange={e => updateClamp(i, e.target.value)} />
                                {validateClamp(c, i, settings.clampPositions) && <p className="text-[10px] text-red-400 mt-1">{validateClamp(c, i, settings.clampPositions)}</p>}
                            </div>
                        ))}
                    </div>
                </fieldset>
                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300 text-sm">Направление</legend>
                    <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
                        {[6, 7, 8, 3, 4, 5, 0, 1, 2].map(i => (
                            <label key={i} className={`flex items-center justify-center w-6 h-6 rounded-full cursor-pointer ${settings.nestingDirection === i ? 'bg-blue-500' : 'bg-gray-700'}`}>
                                <input type="radio" name="dir" value={i} checked={settings.nestingDirection === i} onChange={() => updateSettings({nestingDirection: i})} className="hidden" />
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>
        </div>
    );
};
