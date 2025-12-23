
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

/**
 * **useGhostPreview**
 * 
 * Calculates the "Ghost" (preview) visual for the punch tool before the user clicks.
 * This provides real-time visual feedback on where the tool will be placed, 
 * factoring in snapping, rotation, and specific mode logic (Nibble/Punch).
 * 
 * **Behaviors:**
 * - **Punch Mode:** Shows a single tool outline snapped to vertices/edges or free-floating.
 * - **Nibble Mode:** Shows a series of tool outlines along the closest line segment.
 * - **Destruct Mode:** Hides preview during the first step of defining the rectangle.
 * - **Teach Mode:** Disables ghost preview.
 * 
 * **Edge Cases:**
 * - `mousePos` is null (cursor outside canvas) -> Returns empty result.
 * - `selectedTool` is undefined -> Returns empty result.
 * - Geometry processing errors -> Falls back to raw mouse position.
 * 
 * @param {UseGhostPreviewProps} props Inputs primarily from `useEditorState`.
 * @returns {GhostPreviewResult} Data structure for rendering ghost elements in the Canvas.
 */
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
                let rotation = punchOrientation;
                if (snapResult?.forceRotation !== undefined) {
                    const holeAngle = snapResult.forceRotation;
                    const isToolHorizontal = selectedTool.width >= selectedTool.height;
                    
                    if (isToolHorizontal) {
                        rotation = holeAngle;
                    } else {
                        rotation = (holeAngle + 90) % 360;
                    }
                }
                finalPlacement = { x: placementPoint.x, y: placementPoint.y, rotation };
            } else {
                const placementAngle = snapResult?.angle ?? 0;
                
                const placementA = calculateEdgePlacement(
                    placementPoint, placementAngle, selectedTool, punchOrientation, punchOffset, 
                    snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, PlacementSide.Outside
                );
                const placementB = calculateEdgePlacement(
                    placementPoint, placementAngle, selectedTool, punchOrientation, punchOffset, 
                    snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, PlacementSide.Inside
                );

                finalPlacement = placementA;

                if (processedGeometry && activePart) {
                    const isInsideA = isPointInsideContour(placementA, activePart.geometry);
                    const isInsideB = isPointInsideContour(placementB, activePart.geometry);
                    
                    if (!isInsideA && isInsideB) {
                        finalPlacement = placementA;
                    } else if (isInsideA && !isInsideB) {
                        finalPlacement = placementB;
                    } else {
                        finalPlacement = placementA;
                    }
                }
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
