
/**
 * ГЛАВНЫЙ ХУК РЕДАКТОРА (Агрегатор)
 * Объединяет специализированные хуки состояния и подключает логику ручной пробивки.
 * Сохраняет интерфейс для useAppLogic.
 */
import React from 'react';
import { Tool, PlacedTool, Part, ManualPunchMode, SnapMode, NibbleSettings, DestructSettings } from '../types';
import { useActivePartState } from './editor/useActivePartState';
import { usePunchToolState } from './editor/usePunchToolState';
import { usePunchSettingsState } from './editor/usePunchSettingsState';
import { useTeachState } from './editor/useTeachState';
import { useManualPunch } from './useManualPunch';
import { ProcessedGeometry } from '../services/geometry';

interface UseEditorStateProps {
    tools: Tool[];
    onAddPunches: (punches: Omit<PlacedTool, 'id'>[]) => void;
}

export interface UseEditorStateResult {
    activePart: Part | null;
    setActivePart: (part: Part | null | ((prev: Part | null) => Part | null)) => void;
    activePartProcessedGeometry: ProcessedGeometry | null;
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    selectedPunchId: string | null;
    setSelectedPunchId: (id: string | null) => void;
    punchOrientation: number;
    setPunchOrientation: (angle: number) => void;
    snapMode: SnapMode;
    setSnapMode: (mode: SnapMode) => void;
    punchOffset: number;
    setPunchOffset: (offset: number) => void;
    selectedTool: Tool | null;
    manualPunchMode: ManualPunchMode;
    setManualPunchMode: (mode: ManualPunchMode) => void;
    nibbleSettings: NibbleSettings;
    setNibbleSettings: (settings: NibbleSettings) => void;
    destructSettings: DestructSettings;
    setDestructSettings: (settings: DestructSettings) => void;
    teachMode: boolean;
    setTeachMode: (val: boolean) => void;
    selectedSegmentIds: number[];
    setSelectedSegmentIds: React.Dispatch<React.SetStateAction<number[]>>;
    selectedTeachPunchIds: string[];
    setSelectedTeachPunchIds: React.Dispatch<React.SetStateAction<string[]>>;
    manualPunch: ReturnType<typeof useManualPunch>;
}

/**
 * **useEditorState**
 * 
 * Aggregates all state related to the single Part Editor view.
 * Splits responsibilities into sub-hooks (`useActivePartState`, `usePunchToolState`, etc.)
 * but exposes a unified API for the `App` component.
 * 
 * **Purpose:**
 * - Manages the `ActivePart` currently being edited.
 * - Tracks the selected Tool and Punch configuration (orientation, snap).
 * - Manages the specific `ManualPunchMode` (Single, Nibble, Destruct).
 * - Integrates the `useManualPunch` logic handler.
 * 
 * @param {UseEditorStateProps} props
 * @returns {UseEditorStateResult}
 */
export const useEditorState = ({ tools, onAddPunches }: UseEditorStateProps): UseEditorStateResult => {
    // 1. Распределенное состояние
    const part = useActivePartState();
    const tool = usePunchToolState(tools);
    const settings = usePunchSettingsState();
    const teach = useTeachState();

    // 2. Подключение логики кликов (Manual Punch)
    const manualPunch = useManualPunch({
        activePart: part.activePart,
        activePartProcessedGeometry: part.activePartProcessedGeometry,
        selectedTool: tool.selectedTool,
        manualPunchMode: settings.manualPunchMode,
        punchOrientation: tool.punchOrientation,
        punchOffset: tool.punchOffset,
        snapMode: tool.snapMode,
        nibbleSettings: settings.nibbleSettings,
        destructSettings: settings.destructSettings,
        onAddPunches,
        setSelectedPunchId: tool.setSelectedPunchId
    });

    // 3. Сборка единого объекта (Backward Compatibility)
    return {
        // Состояние детали
        activePart: part.activePart,
        setActivePart: part.setActivePart,
        activePartProcessedGeometry: part.activePartProcessedGeometry,

        // Состояние выбора инструмента
        selectedToolId: tool.selectedToolId,
        setSelectedToolId: tool.setSelectedToolId,
        selectedPunchId: tool.selectedPunchId,
        setSelectedPunchId: tool.setSelectedPunchId,
        punchOrientation: tool.punchOrientation,
        setPunchOrientation: tool.setPunchOrientation,
        snapMode: tool.snapMode,
        setSnapMode: tool.setSnapMode,
        punchOffset: tool.punchOffset,
        setPunchOffset: tool.setPunchOffset,
        selectedTool: tool.selectedTool,

        // Настройки режимов
        manualPunchMode: settings.manualPunchMode,
        setManualPunchMode: settings.setManualPunchMode,
        nibbleSettings: settings.nibbleSettings,
        setNibbleSettings: settings.setNibbleSettings,
        destructSettings: settings.destructSettings,
        setDestructSettings: settings.setDestructSettings,

        // Режим обучения
        teachMode: teach.teachMode,
        setTeachMode: teach.setTeachMode,
        selectedSegmentIds: teach.selectedSegmentIds,
        setSelectedSegmentIds: teach.setSelectedSegmentIds,
        selectedTeachPunchIds: teach.selectedTeachPunchIds,
        setSelectedTeachPunchIds: teach.setSelectedTeachPunchIds,

        // Интеграция логики
        manualPunch
    };
};
