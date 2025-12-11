
import { NestResultSheet, ScheduledPart, Part, Tool, NestingSettings, SheetStock, SheetUtilizationStrategy } from '../types';
import { generateId } from '../utils/helpers';
import { calculatePartPhysicalExtents } from './geometry';

// ----------------------------------------------------------------------
// TYPES & HELPERS
// ----------------------------------------------------------------------

interface PackerItem {
    uid: string;
    partId: string;
    width: number;
    height: number;
    offsetX: number; 
    offsetY: number;
    allowRotation: boolean;
    // Pre-calculated for 90deg rotation
    rotatedWidth: number;
    rotatedHeight: number;
    rotatedOffsetX: number;
    rotatedOffsetY: number;
}

interface FreeRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

type SplitStrategy = 'Vertical' | 'Horizontal' | 'ShortAxis' | 'LongAxis';

// ----------------------------------------------------------------------
// ROBUST GUILLOTINE PACKER CLASS
// ----------------------------------------------------------------------

class GuillotinePacker {
    width: number;
    height: number;
    spacingX: number;
    spacingY: number;
    freeRects: FreeRect[];
    placedItems: { item: PackerItem, x: number, y: number, rotation: number }[];
    strategy: SplitStrategy;

    constructor(width: number, height: number, spacingX: number, spacingY: number, strategy: SplitStrategy = 'ShortAxis') {
        this.width = width;
        this.height = height;
        this.spacingX = spacingX;
        this.spacingY = spacingY;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.placedItems = [];
        this.strategy = strategy;
    }

    // Heuristic: Best Area Fit (BAF)
    // Find the free rectangle that fits the item with the minimal remaining area.
    // Also considers "Position Penalty" to encourage specific filling orders (e.g. Left-to-Right).
    findPosition(item: PackerItem): { rectIndex: number, rotation: number, score: number } | null {
        let bestScore = Infinity;
        let bestRectIndex = -1;
        let bestRotation = 0; // 0 or 90

        for (let i = 0; i < this.freeRects.length; i++) {
            const rect = this.freeRects[i];

            // --- Strategy Position Penalty ---
            // Small bias to pick top-left or bottom-left depending on strategy
            // Normalized to be small relative to area scores
            let positionPenalty = 0;
            if (this.strategy === 'Vertical') {
                // Penalize X heavily, Y slightly -> Fill Columns Left-to-Right
                positionPenalty = (rect.x * 10 + rect.y) * 0.0001; 
            } else if (this.strategy === 'Horizontal') {
                // Penalize Y heavily, X slightly -> Fill Rows Bottom-to-Top
                positionPenalty = (rect.y * 10 + rect.x) * 0.0001;
            }

            // Try 0 degrees
            if (item.width <= rect.w && item.height <= rect.h) {
                // BSSF (Best Short Side Fit) - minimize the smaller dimension of the leftover
                const leftoverX = Math.abs(rect.w - item.width);
                const leftoverY = Math.abs(rect.h - item.height);
                const fitScore = Math.min(leftoverX, leftoverY); 
                
                const totalScore = fitScore + positionPenalty;

                if (totalScore < bestScore) {
                    bestScore = totalScore;
                    bestRectIndex = i;
                    bestRotation = 0;
                }
            }

            // Try 90 degrees
            if (item.allowRotation) {
                if (item.rotatedWidth <= rect.w && item.rotatedHeight <= rect.h) {
                    const leftoverX = Math.abs(rect.w - item.rotatedWidth);
                    const leftoverY = Math.abs(rect.h - item.rotatedHeight);
                    const fitScore = Math.min(leftoverX, leftoverY);

                    const totalScore = fitScore + positionPenalty;

                    if (totalScore < bestScore) {
                        bestScore = totalScore;
                        bestRectIndex = i;
                        bestRotation = 90;
                    }
                }
            }
        }

        if (bestRectIndex !== -1) {
            return { rectIndex: bestRectIndex, rotation: bestRotation, score: bestScore };
        }
        return null;
    }

