
import { NestLayout, Part, ScheduledPart, NestingConstraints, NestResultSheet, Tool, ToolShape, PunchType } from '../types';
import { generateId } from '../utils/helpers';
import { calculatePartPhysicalExtents } from './geometry';

// --- CONFIG & CONSTANTS ---
const SMALL_PART_THRESHOLD = 300; // mm. Если ширина ИЛИ высота < 300, считаем деталь мелкой (заполнителем)
const ITERATIONS_PER_SHEET = 200; // Количество попыток укладки для одного листа (Глубина поиска)
const BIG_PART_DENSITY_THRESHOLD = 0.5; // 50% площади листа должны занимать большие детали (если они есть)
const CONSECUTIVE_BONUS_WEIGHT = 0.01; // Вес бонуса за группировку одинаковых деталей (эквивалент 1% КПД за пару)

// --- TYPES FOR PACKING ---

interface PackerItem {
    uid: string;
    partId: string;
    partName: string;
    
    // Physical dimensions including tool extension
    baseW: number;
    baseH: number;
    
    // Calculated dimensions for 0 and 90 degree rotation
    // W/H here includes spacing!
    dims0: { w: number, h: number, offsetX: number, offsetY: number };
    dims90: { w: number, h: number, offsetX: number, offsetY: number };
    
    area: number;
    nesting: NestingConstraints;
    isSmall: boolean; // Flag for filling strategy
    isCritical: boolean; // Flag for priority strategy (fits only one way)
}

interface FreeRect {
    x: number;
    y: number;
    w: number;
    h: number;
    area: number;
}

interface SheetState {
    id: string;
    defId: string; // Stock ID
    width: number; // Usable width (inside margins)
    height: number; // Usable height (inside margins)
    
    // Margins to map back to World Coords
    marginLeft: number;
    marginBottom: number;
    
    freeRects: FreeRect[];
    placedItems: { item: PackerItem, x: number, y: number, rotation: number }[];
    
    // Stats
    totalArea: number;
    usedArea: number;
}

// Result of a single packing simulation
interface PackingResult {
    sheet: SheetState;
    placedUIDs: Set<string>;
    efficiency: number; // Total used area / Sheet area
    bigPartDensity: number; // Big parts area / Sheet area
    allBigsPlaced: boolean; // True if priorityQueue was fully emptied
    consecutiveBonus: number; // Count of identical big parts placed sequentially
}

// --- HELPER FUNCTIONS ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fisher-Yates Shuffle
const shuffleArray = <T>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const getCommonLineGap = (parts: ScheduledPart[], allParts: Part[], tools: Tool[]): number => {
    // Collect all tools used
    const usedToolIds = new Set<string>();
    parts.forEach(sp => {
        const p = allParts.find(ap => ap.id === sp.partId);
        p?.punches.forEach(punch => usedToolIds.add(punch.toolId));
    });

    let minDimension = 5; 
    const contourTools = Array.from(usedToolIds).map(id => tools.find(t => t.id === id)).filter(t => t && (
        t.punchType === PunchType.Contour || t.shape === ToolShape.Rectangle || t.shape === ToolShape.Square || t.shape === ToolShape.Oblong
    )) as Tool[];

    if (contourTools.length > 0) {
        const dims = contourTools.map(t => Math.min(t.width, t.height));
        minDimension = Math.min(...dims);
    }
    return -minDimension; // Negative gap implies overlap allowed by kerf width
};

const isSafeFromClamps = (
    rectX: number, rectY: number, rectW: number, rectH: number,
    sheetState: SheetState,
    clampPositions: number[],
    nestUnderClamps: boolean
): boolean => {
    if (nestUnderClamps) return true;

    // Map to World Coordinates (Y-Up, 0 at Bottom)
    // sheetState.y is logical Y from bottom margin
    const worldX = sheetState.marginLeft + rectX;
    const worldY = sheetState.marginBottom + rectY;

    const clampBuffer = 50; 
    const clampDepth = 100; // Danger zone Y < 100

    // Optimization: If part is clearly above clamp zone, it's safe
    if (worldY > clampDepth) return true;

    for (const clampX of clampPositions) {
        // Check X overlap
        const clampLeft = clampX - clampBuffer;
        const clampRight = clampX + clampBuffer;
        const partRight = worldX + rectW;

        // Intersection on X axis
        if (worldX < clampRight && partRight > clampLeft) {
            return false; // Collision in danger zone
        }
    }
    return true;
};

