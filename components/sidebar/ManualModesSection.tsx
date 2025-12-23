
import React from 'react';
import { ManualPunchMode, NibbleSettings, DestructSettings } from '../../types';
import { BoxIcon, SettingsIcon, TrashIcon } from '../Icons';
import { InputField } from '../common/InputField';

export const ManualPunchModeSelector: React.FC<{ mode: ManualPunchMode, setMode: (m: ManualPunchMode) => void }> = ({ mode, setMode }) => (
    <div className='border-b border-gray-600 pb-3 mb-3'>
        <h3 className="font-bold mb-2 text-gray-300">Режим вставки</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
             {[
                 { id: ManualPunchMode.Punch, label: 'Удар', icon: <BoxIcon /> },
                 { id: ManualPunchMode.Nibble, label: 'Высечка', icon: <SettingsIcon /> },
                 { id: ManualPunchMode.Destruct, label: 'Разруш.', icon: <TrashIcon /> }
             ].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} className={`flex flex-col items-center p-2 rounded-md transition-colors ${mode === m.id ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-600'}`}>
                    <div className="w-6 h-6 mb-1">{m.icon}</div>
                    <span>{m.label}</span>
                </button>
             ))}
        </div>
    </div>
);

export const NibbleSettingsPanel: React.FC<{ settings: NibbleSettings, setSettings: (s: NibbleSettings) => void }> = ({ settings, setSettings }) => (
    <div className="border-b border-gray-600 pb-3 mb-3 space-y-2">
        <h3 className="font-bold text-gray-300">Параметры высечки</h3>
        <div className="flex space-x-2">
            <InputField label="Start Ext" type="number" value={settings.extensionStart} onChange={e => setSettings({...settings, extensionStart: parseFloat(e.target.value)||0})} />
            <InputField label="End Ext" type="number" value={settings.extensionEnd} onChange={e => setSettings({...settings, extensionEnd: parseFloat(e.target.value)||0})} />
        </div>
        <InputField label="Нахлест (v)" type="number" value={settings.minOverlap} onChange={e => setSettings({...settings, minOverlap: parseFloat(e.target.value)||0})} />
    </div>
);

export const DestructSettingsPanel: React.FC<{ settings: DestructSettings, setSettings: (s: DestructSettings) => void }> = ({ settings, setSettings }) => (
    <div className="border-b border-gray-600 pb-3 mb-3 space-y-2">
        <h3 className="font-bold text-gray-300">Разрушение</h3>
        <div className="grid grid-cols-2 gap-2">
            <InputField label="Нахлест" type="number" value={settings.overlap} onChange={e => setSettings({...settings, overlap: parseFloat(e.target.value)||0})} />
            <InputField label="Гребешок" type="number" value={settings.scallop} onChange={e => setSettings({...settings, scallop: parseFloat(e.target.value)||0})} />
        </div>
    </div>
);
