
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
                    let rotation = punchOrientation;
                    
                    // Smart Rotation: If feature dictates angle (forceRotation is hole angle, e.g., 90 for vertical oblong)
                    if (snapResult?.forceRotation !== undefined) {
                        const holeAngle = snapResult.forceRotation;
                        
                        // Default Tool Orientation: usually 0 is Horizontal (W > H).
                        // If Tool is naturally W > H (Horizontal):
                        //   Target Vertical Hole (90): We need rotation 90.
                        //   Target Horizontal Hole (0): We need rotation 0.
                        // If Tool is naturally H > W (Vertical):
                        //   Target Vertical Hole (90): We need rotation 0 (stays vertical).
                        //   Target Horizontal Hole (0): We need rotation 90.
                        
                        const isToolHorizontal = selectedTool.width >= selectedTool.height;
                        
                        if (isToolHorizontal) {
                            rotation = holeAngle;
                        } else {
                            // Tool is naturally vertical.
                            // If hole is 0 (Horz), we need 90 to make vertical tool horizontal.
                            // If hole is 90 (Vert), we need 0 to keep vertical tool vertical.
                            rotation = (holeAngle + 90) % 360;
                        }
                    }
                    onAddPunches([{ toolId: selectedTool.id, x: finalPoint.x, y: finalPoint.y, rotation }]);
                    return;
                }
                
                const placementAngle = snapResult?.angle ?? 0;
                
                // Rigorous Outside Check: Calculate both Inside and Outside placements and pick the one truly in Scrap.
                // 1. Calculate Candidate A (Outside Param)
                const placementA = calculateEdgePlacement(
                    finalPoint, placementAngle, selectedTool, punchOrientation, punchOffset, 
                    snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, PlacementSide.Outside
                );
                
                // 2. Calculate Candidate B (Inside Param)
                const placementB = calculateEdgePlacement(
                    finalPoint, placementAngle, selectedTool, punchOrientation, punchOffset, 
                    snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, PlacementSide.Inside
                );

                let finalPlacement = placementA;

                if (activePartProcessedGeometry && activePart) {
                    const isInsideA = isPointInsideContour(placementA, activePart.geometry);
                    const isInsideB = isPointInsideContour(placementB, activePart.geometry);
                    
                    // We want the tool to be in SCRAP (Outside of Contour).
                    // isPointInsideContour returns TRUE if in Material.
                    // So we want the one where isInside is FALSE.
                    
                    if (!isInsideA && isInsideB) {
                        finalPlacement = placementA;
                    } else if (isInsideA && !isInsideB) {
                        finalPlacement = placementB;
                    } else {
                        // Fallback if both are outside or both inside: keep default Outside param (A)
                        finalPlacement = placementA;
                    }
                }

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

                    // Initial test point: Center of tool on Positive Normal side
                    const testP = { 
                        x: midX + nx * perpOffset, 
                        y: midY + ny * perpOffset 
                    };
                    
                    let finalOffsetSign = 1;
                    if (activePartProcessedGeometry) {
                        // Use the ACTUAL tool center relative to global coordinates for the Inside check.
                        // isPointInsideContour uses global coordinates. 
                        // bbox.minX/Y handles the translation from SVG (0,0 based) to Raw Dxf Coords if needed, 
                        // but isPointInsideContour implementation expects point in same space as Geometry.
                        // Our processedGeometry is usually normalized to (0,0). 
                        // activePart.geometry.bbox has minX/minY = 0 if normalized.
                        // However, to be safe, we denormalize if the original was shifted.
                        // In this app, `activePart.geometry` entities are normalized to (0,0)-(W,H).
                        // So `midX/midY` (from processedGeometry which is also normalized) are correct in that space.
                        
                        // We check the center.
                        // If center is Inside (Material), we flip.
                        if (isPointInsideContour(testP, activePart.geometry)) {
                            finalOffsetSign = -1;
                        } else {
                            // Double check: Is the flipped position inside?
                            const flippedP = { x: midX - nx * perpOffset, y: midY - ny * perpOffset };
                            if (!isPointInsideContour(flippedP, activePart.geometry)) {
                                // Both centers are outside. This happens with thin gaps or concave shapes.
                                // We stick to default +Normal unless...
                                // Actually, for "Long tool exceeding line length", the problem is often 
                                // that the simple probe point logic fails.
                                // Here, using the exact tool center `testP` against the full polygon 
                                // is the most robust way to find "Material".
                                // If testP is NOT inside, we assume it's scrap (outside), so orientation is good.
                            }
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