// --- GUILLOTINE PACKER LOGIC ---

const splitFreeRect = (freeRect: FreeRect, usedRect: {w: number, h: number}): FreeRect[] => {
    const w = usedRect.w;
    const h = usedRect.h;
    
    const remW = freeRect.w - w;
    const remH = freeRect.h - h;

    if (remW < -0.01 || remH < -0.01) return []; 

    const newRects: FreeRect[] = [];

    // Heuristic: Shorter Axis Split (SAS)
    if (freeRect.w < freeRect.h) {
        if (remH > 0) newRects.push({ x: freeRect.x, y: freeRect.y + h, w: freeRect.w, h: remH, area: freeRect.w * remH }); // Top
        if (remW > 0) newRects.push({ x: freeRect.x + w, y: freeRect.y, w: remW, h: h, area: remW * h }); // Right
    } else {
        if (remW > 0) newRects.push({ x: freeRect.x + w, y: freeRect.y, w: remW, h: freeRect.h, area: remW * freeRect.h }); // Right
        if (remH > 0) newRects.push({ x: freeRect.x, y: freeRect.y + h, w: w, h: remH, area: w * remH }); // Top
    }

    return newRects;
};

// --- SINGLE SHEET PACKING SIMULATION ---

/**
 * Packs a single sheet given a prioritized list of items.
 * Tries to pack 'priorityItems' first (Bigs) to meet density target, then fills voids with 'fillItems'.
 */
