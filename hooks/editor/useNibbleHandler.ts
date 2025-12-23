
/**
 * ОТВЕТСТВЕННОСТЬ: Генерация серии ударов вдоль ближайшего сегмента.
 */
import { useCallback } from 'react';
import { Part, Tool, Point, ToolShape, NibbleSettings, PlacedTool } from '../../types';
import { ProcessedGeometry, findClosestSegment, isPointInsideContour } from '../../services/geometry';
import { generateNibblePunches } from '../../services/punching';

interface NibbleParams {
    activePart: Part | null;
    processedGeometry: ProcessedGeometry | null;
    selectedTool: Tool | null;
    punchOrientation: number;
    nibbleSettings: NibbleSettings;
    onAddPunches: (punches: Omit<PlacedTool, 'id'>[]) => void;
}

export const useNibbleHandler = () => {
    const handleNibble = useCallback((point: Point, params: NibbleParams) => {
        const { activePart, processedGeometry, selectedTool, punchOrientation, nibbleSettings, onAddPunches } = params;
        if (!selectedTool || !activePart) return;

        const closestSeg = findClosestSegment(point, processedGeometry);
        if (!closestSeg) return;

        const segAngle = closestSeg.angle;
        const combinedRotation = segAngle + punchOrientation;
        
        let perpOffset = (selectedTool.shape === ToolShape.Circle) 
            ? selectedTool.width / 2 
            : (Math.abs(punchOrientation % 180) > 45 && Math.abs(punchOrientation % 180) < 135) 
                ? selectedTool.width / 2 
                : selectedTool.height / 2;

        const ux = Math.cos(segAngle * Math.PI / 180);
        const uy = Math.sin(segAngle * Math.PI / 180);
        const nx = -uy; const ny = ux;
        const mid = { x: (closestSeg.p1.x + closestSeg.p2.x) / 2, y: (closestSeg.p1.y + closestSeg.p2.y) / 2 };

        let finalOffsetSign = 1;
        if (isPointInsideContour({ x: mid.x + nx * perpOffset, y: mid.y + ny * perpOffset }, activePart.geometry)) {
            finalOffsetSign = -1;
        }

        const punches = generateNibblePunches(
            closestSeg.p1, closestSeg.p2, selectedTool, nibbleSettings, 
            closestSeg.angle, closestSeg.wasNormalized, combinedRotation, perpOffset * finalOffsetSign
        );
        onAddPunches(punches);
    }, []);

    return { handleNibble };
};
