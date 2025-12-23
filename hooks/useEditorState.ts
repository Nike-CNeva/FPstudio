
/**
 * ГЛАВНЫЙ ХУК РЕДАКТОРА (Агрегатор)
 * Объединяет специализированные хуки состояния и подключает логику ручной пробивки.
 * Сохраняет интерфейс для useAppLogic.
 */
import { Tool, PlacedTool } from '../types';
import { useActivePartState } from './editor/useActivePartState';
import { usePunchToolState } from './editor/usePunchToolState';
import { usePunchSettingsState } from './editor/usePunchSettingsState';
import { useTeachState } from './editor/useTeachState';
import { useManualPunch } from './useManualPunch';

interface UseEditorStateProps {
    tools: Tool[];
    onAddPunches: (punches: Omit<PlacedTool, 'id'>[]) => void;
}

export const useEditorState = ({ tools, onAddPunches }: UseEditorStateProps) => {
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
