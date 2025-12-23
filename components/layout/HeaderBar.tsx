
/**
 * ОТВЕТСТВЕННОСТЬ: Верхняя навигационная панель.
 */
import React from 'react';
import { AppMode } from '../../types';
import { Header } from '../Header';

interface HeaderBarProps {
    mode: AppMode;
    setMode: (m: AppMode) => void;
    onGenerateGCode: () => void;
    onOptimizePath: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ mode, setMode, onGenerateGCode, onOptimizePath }) => (
    <Header 
        mode={mode} 
        setMode={setMode} 
        onGenerateGCode={onGenerateGCode} 
        onOptimizePath={onOptimizePath}
        onOpenTurretConfig={() => setMode(AppMode.TurretSetup)}
    />
);
