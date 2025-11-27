
import React from 'react';
import { AppMode } from '../types';
import { BoxIcon, CodeIcon, GridIcon, LayersIcon, TurretIcon, FolderIcon } from './Icons';
import { NavButton } from './common/Button';

interface HeaderProps {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
    onGenerateGCode: () => void;
    onOpenTurretConfig: () => void;
}

export const Header: React.FC<HeaderProps> = ({ mode, setMode, onGenerateGCode, onOpenTurretConfig }) => (
    <header className="flex items-center justify-between bg-gray-900 text-white p-2 shadow-md z-20">
        <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-blue-400">FP Studio</h1>
            <nav className="flex items-center space-x-1">
                <NavButton icon={<BoxIcon className="w-5 h-5"/>} label="Редактор" active={mode === AppMode.PartEditor} onClick={() => setMode(AppMode.PartEditor)} />
                <NavButton icon={<FolderIcon className="w-5 h-5"/>} label="Библиотека Деталей" active={mode === AppMode.PartLibrary} onClick={() => setMode(AppMode.PartLibrary)} />
                <NavButton icon={<CodeIcon className="w-5 h-5"/>} label="Скрипты" active={mode === AppMode.ScriptLibrary} onClick={() => setMode(AppMode.ScriptLibrary)} />
                <NavButton icon={<GridIcon className="w-5 h-5"/>} label="Раскрой" active={mode === AppMode.Nesting} onClick={() => setMode(AppMode.Nesting)} />
                <NavButton icon={<LayersIcon className="w-5 h-5"/>} label="Инструмент" active={mode === AppMode.ToolLibrary} onClick={() => setMode(AppMode.ToolLibrary)} />
                <NavButton icon={<TurretIcon className="w-5 h-5"/>} label="Револьвер" active={mode === AppMode.TurretSetup} onClick={() => setMode(AppMode.TurretSetup)} />
            </nav>
        </div>
        <div className="flex items-center space-x-3">
             <button onClick={onGenerateGCode} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={mode !== AppMode.Nesting}>
                <CodeIcon className="w-5 h-5"/>
                <span>Постпроцессор</span>
            </button>
        </div>
    </header>
);
