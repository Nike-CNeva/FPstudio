
/**
 * ОТВЕТСТВЕННОСТЬ: Расчет позиции и угла одного удара с учетом Snap и геометрии.
 */
import { useCallback } from 'react';
import { Part, Tool, Point, SnapMode, PlacementSide, PlacedTool } from '../../types';
import { ProcessedGeometry, findSnapPoint, isPointInsideContour } from '../../services/geometry';
import { calculateEdgePlacement } from '../../services/placement';

interface SinglePunchParams {
    activePart: Part | null;
    processedGeometry: ProcessedGeometry | null;
    selectedTool: Tool | null;
    punchOrientation: number;
    punchOffset: number;
    snapMode: SnapMode;
    onAddPunches: (punches: Omit<PlacedTool, 'id'>[]) => void;
}

export const useSinglePunchHandler = () => {
    const handleSinglePunch = useCallback((point: Point, params: SinglePunchParams) => {
        const { activePart, processedGeometry, selectedTool, punchOrientation, punchOffset, snapMode, onAddPunches } = params;
        if (!selectedTool || !activePart) return;

        const snapResult = findSnapPoint(point, processedGeometry, snapMode);
        const finalPoint = snapResult?.point ?? point;

        // Режим: Центр фигуры (Отверстия)
        if (snapMode === SnapMode.ShapeCenter) {
            let rotation = punchOrientation;
            if (snapResult?.forceRotation !== undefined) {
                const holeAngle = snapResult.forceRotation;
                const isToolHorizontal = selectedTool.width >= selectedTool.height;
                rotation = isToolHorizontal ? holeAngle : (holeAngle + 90) % 360;
            }
            onAddPunches([{ toolId: selectedTool.id, x: finalPoint.x, y: finalPoint.y, rotation }]);
            return;
        }

        // Режим: Привязка к ребру/вершине
        const placementAngle = snapResult?.angle ?? 0;
        const snapTarget = snapResult?.snapTarget ?? 'middle';
        const wasNormalized = snapResult?.wasNormalized ?? false;

        // Выбираем сторону (внутри/снаружи), которая находится в отходе (Scrap)
        const placementA = calculateEdgePlacement(finalPoint, placementAngle, selectedTool, punchOrientation, punchOffset, snapTarget, wasNormalized, PlacementSide.Outside);
        const placementB = calculateEdgePlacement(finalPoint, placementAngle, selectedTool, punchOrientation, punchOffset, snapTarget, wasNormalized, PlacementSide.Inside);

        let finalPlacement = placementA;
        if (processedGeometry) {
            const isInsideA = isPointInsideContour(placementA, activePart.geometry);
            const isInsideB = isPointInsideContour(placementB, activePart.geometry);
            
            // Нам нужно положение, где isInside === false (вне материала)
            if (!isInsideA && isInsideB) finalPlacement = placementA;
            else if (isInsideA && !isInsideB) finalPlacement = placementB;
        }

        onAddPunches([{ toolId: selectedTool.id, x: finalPlacement.x, y: finalPlacement.y, rotation: finalPlacement.rotation }]);
    }, []);

    return { handleSinglePunch };
};
