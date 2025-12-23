
/**
 * ОТВЕТСТВЕННОСТЬ: Оркестратор ручной пробивки.
 * Сохраняет обратную совместимость API для хука useAppLogic.
 */
import { useCallback } from 'react';
import { Part, Tool, Point, ManualPunchMode, SnapMode, PlacedTool, NibbleSettings, DestructSettings } from '../types';
import { ProcessedGeometry, findSnapPoint } from '../services/geometry';
import { useManualPunchState } from './editor/useManualPunchState';
import { useSinglePunchHandler } from './editor/useSinglePunchHandler';
import { useNibbleHandler } from './editor/useNibbleHandler';
import { useDestructHandler } from './editor/useDestructHandler';

interface UseManualPunchProps {
    activePart: Part | null;
    activePartProcessedGeometry: ProcessedGeometry | null;
    selectedTool: Tool | null;
    manualPunchMode: ManualPunchMode;
    punchOrientation: number;
    punchOffset: number;
    snapMode: SnapMode;
    nibbleSettings: NibbleSettings;
    destructSettings: DestructSettings;
    onAddPunches: (punches: Omit<PlacedTool, 'id'>[]) => void;
    setSelectedPunchId: (id: string | null) => void;
}

export const useManualPunch = ({
    activePart,
    activePartProcessedGeometry,
    selectedTool,
    manualPunchMode,
    punchOrientation,
    punchOffset,
    snapMode,
    nibbleSettings,
    destructSettings,
    onAddPunches,
    setSelectedPunchId
}: UseManualPunchProps) => {
    
    const state = useManualPunchState();
    const { handleSinglePunch } = useSinglePunchHandler();
    const { handleNibble } = useNibbleHandler();
    const { handleDestruct } = useDestructHandler();

    const handleCanvasClick = useCallback((rawPoint: Point) => {
        // Инверсия Y: View (SVG) -> Model (Cartesian Y-Up)
        const point = { x: rawPoint.x, y: -rawPoint.y };

        setSelectedPunchId(null);
        if (!selectedTool || !activePart) return;

        switch(manualPunchMode) {
            case ManualPunchMode.Punch:
                handleSinglePunch(point, { 
                    activePart, processedGeometry: activePartProcessedGeometry, 
                    selectedTool, punchOrientation, punchOffset, snapMode, onAddPunches 
                });
                break;
            
            case ManualPunchMode.Nibble:
                handleNibble(point, { 
                    activePart, processedGeometry: activePartProcessedGeometry, 
                    selectedTool, punchOrientation, nibbleSettings, onAddPunches 
                });
                break;

            case ManualPunchMode.Destruct:
                handleDestruct(point, {
                    processedGeometry: activePartProcessedGeometry,
                    selectedTool, destructSettings,
                    punchCreationStep: state.punchCreationStep,
                    punchCreationPoints: state.punchCreationPoints,
                    setStep: state.setPunchCreationStep,
                    setPoints: state.setPunchCreationPoints,
                    onAddPunches
                });
                break;
        }
    }, [
        manualPunchMode, activePart, activePartProcessedGeometry, selectedTool, 
        punchOrientation, punchOffset, snapMode, nibbleSettings, destructSettings,
        state.punchCreationStep, state.punchCreationPoints,
        handleSinglePunch, handleNibble, handleDestruct, onAddPunches, setSelectedPunchId
    ]);

    return { 
        handleCanvasClick, 
        punchCreationStep: state.punchCreationStep, 
        punchCreationPoints: state.punchCreationPoints, 
        resetManualState: state.resetManualState,
        setPunchCreationPoints: state.setPunchCreationPoints,
        setPunchCreationStep: state.setPunchCreationStep
    };
};