    placeItem(item: PackerItem, rectIndex: number, rotation: number) {
        const rect = this.freeRects[rectIndex];
        const w = rotation === 90 ? item.rotatedWidth : item.width;
        const h = rotation === 90 ? item.rotatedHeight : item.height;

        this.placedItems.push({
            item,
            x: rect.x,
            y: rect.y,
            rotation
        });

        // "Used" dimensions include spacing
        const usedW = w + this.spacingX;
        const usedH = h + this.spacingY;

        // Determine Split Method
        let splitHorizontal = false;
        
        const freeW = rect.w - usedW;
        const freeH = rect.h - usedH;

        if (this.strategy === 'Horizontal') {
            // Cut Horizontally -> Creates Rows (Shelves)
            // Top Rect is Full Width. Right Rect is constrained Height.
            splitHorizontal = true;
        } else if (this.strategy === 'Vertical') {
            // Cut Vertically -> Creates Columns
            // Right Rect is Full Height. Top Rect is constrained Width.
            splitHorizontal = false;
        } else if (this.strategy === 'ShortAxis') {
            // Standard Heuristic: Minimize the length of the cut
            // If leftover W < leftover H, vertical cut is shorter? 
            // Wait, vertical cut length is H. Horizontal cut length is W.
            // Actually usually based on the shape of remaining area.
            // Split Shorter Leftover Axis rule:
            splitHorizontal = freeW < freeH;
        } else {
            splitHorizontal = freeW > freeH;
        }

        // Remove the used rectangle
        this.freeRects.splice(rectIndex, 1);

        // GUILLOTINE SPLIT LOGIC
        // We assume placement at (rect.x, rect.y) [Bottom-Left of free space]
        
        let newRect1: FreeRect | null = null;
        let newRect2: FreeRect | null = null;

        const rightX = rect.x + usedW;
        const topY = rect.y + usedH;
        const hasRight = freeW > 0;
        const hasTop = freeH > 0;

        if (splitHorizontal) {
            // --- HORIZONTAL SPLIT (Cut along X axis) ---
            // New Right Rect: Located beside item. Height is LIMITED to item height.
            // New Top Rect: Located above item. Width is FULL rect width.
            
            if (hasTop) {
                // Top: x, y+h, full_w, remaining_h
                newRect1 = { x: rect.x, y: topY, w: rect.w, h: rect.h - usedH };
            }
            if (hasRight) {
                // Right: x+w, y, remaining_w, used_h
                newRect2 = { x: rightX, y: rect.y, w: rect.w - usedW, h: Math.min(usedH, rect.h) };
            }
        } else {
            // --- VERTICAL SPLIT (Cut along Y axis) ---
            // New Top Rect: Located above item. Width is LIMITED to item width.
            // New Right Rect: Located beside item. Height is FULL rect height.
            
            if (hasTop) {
                // Top: x, y+h, used_w, remaining_h
                newRect1 = { x: rect.x, y: topY, w: Math.min(usedW, rect.w), h: rect.h - usedH };
            }
            if (hasRight) {
                // Right: x+w, y, remaining_w, full_h
                newRect2 = { x: rightX, y: rect.y, w: rect.w - usedW, h: rect.h };
            }
        }

        if (newRect1 && newRect1.w > 0 && newRect1.h > 0) this.freeRects.push(newRect1);
        if (newRect2 && newRect2.w > 0 && newRect2.h > 0) this.freeRects.push(newRect2);

        // Pruning tiny rectangles to avoid fragmentation overhead
        this.freeRects = this.freeRects.filter(r => r.w >= 5 && r.h >= 5);
        
        // --- OPTIONAL: Sort Free Rects to improve packing density? ---
        // For strategies like 'Vertical', we might want to consume bottom-left voids first.
        // findPosition does global scan, but cleaner list helps debugging.
    }
}

// ----------------------------------------------------------------------
// GENERATOR
// ----------------------------------------------------------------------

