
import { NestLayout, Part, ScheduledPart, NestingConstraints, NestResultSheet, SheetStock, Tool, ToolShape, PunchType } from '../types';
import { generateId } from '../utils/helpers';
import { calculatePartPhysicalExtents } from './geometry';

// Helper to determine common line gap based on tools used
const getCommonLineGap = (parts: ScheduledPart[], allParts: Part[], tools: Tool[]): number => {
    // Collect all tools used in the scheduled parts
    const usedToolIds = new Set<string>();
    parts.forEach(sp => {
        const p = allParts.find(ap => ap.id === sp.partId);
        if (p) {
            p.punches.forEach(punch => usedToolIds.add(punch.toolId));
        }
    });

    // Find smallest dimension of contour tools
    let minDimension = 5; // Default fallback

    const contourTools = Array.from(usedToolIds).map(id => tools.find(t => t.id === id)).filter(t => t && (
        t.punchType === PunchType.Contour || 
        t.shape === ToolShape.Rectangle || 
        t.shape === ToolShape.Square || 
        t.shape === ToolShape.Oblong
    )) as Tool[];

    if (contourTools.length > 0) {
        // Find smallest width or height used by these tools
        // Assumption: The narrowest tool dimension usually defines the cut width (kerf)
        const dims = contourTools.map(t => Math.min(t.width, t.height));
        minDimension = Math.min(...dims);
    }
    
    return -minDimension;
};

interface ItemToPlace {
    part: Part;
    instanceId: string;
    nesting: NestingConstraints;
    // Pre-calculated dimensions
    phys0: { width: number, height: number, offsetX: number, offsetY: number }; // Rotation 0
    phys90: { width: number, height: number, offsetX: number, offsetY: number }; // Rotation 90
}

interface NestingRow {
    y: number;      // Logical Y position of the row top relative to packing area
    x: number;      // Current Logical X cursor in this row
    height: number; // The height allocated for this row (usually determined by the first/tallest item)
}

/**
 * Improved Nesting Algorithm: First Fit Decreasing Height (FFDH) with Rotation Support.
 * 1. Sort parts by largest dimension descending.
 * 2. Try to fit part in existing rows (checking valid rotations).
 * 3. If no fit, start new row.
 */
