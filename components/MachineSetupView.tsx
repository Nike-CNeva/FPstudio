
import React from 'react';
import { MachineSettings } from '../types';
import { SettingsIcon, SaveIcon } from './Icons';
import { ModalInputField } from './common/InputField';

interface MachineSetupViewProps {
    settings: MachineSettings;
    onUpdate: (settings: MachineSettings) => void;
}

export const MachineSetupView: React.FC<MachineSetupViewProps> = ({ settings, onUpdate }) => {
    
    const handleChange = (field: keyof MachineSettings, value: string | number) => {
        onUpdate({ ...settings, [field]: value });
    };

    return (
        <div className="flex-1 bg-gray-800 p-8 flex flex-col items-center">
            <div className="w-full max-w-4xl bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-700 bg-gray-800 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        <SettingsIcon className="w-8 h-8 mr-3 text-blue-500" />
                        Параметры Станка
                    </h2>
                    <span className="text-gray-400 font-mono text-sm">{settings.name}</span>
                </div>

                <div className="p-8 grid grid-cols-2 gap-8">
                    {/* Column 1: Limits */}
                    <div className="space-y-6">
                        <fieldset className="border border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-blue-400">Пределы перемещения (Travel Limits)</legend>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <h4 className="text-center text-sm font-bold text-gray-300">Ось X</h4>
                                    <ModalInputField label="Максимум (мм)" type="number" value={settings.xTravelMax} onChange={e => handleChange('xTravelMax', parseFloat(e.target.value))} />
                                    <ModalInputField label="Минимум (мм)" type="number" value={settings.xTravelMin} onChange={e => handleChange('xTravelMin', parseFloat(e.target.value))} />
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-center text-sm font-bold text-gray-300">Ось Y</h4>
                                    <ModalInputField label="Максимум (мм)" type="number" value={settings.yTravelMax} onChange={e => handleChange('yTravelMax', parseFloat(e.target.value))} />
                                    <ModalInputField label="Минимум (мм)" type="number" value={settings.yTravelMin} onChange={e => handleChange('yTravelMin', parseFloat(e.target.value))} />
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-blue-400">Скорости</legend>
                            <div className="grid grid-cols-2 gap-4">
                                <ModalInputField label="Макс. скорость (м/мин)" type="number" value={settings.maxSlewSpeed} onChange={e => handleChange('maxSlewSpeed', parseFloat(e.target.value))} />
                                <ModalInputField label="Вращение башни (об/мин)" type="number" value={settings.turretRotationSpeed} onChange={e => handleChange('turretRotationSpeed', parseFloat(e.target.value))} />
                            </div>
                        </fieldset>
                    </div>

                    {/* Column 2: Safety */}
                    <div className="space-y-6">
                        <fieldset className="border border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-blue-400">Зоны защиты (Safety Zones)</legend>
                            <div className="space-y-4">
                                <div className="bg-red-900/20 p-3 rounded border border-red-800/50">
                                    <h4 className="font-bold text-red-400 text-sm mb-2">Защита Прижимов</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <ModalInputField label="Зона X (мм)" type="number" value={settings.clampProtectionZoneX} onChange={e => handleChange('clampProtectionZoneX', parseFloat(e.target.value))} />
                                        <ModalInputField label="Зона Y (мм)" type="number" value={settings.clampProtectionZoneY} onChange={e => handleChange('clampProtectionZoneY', parseFloat(e.target.value))} />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">Безопасное расстояние вокруг каждого захвата.</p>
                                </div>

                                <div className="bg-yellow-900/20 p-3 rounded border border-yellow-800/50">
                                    <h4 className="font-bold text-yellow-400 text-sm mb-2">Мертвая зона Y</h4>
                                    <ModalInputField label="Расстояние от захватов (мм)" type="number" value={settings.deadZoneY} onChange={e => handleChange('deadZoneY', parseFloat(e.target.value))} />
                                    <p className="text-xs text-gray-400 mt-2">Область, где пробивка невозможна без перехвата.</p>
                                </div>
                            </div>
                        </fieldset>
                        
                        <div className="flex items-center justify-center pt-8">
                            <div className="w-40 h-40 border-2 border-dashed border-gray-600 rounded flex flex-col items-center justify-center text-gray-500">
                                <span>Preview Area</span>
                                <span className="text-xs">(Not implemented)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
