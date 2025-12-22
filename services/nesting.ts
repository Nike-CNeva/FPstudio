import { 
    NestResultSheet, 
    ScheduledPart, 
    Part, 
    Tool, 
    NestingSettings, 
    SheetStock, 
    SheetUtilizationStrategy, 
    PlacedPart, 
    Point,
    ToolShape
} from '../types';
import { generateId } from '../utils/helpers';
import { getRotatedExtents, doPartsIntersect } from './geometry';

// ----------------------------------------------------------------------
// ТИПЫ ДАННЫХ ДЛЯ УПАКОВЩИКОВ
// ----------------------------------------------------------------------

export interface NestingProgressUpdate {
    sheets: NestResultSheet[];
    progress: number;
    status: string;
}

interface PackerItem {
    uid: string;
    partId: string;
    name: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    allowedRotations: number[];
    hasCommonLine: boolean;
    area: number;
    preferredRotation?: number;
    aspectRatio: number;
}

interface PlacedResult {
    x: number;      // Координата X (относительно области упаковки)
    y: number;      // Координата Y
    rotation: number;
    ox: number;     // Смещение начала координат детали (origin offset)
    oy: number;
    width: number;  // Итоговая ширина в этой ротации
    height: number; // Итоговая высота
}

/**
 * Единый интерфейс для всех алгоритмов раскроя
 */
interface INestingPacker {
    readonly sheetW: number;
    readonly sheetH: number;
    findPosition(item: PackerItem): Promise<PlacedResult | null>;
    placeItem(item: PackerItem, result: PlacedResult): void;
    getPlacedItems(): { item: PackerItem; result: PlacedResult }[];
}

// ----------------------------------------------------------------------
// АЛГОРИТМ 1: СЛОЖНЫЙ РАСКРОЙ (Irregular/Complex)
// ----------------------------------------------------------------------

class ComplexPacker implements INestingPacker {
    private placed: { item: PackerItem; result: PlacedResult }[] = [];
    
    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly parts: Part[],
        private readonly tools: Tool[]
    ) {}

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        const step = 5; // Шаг поиска (точность)
        const rotationCandidates = [...item.allowedRotations];
        if (item.preferredRotation !== undefined && !rotationCandidates.includes(item.preferredRotation)) {
            rotationCandidates.unshift(item.preferredRotation);
        }

        // Поиск: Сначала по X (минимизация длины листа), затем по Y
        for (let x = 0; x <= this.sheetW - step; x += step) {
            // Разрыв цикла для отзывчивости UI
            if (x % 50 === 0) await new Promise(resolve => setTimeout(resolve, 0));

            for (const rot of rotationCandidates) {
                const extents = getRotatedExtents(partDef, rot, this.tools);
                if (x + extents.width > this.sheetW) continue;

                for (let y = 0; y <= this.sheetH - extents.height; y += step) {
                    const candidateOrigin: Point = { x: x + extents.ox, y: y + extents.oy };
                    
                    let collision = false;
                    for (const placed of this.placed) {
                        const pPartDef = this.parts.find(p => p.id === placed.item.partId);
                        if (!pPartDef) continue;

                        const pOrigin: Point = { 
                            x: placed.result.x + placed.result.ox, 
                            y: placed.result.y + placed.result.oy 
                        };

                        if (doPartsIntersect(
                            partDef, candidateOrigin, rot,
                            pPartDef, pOrigin, placed.result.rotation,
                            Math.max(this.spacingX, this.spacingY)
                        )) {
                            collision = true;
                            break;
                        }
                    }

                    if (!collision) {
                        return { x, y, rotation: rot, ox: extents.ox, oy: extents.oy, width: extents.width, height: extents.height };
                    }
                }
            }
        }
        return null;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        this.placed.push({ item, result });
    }

    getPlacedItems() { return this.placed; }
}

// ----------------------------------------------------------------------
// АЛГОРИТМ 2: ПРЯМОУГОЛЬНЫЙ РАСКРОЙ (MaxRects)
// ----------------------------------------------------------------------

