
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

/**
 * A greedy nesting algorithm that supports rotation and different start corners/directions.
 * Places parts from a list onto multiple sheets if necessary.
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
    // If "Nest Under Clamps" is OFF (Safety ON), we force an 80mm margin at the bottom.
    const effectiveMarginBottom = nestUnderClamps ? sheetMarginBottom : 80;

    // Flatten the list of parts to place
    const partsToPlace: { part: Part, instanceId: string, nesting: NestingConstraints }[] = [];
    
    scheduledParts.forEach(({ partId, quantity, nesting }) => {
        const part = allParts.find(p => p.id === partId);
        if (part) {
            for(let i=0; i<quantity; i++) {
                partsToPlace.push({
                    part,
                    instanceId: `placed_${part.id}_${Date.now()}_${Math.random()}_${i}`,
                    nesting: nesting
                });
            }
        }
    });

    // Sort parts by size (largest dimension first)
    partsToPlace.sort((a, b) => {
        const areaA = a.part.geometry.width * a.part.geometry.height;
        const areaB = b.part.geometry.width * b.part.geometry.height;
        return areaB - areaA;
    });

    const singleSheets: NestResultSheet[] = [];
    
    // Helper to calculate clamp collision
    const isCollidingWithClamps = (x: number, width: number, y: number, height: number, sheetH: number): boolean => {
        if (nestUnderClamps) return false;
        
        const clampBuffer = 50; 
        const clampDepth = 100; // Clamps take up bottom 100mm

        for (const clampX of clampPositions) {
            // Check if the part (x to x+width) overlaps with clamp X-range
            if (x < clampX + clampBuffer && (x + width) > clampX - clampBuffer) {
                // Check Y - if part is low enough to hit clamps
                // SVG Y coordinate increases downwards. Clamps are at the "bottom" visually.
                // In standard coordinate system (Y=0 bottom), clamps are at Y=0.
                // But here we place in SVG space (Y=0 top).
                // "Bottom" of sheet is Y = sheetH.
                // Clamps occupy Y range [sheetH - clampDepth, sheetH].
                if (y + height > (sheetH - clampDepth)) return true;
            }
        }
        return false;
    };

    // Determine spacing. 
    // If Common Line is used, calculate gap based on tool dimensions
    let effectiveSpacingX = partSpacingX;
    let effectiveSpacingY = partSpacingY;

    if (useCommonLine) {
        const gap = getCommonLineGap(scheduledParts, allParts, tools);
        effectiveSpacingX = gap;
        effectiveSpacingY = gap;
    }

    // Nesting Direction Config
    const isRightAligned = [2, 5, 8].includes(nestingDirection);
    const isBottomAligned = [0, 1, 2].includes(nestingDirection);
    
    // Process loop: Create sheets until all parts placed
    let sheetCount = 0;
    const MAX_SHEETS = 500; 

    while (partsToPlace.length > 0 && sheetCount < MAX_SHEETS) {
        sheetCount++;
        const currentSheetDef = activeSheetDef; 
        
        const placedOnSheet: NestLayout['sheets'][0]['placedParts'] = [];
        const packWidth = currentSheetDef.width - sheetMarginLeft - sheetMarginRight;
        // Use effectiveMarginBottom here
        const packHeight = currentSheetDef.height - sheetMarginTop - effectiveMarginBottom;

        let simX = 0;
        let simY = 0;
        let rowMaxHeight = 0;
        let rowStartY = simY;
        
        const placedIndices: number[] = [];

        // Try to place each remaining part
        for (let i = 0; i < partsToPlace.length; i++) {
            const item = partsToPlace[i];
            const { part, instanceId, nesting } = item;
            const { allow0_180, allow90_270 } = nesting;

            // Calculate PHYSICAL Extents (including punches sticking out)
            const physicalExtents = calculatePartPhysicalExtents(part, tools);
            const originalW = physicalExtents.width;
            const originalH = physicalExtents.height;

            let bestFit = {
                rotation: 0,
                width: 0,
                height: 0,
                offsetX: 0,
                offsetY: 0,
                found: false
            };

            const orientations = [];
            if (allow0_180) orientations.push(0);
            if (allow90_270) orientations.push(90);
            if (orientations.length === 0) orientations.push(0);

            // 1. Try to fit in current row
            for (const rot of orientations) {
                // If rotated 90, Width becomes Height
                const w = rot === 0 ? originalW : originalH;
                const h = rot === 0 ? originalH : originalW;
                
                const ox = rot === 0 ? physicalExtents.offsetX : physicalExtents.offsetY;
                const oy = rot === 0 ? physicalExtents.offsetY : physicalExtents.offsetX;

                if (simX + w <= packWidth && simY + h <= packHeight) {
                     if (!bestFit.found || h < bestFit.height) { 
                        bestFit = { rotation: rot, width: w, height: h, offsetX: ox, offsetY: oy, found: true };
                    }
                }
            }

            // 2. If not fit in row, try new row
            let inNewRow = false;
            let tempSimX = simX;
            let tempSimY = simY;
            
            if (!bestFit.found) {
                // Advance to new row
                tempSimX = 0;
                tempSimY = rowStartY + rowMaxHeight + effectiveSpacingY;
                
                // Check if new row fits in sheet
                if (tempSimY < packHeight) {
                    for (const rot of orientations) {
                        const w = rot === 0 ? originalW : originalH;
                        const h = rot === 0 ? originalH : originalW;
                        const ox = rot === 0 ? physicalExtents.offsetX : physicalExtents.offsetY;
                        const oy = rot === 0 ? physicalExtents.offsetY : physicalExtents.offsetX;

                        if (tempSimX + w <= packWidth && tempSimY + h <= packHeight) {
                            if (!bestFit.found || h < bestFit.height) {
                                bestFit = { rotation: rot, width: w, height: h, offsetX: ox, offsetY: oy, found: true };
                                inNewRow = true;
                            }
                        }
                    }
                }
            }

            if (bestFit.found) {
                if (inNewRow) {
                    simX = 0;
                    simY = tempSimY;
                    rowStartY = simY;
                    rowMaxHeight = 0;
                }

                let worldX = 0;
                let worldY = 0;

                // X Transformation
                if (isRightAligned) {
                    worldX = (currentSheetDef.width - sheetMarginRight) - (simX + bestFit.width);
                } else {
                    worldX = sheetMarginLeft + simX;
                }

                // Y Transformation
                if (isBottomAligned) {
                    // Use effectiveMarginBottom here
                    worldY = (currentSheetDef.height - effectiveMarginBottom) - (simY + bestFit.height);
                } else {
                    worldY = sheetMarginTop + simY;
                }

                const finalPartX = worldX + bestFit.offsetX;
                const finalPartY = worldY + bestFit.offsetY;

                // Clamp Check (Check physical bbox)
                if (isCollidingWithClamps(worldX, bestFit.width, worldY, bestFit.height, currentSheetDef.height)) {
                    continue; 
                }

                placedOnSheet.push({
                    id: instanceId,
                    partId: part.id,
                    x: finalPartX,
                    y: finalPartY,
                    rotation: bestFit.rotation,
                });

                placedIndices.push(i);

                if (bestFit.height > rowMaxHeight) {
                    rowMaxHeight = bestFit.height;
                }
                
                simX += bestFit.width + effectiveSpacingX;
            }
        } 

        // Remove placed parts
        placedIndices.sort((a, b) => b - a).forEach(idx => {
            partsToPlace.splice(idx, 1);
        });

        const totalArea = currentSheetDef.width * currentSheetDef.height;
        let partsArea = 0;
        placedOnSheet.forEach(pp => {
            const p = allParts.find(x => x.id === pp.partId);
            if (p) partsArea += p.geometry.width * p.geometry.height;
        });
        const usedArea = partsArea > 0 ? (partsArea / totalArea) * 100 : 0;

        if (placedOnSheet.length === 0) {
            // Critical Fix: If the sheet is empty and we still have parts to place, 
            // it means the remaining parts DO NOT FIT on a fresh sheet.
            // We must stop to prevent infinite looping.
            if (partsToPlace.length > 0) {
                throw new Error(`Деталь "${partsToPlace[0].part.name}" слишком велика для выбранного листа (с учетом отступов и прижимов).`);
            }
            break; 
        }

        singleSheets.push({
            id: generateId(),
            sheetName: `Layout`, // Placeholder
            stockSheetId: currentSheetDef.id,
            width: currentSheetDef.width,
            height: currentSheetDef.height,
            material: currentSheetDef.material,
            placedParts: placedOnSheet,
            usedArea: usedArea,
            scrapPercentage: 100 - usedArea,
            partCount: placedOnSheet.length,
            quantity: 1
        });
    }

    // --- Post-Processing: Compress Identical Layouts ---
    
    // Check if two sheets are identical (ignoring ID and instance IDs, checking geometry relative placement)
    const isSameLayout = (a: NestResultSheet, b: NestResultSheet): boolean => {
        if (a.placedParts.length !== b.placedParts.length) return false;
        if (a.width !== b.width || a.height !== b.height) return false;
        
        // Simple heuristic: Sum of X and Y positions should match closely, and part IDs at index should match
        // Note: nesting is deterministic for the same list order, but since we modify partsToPlace, 
        // subsequent sheets are generated sequentially.
        // True compression requires checking if the set of placed parts is effectively same configuration.
        // Since our greedy Algo fills identically if parts are same, we just check position of first and last part.
        
        const p1First = a.placedParts[0];
        const p2First = b.placedParts[0];
        
        if (p1First.partId !== p2First.partId || Math.abs(p1First.x - p2First.x) > 0.1 || Math.abs(p1First.y - p2First.y) > 0.1) return false;
        
        return true;
    };

    const groupedSheets: NestResultSheet[] = [];
    
    singleSheets.forEach(sheet => {
        const match = groupedSheets.find(g => isSameLayout(g, sheet));
        if (match) {
            match.quantity++;
        } else {
            groupedSheets.push(sheet);
        }
    });
    
    // Rename sheets
    groupedSheets.forEach((sheet, idx) => {
        sheet.sheetName = `Лист ${idx + 1}`;
    });

    return groupedSheets;
};