const packSingleSheet = (
    priorityQueue: PackerItem[], // The specific order we want to try (Bigs)
    fillQueue: PackerItem[],     // Pool of small parts to fill gaps
    stockSheet: any,
    settings: NestLayout['settings']
): PackingResult => {
    
    const { 
        sheetMarginLeft, sheetMarginTop, sheetMarginRight, sheetMarginBottom, 
        nestUnderClamps, clampPositions 
    } = settings;

    const usableW = stockSheet.width - sheetMarginLeft - sheetMarginRight;
    const usableH = stockSheet.height - sheetMarginTop - sheetMarginBottom;

    const sheet: SheetState = {
        id: generateId(),
        defId: stockSheet.id,
        width: usableW,
        height: usableH,
        marginLeft: sheetMarginLeft,
        marginBottom: sheetMarginBottom,
        freeRects: [{ x: 0, y: 0, w: usableW, h: usableH, area: usableW * usableH }],
        placedItems: [],
        totalArea: stockSheet.width * stockSheet.height,
        usedArea: 0
    };

    const placedUIDs = new Set<string>();
    let placedBigsCount = 0;
    let placedBigsArea = 0;
    
    let consecutiveBonus = 0;
    let lastPlacedPartId: string | null = null;

    // 1. Pack Priority Items (Bigs) - Best Vertical Fit Strategy
    for (const item of priorityQueue) {
        let bestRectIdx = -1;
        let bestRot = 0;
        
        // Metrics for "Best Fit"
        // Priority 1: Minimum Vertical Gap (Tightest height fit)
        // Priority 2: Minimum Area Waste (Tightest overall area fit)
        let minVerticalGap = Infinity;
        let minAreaWaste = Infinity;

        // Find Best Fit in current sheet voids
        for (let rIdx = 0; rIdx < sheet.freeRects.length; rIdx++) {
            const rect = sheet.freeRects[rIdx];
            
            // Helper to check and update best candidate
            const checkCandidate = (dims: {w: number, h: number}, rot: number) => {
                if (dims.w <= rect.w && dims.h <= rect.h) {
                    if (isSafeFromClamps(rect.x, rect.y, dims.w, dims.h, sheet, clampPositions, nestUnderClamps)) {
                        const vGap = rect.h - dims.h;
                        const waste = rect.area - item.area;
                        
                        // STRICT HIERARCHY:
                        // 1. Smaller Vertical Gap is always better
                        // 2. If Vertical Gap is almost same (< 1.0mm), choose smaller Area Waste (tighter width)
                        const isBetter = 
                            (vGap < minVerticalGap - 1.0) || 
                            (Math.abs(vGap - minVerticalGap) <= 1.0 && waste < minAreaWaste);

                        if (isBetter) {
                            minVerticalGap = vGap;
                            minAreaWaste = waste;
                            bestRectIdx = rIdx;
                            bestRot = rot;
                        }
                    }
                }
            };

            // Check 0 deg
            if (item.nesting.allow0_180) {
                checkCandidate(item.dims0, 0);
            }
            // Check 90 deg
            if (item.nesting.allow90_270) {
                checkCandidate(item.dims90, 90);
            }
        }

        if (bestRectIdx !== -1) {
            const rect = sheet.freeRects[bestRectIdx];
            const dims = bestRot === 0 ? item.dims0 : item.dims90;
            
            sheet.placedItems.push({ item, x: rect.x, y: rect.y, rotation: bestRot });
            placedUIDs.add(item.uid);
            placedBigsCount++;
            placedBigsArea += item.baseW * item.baseH; // Use pure physical area
            
            // Track Bonus for Consecutive Identical Big Parts
            if (lastPlacedPartId === item.partId) {
                consecutiveBonus++;
            }
            lastPlacedPartId = item.partId;
            
            const newRects = splitFreeRect(rect, { w: dims.w, h: dims.h });
            sheet.freeRects.splice(bestRectIdx, 1);
            sheet.freeRects.push(...newRects);
        }
    }

    // 2. Pack Fill Items (Smalls) - Max Void Strategy with Vertical Optimization
    // We only pack smalls if we have voids.
    const availableFill = fillQueue.filter(f => !placedUIDs.has(f.uid));

    while (availableFill.length > 0) {
        // Find Largest Free Rect to fill
        let maxVoidRectIdx = -1;
        let maxVoidArea = -1;

        for (let rIdx = 0; rIdx < sheet.freeRects.length; rIdx++) {
            if (sheet.freeRects[rIdx].area > maxVoidArea) {
                maxVoidArea = sheet.freeRects[rIdx].area;
                maxVoidRectIdx = rIdx;
            }
        }

        if (maxVoidRectIdx === -1) break; // No voids left (or empty)

        const targetRect = sheet.freeRects[maxVoidRectIdx];
        let bestItemIdx = -1;
        let chosenRot = 0;
        
        // We want the Largest Item that fits, but if orientation allows, pick best Vertical Fit
        // Since list is sorted by Area Descending, the first one that fits is usually the "Biggest".
        // But we need to check both rotations for that specific item to see which fits *better* vertically.

        for (let i = 0; i < availableFill.length; i++) {
            const item = availableFill[i];
            
            let fits0 = false;
            let fits90 = false;
            let vGap0 = Infinity;
            let vGap90 = Infinity;

            if (item.nesting.allow0_180 && item.dims0.w <= targetRect.w && item.dims0.h <= targetRect.h) {
                if (isSafeFromClamps(targetRect.x, targetRect.y, item.dims0.w, item.dims0.h, sheet, clampPositions, nestUnderClamps)) {
                    fits0 = true;
                    vGap0 = targetRect.h - item.dims0.h;
                }
            }
            
            if (item.nesting.allow90_270 && item.dims90.w <= targetRect.w && item.dims90.h <= targetRect.h) {
                if (isSafeFromClamps(targetRect.x, targetRect.y, item.dims90.w, item.dims90.h, sheet, clampPositions, nestUnderClamps)) {
                    fits90 = true;
                    vGap90 = targetRect.h - item.dims90.h;
                }
            }

            if (fits0 || fits90) {
                bestItemIdx = i;
                
                // Decide rotation based on Vertical Gap
                if (fits0 && fits90) {
                    chosenRot = vGap0 <= vGap90 ? 0 : 90;
                } else {
                    chosenRot = fits0 ? 0 : 90;
                }
                
                break; // Found the biggest part that fits
            }
        }

        if (bestItemIdx !== -1) {
            const item = availableFill[bestItemIdx];
            const dims = chosenRot === 0 ? item.dims0 : item.dims90;

            sheet.placedItems.push({ item, x: targetRect.x, y: targetRect.y, rotation: chosenRot });
            placedUIDs.add(item.uid);
            
            const newRects = splitFreeRect(targetRect, { w: dims.w, h: dims.h });
            sheet.freeRects.splice(maxVoidRectIdx, 1);
            sheet.freeRects.push(...newRects);
            
            availableFill.splice(bestItemIdx, 1);
        } else {
            // Nothing fits in this void, remove it from consideration
            sheet.freeRects.splice(maxVoidRectIdx, 1);
        }
    }

    // Calculate Metrics
    const usedArea = sheet.placedItems.reduce((sum, p) => sum + (p.item.baseW * p.item.baseH), 0);
    const efficiency = usedArea / sheet.totalArea;
    const bigPartDensity = placedBigsArea / sheet.totalArea;
    sheet.usedArea = usedArea;

    return { 
        sheet, 
        placedUIDs, 
        efficiency,
        bigPartDensity,
        allBigsPlaced: placedBigsCount === priorityQueue.length,
        consecutiveBonus
    };
};


