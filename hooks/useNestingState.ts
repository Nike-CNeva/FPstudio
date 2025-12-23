
/**
 * ОТВЕТСТВЕННОСТЬ: Процесс раскроя, прогресс, выбор листа и ID активного раскроя.
 * ДОЛЖЕН СОДЕРЖАТЬ: activeNestId, activeSheetIndex, progress, status, selectedNestPartId.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: Логику редактора или симуляции.
 */
import { useState } from 'react';
import { NestLayout } from '../types';

export const useNestingState = (initialNestId: string | null) => {
    const [activeNestId, setActiveNestId] = useState<string | null>(initialNestId);
    const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
    const [selectedNestPartId, setSelectedNestPartId] = useState<string | null>(null);
    const [isNestingProcessing, setIsNestingProcessing] = useState(false);
    const [nestingProgress, setNestingProgress] = useState(0);
    const [nestingStatus, setNestingStatus] = useState('');

    return {
        activeNestId, setActiveNestId,
        activeSheetIndex, setActiveSheetIndex,
        selectedNestPartId, setSelectedNestPartId,
        isNestingProcessing, setIsNestingProcessing,
        nestingProgress, setNestingProgress,
        nestingStatus, setNestingStatus
    };
};