export const performNesting = (
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[],
    settings: NestLayout['settings']
): NestResultSheet[] => {
    const { 
        availableSheets, activeSheetId, 
        partSpacingX, partSpacingY, 
        sheetMarginLeft, sheetMarginTop, sheetMarginRight, sheetMarginBottom, 
        nestUnderClamps, clampPositions, nestingDirection, useCommonLine 
    } = settings;
    
    const activeSheetDef = availableSheets.find(s => s.id === activeSheetId) || availableSheets[0];
    if (!activeSheetDef) {
        throw new Error("Не выбран лист для раскроя.");
    }

    if (scheduledParts.length === 0) {
        return [];
    }

    // Override bottom margin logic based on clamp safety
    const effectiveMarginBottom = nestUnderClamps ? sheetMarginBottom : 80;

    // 1. Prepare Items (Flatten and pre-calc bounds)
    const partsToPlace: ItemToPlace[] = [];
    
    scheduledParts.forEach(({ partId, quantity, nesting }) => {
        const part = allParts.find(p => p.id === partId);
        if (part) {
            // Calc 0 deg
            const b0 = calculatePartPhysicalExtents(part, tools);
            // Calc 90 deg (Swap W/H, adjust offsets logic handled in placement but dims needed here)
            // Rotation 90 logic: newW = oldH, newH = oldW. 
            // Offset logic handled dynamically during placement, we just need dimensions here for sorting/fitting.
            const b90 = { 
                width: b0.height, 
                height: b0.width, 
                offsetX: b0.height - b0.offsetY, // Placeholder, actual logic in loop
                offsetY: b0.offsetX 
            };

            for(let i=0; i<quantity; i++) {
                partsToPlace.push({
                    part,
                    instanceId: `placed_${part.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${i}`,
                    nesting,
                    phys0: b0,
                    phys90: b90
                });
            }
        }
    });

    // 2. Sort by Maximum Dimension Descending (FFDH strategy)
    // This helps placing large items first to define row structures, then smaller items fill gaps.
    partsToPlace.sort((a, b) => {
        const maxDimA = Math.max(a.phys0.width, a.phys0.height);
        const maxDimB = Math.max(b.phys0.width, b.phys0.height);
        return maxDimB - maxDimA;
    });

    // Determine effective spacing
    let effectiveSpacingX = partSpacingX;
    let effectiveSpacingY = partSpacingY;

    if (useCommonLine) {
        const gap = getCommonLineGap(scheduledParts, allParts, tools);
        effectiveSpacingX = gap;
        effectiveSpacingY = gap;
    }

    // Nesting Direction Config
    // 0,1,2 = Bottom aligned. 6,7,8 = Top aligned.
    // 0,3,6 = Left aligned. 2,5,8 = Right aligned.
    // We work in "Logical Coordinates" (Top-Left 0,0 to W,H) and map to World at the end.
    const isRightAligned = [2, 5, 8].includes(nestingDirection);
    const isBottomAligned = [0, 1, 2].includes(nestingDirection);

    // Helper: Check Clamp Collision
    const isCollidingWithClamps = (worldX: number, width: number, worldY: number, height: number, sheetH: number): boolean => {
        if (nestUnderClamps) return false;
        const clampBuffer = 50; 
        const clampDepth = 100; 
        for (const clampX of clampPositions) {
            // Check X overlap
            if (worldX < clampX + clampBuffer && (worldX + width) > clampX - clampBuffer) {
                // Check Y overlap (Clamps are at bottom of sheet in World Y)
                // In World Coordinates (Y-Up), Clamps are at Y=0.
                // The dangerous zone is usually Y < clampDepth.
                if (worldY < clampDepth) return true;
            }
        }
        return false;
    };

    // Helper: Map Logical (Packing) Coords to World Coords
    // Logical: (0,0) is the start corner defined by margins.
    // PackWidth/PackHeight are the safe areas.
    // OUTPUT: World Coordinates (Y-Up, 0 at Bottom).
    const getToWorldFn = (sheetW: number, sheetH: number) => {
        return (logX: number, logY: number, partW: number, partH: number) => {
            let worldX = 0;
            let worldY = 0;

            if (isRightAligned) {
                // Start from Right margin, move left
                worldX = (sheetW - sheetMarginRight) - (logX + partW);
            } else {
                // Start from Left margin, move right
                worldX = sheetMarginLeft + logX;
            }

            if (isBottomAligned) {
                // Start from Bottom margin, move up (World Y increases)
                worldY = effectiveMarginBottom + logY;
            } else {
                // Start from Top margin, move down (World Y decreases from Height)
                worldY = (sheetH - sheetMarginTop) - (logY + partH);
            }
            return { worldX, worldY };
        };
    };

    const singleSheets: NestResultSheet[] = [];
    let sheetCount = 0;
    const MAX_SHEETS = 500; 

    // 3. Processing Loop
    while (partsToPlace.length > 0 && sheetCount < MAX_SHEETS) {
        sheetCount++;
        const currentSheetDef = activeSheetDef; 
        const placedOnSheet: NestLayout['sheets'][0]['placedParts'] = [];
        
        const packWidth = currentSheetDef.width - sheetMarginLeft - sheetMarginRight;
        const packHeight = currentSheetDef.height - sheetMarginTop - effectiveMarginBottom;
        
        const toWorld = getToWorldFn(currentSheetDef.width, currentSheetDef.height);

        // State for this sheet
        const rows: NestingRow[] = [];
        const placedIndices: number[] = [];

        // Attempt to place each remaining part
        for (let i = 0; i < partsToPlace.length; i++) {
            const item = partsToPlace[i];
            const { phys0, phys90, nesting } = item;
            
            // Determine allowed orientations
            const allowedRotations = [];
            if (nesting.allow0_180) allowedRotations.push(0);
            if (nesting.allow90_270) allowedRotations.push(90);
            if (allowedRotations.length === 0) allowedRotations.push(0); // Fallback

            let bestPlacement = {
                rowIdx: -1, // -1 means new row
                rotation: 0,
                width: 0,
                height: 0,
                score: Infinity // Lower is better. Score = wasted vertical space in row.
            };

            // --- Strategy A: Try to fit in EXISTING rows ---
            for (let rIdx = 0; rIdx < rows.length; rIdx++) {
                const row = rows[rIdx];
                
                for (const rot of allowedRotations) {
                    const dims = rot === 0 ? phys0 : phys90;
                    
                    // Check dimensions
                    if (dims.height > row.height) continue; // Too tall for this row (Basic FFDH rule: fit in existing height)
                    
                    if (row.x + dims.width <= packWidth) {
                        // Calculate World Coords to check Clamps
                        const { worldX, worldY } = toWorld(row.x, row.y, dims.width, dims.height);
                        
                        if (!isCollidingWithClamps(worldX, dims.width, worldY, dims.height, currentSheetDef.height)) {
                            // It fits! Calculate score.
                            // We want to minimize the gap between part height and row height.
                            const verticalWaste = row.height - dims.height;
                            
                            if (verticalWaste < bestPlacement.score) {
                                bestPlacement = {
                                    rowIdx: rIdx,
                                    rotation: rot,
                                    width: dims.width,
                                    height: dims.height,
                                    score: verticalWaste
                                };
                            }
                        }
                    }
                }
            }

            // --- Strategy B: Start NEW ROW ---
            if (bestPlacement.rowIdx === -1) {
                // Determine Y position for new row
                let newRowY = 0;
                if (rows.length > 0) {
                    const lastRow = rows[rows.length - 1];
                    newRowY = lastRow.y + lastRow.height + effectiveSpacingY;
                }

                if (newRowY < packHeight) {
                    let bestNewRow = { rotation: -1, width: 0, height: Infinity };

                    for (const rot of allowedRotations) {
                        const dims = rot === 0 ? phys0 : phys90;
                        
                        // Check if fits on sheet X and Y
                        if (dims.width <= packWidth && (newRowY + dims.height) <= packHeight) {
                             const { worldX, worldY } = toWorld(0, newRowY, dims.width, dims.height);
                             if (!isCollidingWithClamps(worldX, dims.width, worldY, dims.height, currentSheetDef.height)) {
                                 if (dims.height < bestNewRow.height) {
                                     bestNewRow = { rotation: rot, width: dims.width, height: dims.height };
                                 }
                             }
                        }
                    }

                    if (bestNewRow.rotation !== -1) {
                        // Found a valid new row config
                        bestPlacement = {
                            rowIdx: -2, // New Row signal
                            rotation: bestNewRow.rotation,
                            width: bestNewRow.width,
                            height: bestNewRow.height,
                            score: 0
                        };
                    }
                }
            }

            // --- EXECUTE PLACEMENT ---
            if (bestPlacement.rowIdx !== -1) {
                let placeX = 0;
                let placeY = 0;
                
                // Offsets logic
                const rot = bestPlacement.rotation;
                
                let finalOffsetX = 0;
                let finalOffsetY = 0;

                if (rot === 0) {
                    finalOffsetX = phys0.offsetX;
                    finalOffsetY = phys0.offsetY;
                } else {
                    // 90 deg
                    finalOffsetX = phys0.height - phys0.offsetY;
                    finalOffsetY = phys0.offsetX;
                }

                if (bestPlacement.rowIdx >= 0) {
                    // Add to existing
                    const row = rows[bestPlacement.rowIdx];
                    placeX = row.x;
                    placeY = row.y; // Align to top of row
                    
                    // Update Row
                    row.x += bestPlacement.width + effectiveSpacingX;
                } else {
                    // Create New Row
                    let newRowY = 0;
                    if (rows.length > 0) {
                        const lastRow = rows[rows.length - 1];
                        newRowY = lastRow.y + lastRow.height + effectiveSpacingY;
                    }
                    placeX = 0;
                    placeY = newRowY;

                    rows.push({
                        y: newRowY,
                        x: bestPlacement.width + effectiveSpacingX,
                        height: bestPlacement.height
                    });
                }

                // Map to World
                const { worldX, worldY } = toWorld(placeX, placeY, bestPlacement.width, bestPlacement.height);

                placedOnSheet.push({
                    id: item.instanceId,
                    partId: item.part.id,
                    x: worldX + finalOffsetX,
                    y: worldY + finalOffsetY,
                    rotation: bestPlacement.rotation
                });

                placedIndices.push(i);
            }
        } // End Parts Loop

        // Remove placed parts from queue
        const remainingParts: ItemToPlace[] = [];
        for(let i=0; i<partsToPlace.length; i++) {
            if (!placedIndices.includes(i)) {
                remainingParts.push(partsToPlace[i]);
            }
        }
        partsToPlace.length = 0;
        partsToPlace.push(...remainingParts);

        // Calculate Stats
        const totalArea = currentSheetDef.width * currentSheetDef.height;
        let partsArea = 0;
        placedOnSheet.forEach(pp => {
            const p = allParts.find(x => x.id === pp.partId);
            if (p) partsArea += p.geometry.width * p.geometry.height;
        });
        const usedArea = partsArea > 0 ? (partsArea / totalArea) * 100 : 0;

        if (placedOnSheet.length === 0) {
            if (partsToPlace.length > 0) {
                throw new Error(`Деталь "${partsToPlace[0].part.name}" слишком велика для листа или заблокирована прижимами.`);
            }
            break; 
        }

        singleSheets.push({
            id: generateId(),
            sheetName: `Layout`, 
            stockSheetId: currentSheetDef.id,
            width: currentSheetDef.width,
            height: currentSheetDef.height,
            material: currentSheetDef.material,
            thickness: currentSheetDef.thickness,
            placedParts: placedOnSheet,
            usedArea: usedArea,
            scrapPercentage: 100 - usedArea,
            partCount: placedOnSheet.length,
            quantity: 1
        });
    }

    // 4. Post-Processing: Group Identical Sheets
    const groupedSheets: NestResultSheet[] = [];
    
    // Simple heuristic for identity
    const isSameLayout = (a: NestResultSheet, b: NestResultSheet): boolean => {
        if (a.placedParts.length !== b.placedParts.length) return false;
        if (a.width !== b.width || a.height !== b.height) return false;
        
        const p1First = a.placedParts[0];
        const p2First = b.placedParts[0];
        
        // Check first part position and ID match as signature
        if (p1First.partId !== p2First.partId || Math.abs(p1First.x - p2First.x) > 0.1 || Math.abs(p1First.y - p2First.y) > 0.1) return false;
        return true;
    };

    singleSheets.forEach(sheet => {
        const match = groupedSheets.find(g => isSameLayout(g, sheet));
        if (match) {
            match.quantity++;
        } else {
            groupedSheets.push(sheet);
        }
    });
    
    groupedSheets.forEach((sheet, idx) => {
        sheet.sheetName = `Лист ${idx + 1}`;
    });

    return groupedSheets;
};