export async function* nestingGenerator(
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[], 
    settings: NestingSettings
): AsyncGenerator<NestResultSheet[]> {
    
    // 1. Prepare Items
    const rawItems: PackerItem[] = [];

    for (const sp of scheduledParts) {
        const part = allParts.find(p => p.id === sp.partId);
        if (!part) continue;

        const dims0 = calculatePartPhysicalExtents(part, tools);
        const maxY0 = dims0.height - dims0.offsetY; 

        for (let i = 0; i < sp.quantity; i++) {
            rawItems.push({
                uid: generateId(),
                partId: sp.partId,
                width: dims0.width,
                height: dims0.height,
                offsetX: dims0.offsetX,
                offsetY: dims0.offsetY,
                allowRotation: sp.nesting.allow90_270,
                rotatedWidth: dims0.height,
                rotatedHeight: dims0.width,
                rotatedOffsetX: maxY0,
                rotatedOffsetY: dims0.offsetX
            });
        }
    }

    const completedSheets: NestResultSheet[] = [];
    const { 
        sheetMarginTop, sheetMarginBottom, sheetMarginLeft, sheetMarginRight, 
        partSpacingX, partSpacingY 
    } = settings;

    // Helper to calculate packing efficiency
    const calculateEfficiency = (packer: GuillotinePacker, totalArea: number) => {
        const usedArea = packer.placedItems.reduce((sum, p) => {
            const w = p.rotation === 90 ? p.item.rotatedWidth : p.item.width;
            const h = p.rotation === 90 ? p.item.rotatedHeight : p.item.height;
            return sum + (w * h);
        }, 0);
        return usedArea / totalArea;
    };

    let remainingItems = [...rawItems];

    // 2. Packing Loop
    while (remainingItems.length > 0) {
        
        // Get Active Sheet
        let activeStock: SheetStock | undefined;
        if (settings.activeSheetId) {
            activeStock = settings.availableSheets.find(s => s.id === settings.activeSheetId);
        }
        if (!activeStock && settings.availableSheets.length > 0) activeStock = settings.availableSheets[0];
        if (!activeStock) break; 

        const packW = activeStock.width - sheetMarginLeft - sheetMarginRight;
        const packH = activeStock.height - sheetMarginTop - sheetMarginBottom;

        // --- MULTI-PASS SIMULATION ---
        // We will try 3 strategies and pick the winner for this specific sheet.
        
        // Strategy A: Vertical (Column) Packing. Sort Height Desc.
        // Strategy B: Horizontal (Row) Packing. Sort Height Desc.
        // Strategy C: Best Fit (ShortAxis). Sort Area Desc.

        const strategies: { name: string, packer: GuillotinePacker, packedIndices: Set<number>, score: number }[] = [];

        const configs = [
            { id: 'Vertical', sort: 'height', strategy: 'Vertical' as SplitStrategy },
            { id: 'Horizontal', sort: 'height', strategy: 'Horizontal' as SplitStrategy },
            { id: 'BestFit', sort: 'area', strategy: 'ShortAxis' as SplitStrategy }
        ];

        for (const config of configs) {
            // 1. Prepare sorted items clone
            const currentItems = [...remainingItems];
            if (config.sort === 'height') {
                currentItems.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
            } else {
                currentItems.sort((a, b) => (b.width * b.height) - (a.width * a.height));
            }

            // 2. Run Packer
            const packer = new GuillotinePacker(packW, packH, partSpacingX, partSpacingY, config.strategy);
            const packedIndices = new Set<number>(); // Indices relative to the *unsorted* remainingItems? No, local.
            const packedUids = new Set<string>();

            for (const item of currentItems) {
                const bestPos = packer.findPosition(item);
                if (bestPos) {
                    packer.placeItem(item, bestPos.rectIndex, bestPos.rotation);
                    packedUids.add(item.uid);
                }
            }

            // 3. Score
            const efficiency = calculateEfficiency(packer, packW * packH);
            // Count items packed
            const count = packedUids.size;
            // Combined Score: Higher count is priority, then density.
            // Score = count * 1000 + efficiency * 100
            const score = count * 1000 + efficiency * 100;

            // Map back to original indices
            const originalIndices = new Set<number>();
            remainingItems.forEach((item, idx) => {
                if (packedUids.has(item.uid)) originalIndices.add(idx);
            });

            strategies.push({ name: config.id, packer, packedIndices: originalIndices, score });
        }

        // --- PICK WINNER ---
        strategies.sort((a, b) => b.score - a.score);
        const winner = strategies[0];
        
        // Remove packed items from main queue
        if (winner.packedIndices.size === 0) {
            console.warn("Item too big for sheet:", remainingItems[0]);
            remainingItems.shift(); // Prevent infinite loop
            continue;
        }

        remainingItems = remainingItems.filter((_, i) => !winner.packedIndices.has(i));

        // Create Result Sheet from Winner
        const packer = winner.packer;
        
        // Auto-Calc Width Logic
        let finalSheetWidth = activeStock.width;
        let maxPlacedX = 0;
        packer.placedItems.forEach(p => {
            const w = (p.rotation === 90) ? p.item.rotatedWidth : p.item.width;
            if (p.x + w > maxPlacedX) maxPlacedX = p.x + w;
        });
        
        const isAutoCalc = settings.utilizationStrategy === SheetUtilizationStrategy.AutoCalculation;
        if (isAutoCalc) {
            const requiredPhys = sheetMarginLeft + maxPlacedX + sheetMarginRight;
            finalSheetWidth = Math.ceil(requiredPhys / 100) * 100;
            if (finalSheetWidth > 2560) finalSheetWidth = 2560;
        }

        const usedAreaPx = packer.placedItems.reduce((sum, p) => {
             const w = p.rotation === 90 ? p.item.rotatedWidth : p.item.width;
             const h = p.rotation === 90 ? p.item.rotatedHeight : p.item.height;
             return sum + (w * h);
        }, 0);
        const totalAreaPx = finalSheetWidth * activeStock.height;

        const resultSheet: NestResultSheet = {
            id: generateId(),
            sheetName: isAutoCalc ? `Auto ${finalSheetWidth}x${activeStock.height} (${winner.name})` : `Sheet ${completedSheets.length + 1}`,
            stockSheetId: activeStock.id,
            width: finalSheetWidth,
            height: activeStock.height,
            material: activeStock.material,
            thickness: activeStock.thickness,
            placedParts: packer.placedItems.map(p => {
                const ox = (p.rotation === 90) ? p.item.rotatedOffsetX : p.item.offsetX;
                const oy = (p.rotation === 90) ? p.item.rotatedOffsetY : p.item.offsetY;
                
                return {
                    id: generateId(),
                    partId: p.item.partId,
                    x: p.x + sheetMarginLeft + ox,
                    y: p.y + sheetMarginBottom + oy,
                    rotation: p.rotation
                };
            }),
            usedArea: totalAreaPx > 0 ? (usedAreaPx / totalAreaPx) * 100 : 0,
            scrapPercentage: totalAreaPx > 0 ? 100 - ((usedAreaPx / totalAreaPx) * 100) : 100,
            partCount: packer.placedItems.length,
            quantity: 1
        };

        completedSheets.push(resultSheet);
        
        await new Promise(resolve => setTimeout(resolve, 5));
        yield [...completedSheets];
    }
}