/**
 * ASYNC Generator for Nesting Process.
 * Yields updated NestResultSheet[] arrays as sheets are completed.
 */
export async function* nestingGenerator(
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[],
    settings: NestLayout['settings']
): AsyncGenerator<NestResultSheet[], void, unknown> {
    
    const { availableSheets, activeSheetId, useCommonLine, partSpacingX, partSpacingY, sheetMarginLeft, sheetMarginTop, sheetMarginRight, sheetMarginBottom } = settings;

    const activeStock = availableSheets.find(s => s.id === activeSheetId) || availableSheets[0];
    if (!activeStock) throw new Error("Нет доступных листов.");

    const sheetUsableW = activeStock.width - sheetMarginLeft - sheetMarginRight;
    const sheetUsableH = activeStock.height - sheetMarginTop - sheetMarginBottom;

    // --- 1. PREPARE ITEMS ---
    const allItems: PackerItem[] = [];
    const spacingX = useCommonLine ? getCommonLineGap(scheduledParts, allParts, tools) : partSpacingX;
    const spacingY = useCommonLine ? spacingX : partSpacingY;

    scheduledParts.forEach(sp => {
        const part = allParts.find(p => p.id === sp.partId);
        if (!part) return;
        const bounds = calculatePartPhysicalExtents(part, tools);
        
        const w0 = bounds.width + spacingX;
        const h0 = bounds.height + spacingY;
        const w90 = bounds.height + spacingX;
        const h90 = bounds.width + spacingY;
        
        const minDim = Math.min(bounds.width, bounds.height);
        const isSmall = minDim < SMALL_PART_THRESHOLD;

        // --- CRITICALITY CHECK ---
        // A part is "Critical" if it MUST be placed in a specific orientation because
        // the other orientation violates the sheet boundaries OR user settings disallow it.
        
        // 1. Geometric constraints
        const fits0_Geo = w0 <= sheetUsableW && h0 <= sheetUsableH;
        const fits90_Geo = w90 <= sheetUsableW && h90 <= sheetUsableH;

        // 2. User Constraints
        const allowed0 = sp.nesting.allow0_180;
        const allowed90 = sp.nesting.allow90_270;

        // Combined Feasibility
        const valid0 = fits0_Geo && allowed0;
        const valid90 = fits90_Geo && allowed90;

        // If it fits ONE way but NOT the other, it is critical.
        // If it fits NO way, it's impossible (but we mark as critical to try forcefully).
        // If it fits BOTH ways, it is Flexible (not critical).
        const isCritical = (valid0 && !valid90) || (!valid0 && valid90);

        // Filter out parts that don't fit at all to avoid infinite loops, or handle gracefully
        if (!valid0 && !valid90) {
            console.warn(`Part ${part.name} is too large for the sheet margins! Skipping.`);
            return;
        }

        for (let i = 0; i < sp.quantity; i++) {
            allItems.push({
                uid: generateId(),
                partId: part.id,
                partName: part.name,
                baseW: bounds.width,
                baseH: bounds.height,
                dims0: { w: w0, h: h0, offsetX: bounds.offsetX, offsetY: bounds.offsetY },
                dims90: { w: w90, h: h90, offsetX: bounds.height - bounds.offsetY, offsetY: bounds.offsetX },
                area: w0 * h0,
                nesting: sp.nesting,
                isSmall,
                isCritical
            });
        }
    });

    // Initial Sort by Area Descending
    allItems.sort((a, b) => b.area - a.area);

    const completedSheets: NestResultSheet[] = [];
    const remainingItems = [...allItems];

    // --- 2. MAIN LOOP: FILL SHEETS ONE BY ONE ---
    while (remainingItems.length > 0) {
        
        // Stop if we exceeded sheet limit
        if (activeStock.quantity && completedSheets.length >= activeStock.quantity) {
            console.warn("Sheet limit reached, stopping nesting.");
            break;
        }

        // Separate groups
        // Critical Bigs: Must go first to ensure they fit.
        // Flexible Bigs: Can be shuffled/rotated freely.
        // Smalls: Filler.
        
        // Filter out Critical Bigs first
        const criticalBigs = remainingItems.filter(i => !i.isSmall && i.isCritical);
        // Then Flexible Bigs
        const flexibleBigs = remainingItems.filter(i => !i.isSmall && !i.isCritical);
        // Then Smalls
        const remainingSmalls = remainingItems.filter(i => i.isSmall);

        // If no bigs left, treat the largest smalls as "Bigs" to drive the layout
        if (criticalBigs.length === 0 && flexibleBigs.length === 0 && remainingSmalls.length > 0) {
            flexibleBigs.push(...remainingSmalls);
            remainingSmalls.length = 0;
        }

        // Pre-calculate groups for "Grouped Shuffle" Strategy (Flexible Only)
        const groupedFlexibleBigs = new Map<string, PackerItem[]>();
        flexibleBigs.forEach(item => {
            if (!groupedFlexibleBigs.has(item.partId)) groupedFlexibleBigs.set(item.partId, []);
            groupedFlexibleBigs.get(item.partId)!.push(item);
        });

        // Ensure criticals are sorted by Area Descending (already done by initial sort, but good to ensure)
        criticalBigs.sort((a,b) => b.area - a.area);

        // --- DEEP PERMUTATION SEARCH (Monte Carlo) ---
        let bestRun: PackingResult | null = null;

        // Try ITERATIONS_PER_SHEET permutations
        for (let iter = 0; iter < ITERATIONS_PER_SHEET; iter++) {
            
            // Allow UI to breathe every few iterations
            if (iter % 10 === 0) await sleep(0);

            // Construct Priority Queue with Mixed Strategy
            let currentQueue: PackerItem[];
            let shuffledFlexible: PackerItem[];

            if (iter === 0) {
                // Baseline: Standard Area Descending
                shuffledFlexible = [...flexibleBigs]; 
            } else if (iter < ITERATIONS_PER_SHEET * 0.4) {
                // Strategy: Grouped Shuffle (40% of attempts)
                const keys = shuffleArray(Array.from(groupedFlexibleBigs.keys()));
                shuffledFlexible = [];
                keys.forEach(k => shuffledFlexible.push(...groupedFlexibleBigs.get(k)!));
            } else {
                // Strategy: Full Random Shuffle
                shuffledFlexible = shuffleArray(flexibleBigs);
            }

            // CRITICAL CHANGE: Always put Critical Bigs first!
            // This ensures parts that fit only 1 way get the first pick of empty space.
            currentQueue = [...criticalBigs, ...shuffledFlexible];

            // Run Simulation
            const runResult = packSingleSheet(currentQueue, remainingSmalls, activeStock, settings);

            // Compare Logic with Constraint and Bonus
            if (!bestRun) {
                bestRun = runResult;
            } else {
                const runSatisfiesBigDensity = (runResult.bigPartDensity >= BIG_PART_DENSITY_THRESHOLD) || runResult.allBigsPlaced;
                const bestSatisfiesBigDensity = (bestRun.bigPartDensity >= BIG_PART_DENSITY_THRESHOLD) || bestRun.allBigsPlaced;

                // Priority 1: Satisfy Density Constraint
                if (runSatisfiesBigDensity && !bestSatisfiesBigDensity) {
                    bestRun = runResult;
                } 
                else if (bestSatisfiesBigDensity && !runSatisfiesBigDensity) {
                    // Keep best
                }
                // Priority 2: Score = Efficiency + ConsecutiveBonus
                else {
                    const runScore = runResult.efficiency + (runResult.consecutiveBonus * CONSECUTIVE_BONUS_WEIGHT);
                    const bestScore = bestRun.efficiency + (bestRun.consecutiveBonus * CONSECUTIVE_BONUS_WEIGHT);

                    if (runScore > bestScore) {
                        bestRun = runResult;
                    }
                }
            }
            
            // Heuristic optimization
            if (bestRun.efficiency > 0.96 && ((bestRun.bigPartDensity >= BIG_PART_DENSITY_THRESHOLD) || bestRun.allBigsPlaced)) break;
        }

        // --- COMMIT BEST SHEET ---
        if (bestRun && bestRun.sheet.placedItems.length > 0) {
            
            // Remove placed items from remainingItems using UIDs
            for (let i = remainingItems.length - 1; i >= 0; i--) {
                if (bestRun.placedUIDs.has(remainingItems[i].uid)) {
                    remainingItems.splice(i, 1);
                }
            }

            // Convert to Result Type
            const sheetState = bestRun.sheet;
            const percent = (sheetState.usedArea / sheetState.totalArea) * 100;
            const placedParts = sheetState.placedItems.map(p => {
                const worldX = sheetState.marginLeft + p.x;
                const worldY = sheetState.marginBottom + p.y;
                const item = p.item;
                const offsets = p.rotation === 0 ? item.dims0 : item.dims90;
                return {
                    id: p.item.uid,
                    partId: p.item.partId,
                    x: worldX + offsets.offsetX,
                    y: worldY + offsets.offsetY,
                    rotation: p.rotation
                };
            });

            const newResultSheet: NestResultSheet = {
                id: sheetState.id,
                sheetName: `Лист ${completedSheets.length + 1}`,
                stockSheetId: sheetState.defId,
                width: activeStock.width,
                height: activeStock.height,
                material: activeStock.material,
                thickness: activeStock.thickness,
                placedParts,
                usedArea: percent,
                scrapPercentage: 100 - percent,
                partCount: placedParts.length,
                quantity: 1
            };

            completedSheets.push(newResultSheet);
            
            // YIELD UPDATE TO UI
            yield [...completedSheets];

        } else {
            console.error("Could not place any remaining parts on a new sheet.");
            break;
        }
    }
}

// Keep the sync version for compatibility if needed, but it's now deprecated in favor of generator
export const performNesting = (
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[],
    settings: NestLayout['settings']
): NestResultSheet[] => {
    // Fallback: Just run 1 iteration
    const gen = nestingGenerator(scheduledParts, allParts, tools, settings);
    // This cannot be synchronously executed fully.
    // For now, return empty or throw error if called synchronously.
    throw new Error("Use nestingGenerator instead");
};