interface FreeRect { x: number; y: number; w: number; h: number; }

class RectanglePacker implements INestingPacker {
    private freeRects: FreeRect[];
    private placed: { item: PackerItem; result: PlacedResult }[] = [];

    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly useCommonLine: boolean,
        private readonly parts: Part[],
        private readonly tools: Tool[]
    ) {
        this.freeRects = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
    }

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        let bestScore = Infinity;
        let bestRect: FreeRect | null = null;
        let bestRot = 0;
        let finalSX = 0;
        let finalSY = 0;

        const rotations = [0];
        if (item.allowedRotations.includes(90) || item.allowedRotations.includes(270)) rotations.push(90);

        for (const rect of this.freeRects) {
            for (const rot of rotations) {
                const isRot = rot === 90;
                const curW = isRot ? item.height : item.width;
                const curH = isRot ? item.width : item.height;

                const sX = rect.x === 0 ? 0 : this.spacingX;
                const sY = rect.y === 0 ? 0 : this.spacingY;
                
                const effW = curW + sX;
                const effH = curH + sY;

                if (effW <= rect.w && effH <= rect.h) {
                    const score = Math.min(rect.w - effW, rect.h - effH);
                    if (score < bestScore) {
                        bestScore = score;
                        bestRect = rect;
                        bestRot = rot;
                        finalSX = sX;
                        finalSY = sY;
                    }
                }
            }
        }

        if (bestRect) {
            const partDef = this.parts.find(p => p.id === item.partId);
            const ext = partDef ? getRotatedExtents(partDef, bestRot, this.tools) : { ox: 0, oy: 0, width: 0, height: 0 };
            return {
                x: bestRect.x + finalSX,
                y: bestRect.y + finalSY,
                rotation: bestRot,
                ox: ext.ox,
                oy: ext.oy,
                width: ext.width,
                height: ext.height
            };
        }
        return null;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        this.placed.push({ item, result });
        const used: FreeRect = { x: result.x, y: result.y, w: result.width, h: result.height };
        
        const nextFree: FreeRect[] = [];
        for (const f of this.freeRects) {
            if (this.intersects(f, used)) {
                if (used.x > f.x) nextFree.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
                if (used.x + used.w < f.x + f.w) nextFree.push({ x: used.x + used.w, y: f.y, w: (f.x + f.w) - (used.x + used.w), h: f.h });
                if (used.y > f.y) nextFree.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
                if (used.y + used.h < f.y + f.h) nextFree.push({ x: f.x, y: used.y + used.h, w: f.w, h: (f.y + f.h) - (used.y + used.h) });
            } else {
                nextFree.push(f);
            }
        }
        this.freeRects = nextFree.filter(r => r.w > 1 && r.h > 1);
    }

    private intersects(a: FreeRect, b: FreeRect) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    getPlacedItems() { return this.placed; }
}

// ----------------------------------------------------------------------
// ГЕНЕРАТОР РАСКРОЯ
// ----------------------------------------------------------------------

