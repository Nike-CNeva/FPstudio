
import { useMemo } from 'react';
import { Part, Tool, Point, ManualPunchMode, SnapMode, PlacementSide, ToolShape, NibbleSettings, PlacedTool } from '../types';
import { ProcessedGeometry, findClosestSegment, findSnapPoint, isPointInsideContour } from '../services/geometry';
import { calculateEdgePlacement } from '../services/placement';
import { generateNibblePunches } from '../services/punching';

interface UseGhostPreviewProps {
    mousePos: Point | null;
    activePart: Part | null;
    processedGeometry: ProcessedGeometry | null;
    selectedTool: Tool | undefined;
    manualPunchMode: ManualPunchMode;
    snapMode: SnapMode;
    punchOrientation: number;
    punchOffset: number;
    nibbleSettings: NibbleSettings;
    punchCreationStep: number; // For Destruct mode hiding
    teachMode: boolean;
}

interface GhostPreviewResult {
    ghostPunches: { x: number, y: number, rotation: number }[];
    ghostLine: { x1: number, y1: number, x2: number, y2: number } | null;
    snapPoint: Point | null;
}

export const useGhostPreview = ({
    mousePos,
    activePart,
    processedGeometry,
    selectedTool,
    manualPunchMode,
    snapMode,
    punchOrientation,
    punchOffset,
    nibbleSettings,
    punchCreationStep,
    teachMode
}: UseGhostPreviewProps): GhostPreviewResult => {

    return useMemo(() => {
        if (!mousePos || !selectedTool || !activePart || teachMode) {
            return { ghostPunches: [], ghostLine: null, snapPoint: null };
        }

        if (manualPunchMode === ManualPunchMode.Destruct && punchCreationStep === 1) {
            return { ghostPunches: [], ghostLine: null, snapPoint: null }; // handled by separate logic or hidden
        }

        if (manualPunchMode === ManualPunchMode.Nibble) {
            const closestSeg = findClosestSegment(mousePos, processedGeometry);
            if (closestSeg) {
                const segAngle = closestSeg.angle;
                const combinedRotation = segAngle + punchOrientation;
                
                let perpOffset = selectedTool.height / 2;
                if (Math.abs(punchOrientation % 180) > 45 && Math.abs(punchOrientation % 180) < 135) {
                    perpOffset = selectedTool.width / 2;
                    if (selectedTool.shape === ToolShape.Circle) perpOffset = selectedTool.width / 2;
                } else {
                    if (selectedTool.shape === ToolShape.Circle) perpOffset = selectedTool.width / 2;
                }

                const ux = Math.cos(segAngle * Math.PI / 180);
                const uy = Math.sin(segAngle * Math.PI / 180);
                const nx = -uy;
                const ny = ux;
                
                const midX = (closestSeg.p1.x + closestSeg.p2.x) / 2;
                const midY = (closestSeg.p1.y + closestSeg.p2.y) / 2;
                const testP = { x: midX + nx * perpOffset, y: midY + ny * perpOffset };
                
                let finalOffsetSign = 1;
                
                if (processedGeometry) {
                    const rawTestP = {
                        x: testP.x + processedGeometry.bbox.minX,
                        y: processedGeometry.bbox.minY + testP.y 
                    };
                    if (isPointInsideContour(rawTestP, activePart.geometry)) {
                        finalOffsetSign = -1; 
                    }
                }

                const previewPunches = generateNibblePunches(
                    closestSeg.p1, 
                    closestSeg.p2, 
                    selectedTool, 
                    nibbleSettings, 
                    closestSeg.angle, 
                    closestSeg.wasNormalized, 
                    combinedRotation, 
                    perpOffset * finalOffsetSign
                );

                return {
                    ghostPunches: previewPunches.map(p => ({ x: p.x, y: p.y, rotation: p.rotation })),
                    ghostLine: { x1: closestSeg.p1.x, y1: closestSeg.p1.y, x2: closestSeg.p2.x, y2: closestSeg.p2.y },
                    snapPoint: null
                };
            }
            return { ghostPunches: [], ghostLine: null, snapPoint: null };
        }

        if (manualPunchMode === ManualPunchMode.Punch) {
            const snapResult = findSnapPoint(mousePos, processedGeometry, snapMode);
            if (!snapResult && snapMode !== SnapMode.Off) return { ghostPunches: [], ghostLine: null, snapPoint: null };

            const placementPoint = snapResult?.point ?? mousePos;
            let finalPlacement: { x: number, y: number, rotation: number };

            const isShapeCenter = snapResult && snapMode === SnapMode.ShapeCenter;

            if (isShapeCenter) {
                finalPlacement = { x: placementPoint.x, y: placementPoint.y, rotation: punchOrientation };
            } else {
                const placementAngle = snapResult?.angle ?? 0;
                finalPlacement = calculateEdgePlacement(
                    placementPoint, placementAngle, selectedTool, punchOrientation, punchOffset, 
                    snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, PlacementSide.Outside
                );
            }

            return {
                ghostPunches: [finalPlacement],
                ghostLine: null,
                snapPoint: snapResult ? snapResult.point : null
            };
        }

        return { ghostPunches: [], ghostLine: null, snapPoint: null };

    }, [mousePos, activePart, processedGeometry, selectedTool, manualPunchMode, snapMode, punchOrientation, punchOffset, nibbleSettings, punchCreationStep, teachMode]);
};
