
/**
 * ОТВЕТСТВЕННОСТЬ: Управление двухэтапным вводом для очистки окон.
 */
import { useCallback } from 'react';
import { Tool, Point, DestructSettings, PlacedTool } from '../../types';
import { findSnapPoint, ProcessedGeometry } from '../../services/geometry';
import { generateDestructPunches } from '../../services/punching';

interface DestructParams {
    processedGeometry: ProcessedGeometry | null;
    selectedTool: Tool | null;
    destructSettings: DestructSettings;
    punchCreationStep: number;
    punchCreationPoints: Point[];
    setStep: (s: number) => void;
    setPoints: (p: Point[]) => void;
    onAddPunches: (punches: Omit<PlacedTool, 'id'>[]) => void;
}

export const useDestructHandler = () => {
    const handleDestruct = useCallback((point: Point, params: DestructParams) => {
        const { processedGeometry, selectedTool, destructSettings, punchCreationStep, punchCreationPoints, setStep, setPoints, onAddPunches } = params;
        if (!selectedTool) return;

        const snapResult = findSnapPoint(point, processedGeometry, 'vertex' as any); // Force vertex snap for destruct bounds
        const finalPoint = snapResult?.point ?? point;

        if (punchCreationStep === 0) {
            setPoints([finalPoint]);
            setStep(1);
        } else {
            const [startPoint] = punchCreationPoints;
            const newPunches = generateDestructPunches(startPoint, finalPoint, selectedTool, destructSettings);
            onAddPunches(newPunches);
            setStep(0);
            setPoints([]);
        }
    }, []);

    return { handleDestruct };
};
