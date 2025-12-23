
/**
 * ОТВЕТСТВЕННОСТЬ: Хранение промежуточного состояния ввода (точки, шаги).
 * Используется для команд, требующих более одного клика (например, Destruct).
 */
import { useState, useCallback } from 'react';
import { Point } from '../../types';

export const useManualPunchState = () => {
    const [punchCreationStep, setPunchCreationStep] = useState(0);
    const [punchCreationPoints, setPunchCreationPoints] = useState<Point[]>([]);

    const resetManualState = useCallback(() => {
        setPunchCreationStep(0);
        setPunchCreationPoints([]);
    }, []);

    return {
        punchCreationStep,
        setPunchCreationStep,
        punchCreationPoints,
        setPunchCreationPoints,
        resetManualState
    };
};