export async function* nestingGenerator(
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[], 
    settings: NestingSettings
): AsyncGenerator<NestingProgressUpdate> {
    
    // 1. Подготовка очереди деталей
    const itemsToPack: PackerItem[] = [];
    for (const sp of scheduledParts) {
        const part = allParts.find(p => p.id === sp.partId);
        if (!part) continue;

        const ext0 = getRotatedExtents(part, 0, tools);
        const allowed: number[] = [0];
        if (sp.nesting.allow0_180) allowed.push(180);
        if (sp.nesting.allow90_270) { allowed.push(90); allowed.push(270); }

        for (let i = 0; i < sp.quantity; i++) {
            itemsToPack.push({
                uid: generateId(),
                partId: sp.partId,
                name: part.name,
                width: ext0.width,
                height: ext0.height,
                offsetX: ext0.ox,
                offsetY: ext0.oy,
                allowedRotations: allowed,
                hasCommonLine: sp.nesting.commonLine,
                area: ext0.width * ext0.height,
                aspectRatio: ext0.width / ext0.height
            });
        }
    }

    // Сортировка по убыванию площади (стандарт для упаковки)
    itemsToPack.sort((a, b) => b.area - a.area);

    const totalToPack = itemsToPack.length;
    let totalPackedCount = 0;
    const completedSheets: NestResultSheet[] = [];
    let remainingItems = [...itemsToPack];

    // 2. Цикл по листам
    while (remainingItems.length > 0) {
        const stockSheet = selectStockSheet(settings);
        if (!stockSheet) break;

        const effectiveW = stockSheet.width - settings.sheetMarginLeft - settings.sheetMarginRight;
        const effectiveH = stockSheet.height - settings.sheetMarginTop - settings.sheetMarginBottom;

        // Инициализация упаковщика согласно настройкам
        const packer: INestingPacker = settings.nestAsRectangle 
            ? new RectanglePacker(effectiveW, effectiveH, settings.partSpacingX, settings.partSpacingY, settings.useCommonLine, allParts, tools)
            : new ComplexPacker(effectiveW, effectiveH, settings.partSpacingX, settings.partSpacingY, allParts, tools);

        let packedOnThisSheet: string[] = [];

        for (const item of remainingItems) {
            const pos = await packer.findPosition(item);
            if (pos) {
                packer.placeItem(item, pos);
                packedOnThisSheet.push(item.uid);
                totalPackedCount++;
                
                yield { 
                    sheets: [...completedSheets], 
                    progress: (totalPackedCount / totalToPack) * 100, 
                    status: `Размещение: ${item.name}` 
                };
            }
        }

        if (packedOnThisSheet.length === 0) {
            console.error("Item too big for sheet", remainingItems[0]);
            remainingItems.shift(); // Пропускаем проблемную деталь
            continue;
        }

        // Удаляем упакованные из общего списка
        remainingItems = remainingItems.filter(it => !packedOnThisSheet.includes(it.uid));

        // 3. Формирование результата
        const placedItems = packer.getPlacedItems();
        const usedAreaPx = placedItems.reduce((sum, p) => sum + p.item.area, 0);
        const totalAreaPx = stockSheet.width * stockSheet.height;

        const resultSheet: NestResultSheet = {
            id: generateId(),
            sheetName: `Sheet ${completedSheets.length + 1}`,
            stockSheetId: stockSheet.id,
            width: stockSheet.width,
            height: stockSheet.height,
            material: stockSheet.material,
            thickness: stockSheet.thickness,
            usedArea: (usedAreaPx / totalAreaPx) * 100,
            scrapPercentage: 100 - (usedAreaPx / totalAreaPx) * 100,
            partCount: placedItems.length,
            quantity: 1, // Дупликация листов может быть добавлена здесь
            placedParts: placedItems.map(p => ({
                id: generateId(),
                partId: p.item.partId,
                x: p.result.x + settings.sheetMarginLeft + p.result.ox,
                y: p.result.y + settings.sheetMarginBottom + p.result.oy,
                rotation: p.result.rotation
            }))
        };

        completedSheets.push(resultSheet);
        yield { sheets: [...completedSheets], progress: (totalPackedCount / totalToPack) * 100, status: `Лист #${completedSheets.length} готов` };
    }
}

/**
 * Вспомогательная функция выбора заготовки листа на основе стратегии
 */
function selectStockSheet(settings: NestingSettings): SheetStock | null {
    const sheets = settings.availableSheets.filter(s => s.useInNesting && s.quantity > 0);
    if (sheets.length === 0) return null;

    switch (settings.utilizationStrategy) {
        case SheetUtilizationStrategy.SmallestFirst:
            return [...sheets].sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
        case SheetUtilizationStrategy.BestFit:
            // В данной реализации просто берем первый доступный, BestFit требует прогонки раскроя по всем
            return sheets[0];
        case SheetUtilizationStrategy.ListedOrder:
        default:
            return sheets[0];
    }
}
