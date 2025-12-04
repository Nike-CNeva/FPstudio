
import { useState } from 'react';
import { Part, Tool, Point, ManualPunchMode, SnapMode, PlacementSide, PlacedTool, NibbleSettings, DestructSettings, ToolShape } from '../types';
import { ProcessedGeometry, findClosestSegment, findSnapPoint, isPointInsideContour } from '../services/geometry';
import { calculateEdgePlacement } from '../services/placement';
import { generateNibblePunches, generateDestructPunches } from '../services/punching';

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
    
    const [punchCreationStep, setPunchCreationStep] = useState(0);
    const [punchCreationPoints, setPunchCreationPoints] = useState<Point[]>([]);

    const handleCanvasClick = (rawPoint: Point) => {
        // Invert Y to match Model Coordinates (Cartesian Y-Up)
        const point = { x: rawPoint.x, y: -rawPoint.y };

        setSelectedPunchId(null);
        if (!selectedTool || !activePart) return;

        const snapResult = findSnapPoint(point, activePartProcessedGeometry, snapMode);
        const finalPoint = snapResult?.point ?? point;

        switch(manualPunchMode) {
            case ManualPunchMode.Punch: {
                if (snapMode === SnapMode.ShapeCenter) {
                    onAddPunches([{ toolId: selectedTool.id, x: finalPoint.x, y: finalPoint.y, rotation: punchOrientation }]);
                    return;
                }
                
                const placementAngle = snapResult?.angle ?? 0;
                
                // Using PlacementSide.Outside to ensure tool snaps to the outside of the contour (scrap side)
                const finalPlacement = calculateEdgePlacement(
                    finalPoint, placementAngle, selectedTool, punchOrientation, punchOffset, 
                    snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, PlacementSide.Outside
                );

                onAddPunches([{ toolId: selectedTool.id, x: finalPlacement.x, y: finalPlacement.y, rotation: finalPlacement.rotation }]);
                break;
            }
            case ManualPunchMode.Nibble: {
                const closestSeg = findClosestSegment(point, activePartProcessedGeometry);
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

                    const testP = { 
                        x: midX + nx * perpOffset, 
                        y: midY + ny * perpOffset 
                    };
                    
                    let finalOffsetSign = 1;
                    if (activePartProcessedGeometry) {
                        const rawTestP = {
                            x: testP.x + activePartProcessedGeometry.bbox.minX,
                            y: activePartProcessedGeometry.bbox.minY + testP.y 
                        };
                        
                        if (isPointInsideContour(rawTestP, activePart.geometry)) {
                            finalOffsetSign = -1;
                        }
                    }

                    const punches = generateNibblePunches(
                        closestSeg.p1, 
                        closestSeg.p2, 
                        selectedTool, 
                        nibbleSettings, 
                        closestSeg.angle, 
                        closestSeg.wasNormalized, 
                        combinedRotation, 
                        perpOffset * finalOffsetSign
                    );
                    onAddPunches(punches);
                }
                break;
            }
            case ManualPunchMode.Destruct: {
                if (punchCreationStep === 0) {
                    setPunchCreationPoints([finalPoint]);
                    setPunchCreationStep(1);
                } else {
                    const [startPoint] = punchCreationPoints;
                    const newPunchesData = generateDestructPunches(startPoint, finalPoint, selectedTool, destructSettings);
                    onAddPunches(newPunchesData);
                    // Reset locally, though parent might reset too via callback side-effect
                    setPunchCreationStep(0);
                    setPunchCreationPoints([]);
                }
                break;
            }
        }
    };

    // Helper to reset step externally if needed
    const resetManualState = () => {
        setPunchCreationStep(0);
        setPunchCreationPoints([]);
    };

    return { 
        handleCanvasClick, 
        punchCreationStep, 
        punchCreationPoints,
        resetManualState,
        setPunchCreationPoints,
        setPunchCreationStep
    };
};
