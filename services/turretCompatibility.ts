import { Tool, StationConfig } from '../types';

/**
 * Проверяет физическую совместимость инструмента со станцией.
 * Для Multi-Tool обязательно указывается существующий слот 1–24.
 */
export const isToolCompatibleWithStation = (
    tool: Tool,
    station: StationConfig,
    mtIndex?: number | null
): boolean => {
    if (station.type === 'MT') {
        return tool.stationType === 'MT'
            && Number.isInteger(mtIndex)
            && (mtIndex as number) >= 1
            && (mtIndex as number) <= 24;
    }

    if (tool.stationType === 'MT' || tool.toolSize !== station.type) {
        return false;
    }

    // Инструмент, требующий Auto Index, нельзя ставить в обычную станцию.
    return !tool.isAutoIndex || station.isAutoIndex;
};
