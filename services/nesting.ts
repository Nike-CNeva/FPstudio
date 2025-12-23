
import { 
    NestResultSheet, 
    ScheduledPart, 
    Part, 
    Tool, 
    NestingSettings
} from '../types';
import { generateId } from '../utils/helpers';
import { INestingPacker, NestingProgressUpdate } from './nesting/types';
import { selectStockSheet } from './nesting/utils';
import { preparePackerItems } from './nesting/scoring';
import { RectanglePacker } from './nesting/algo/RectanglePacker';
import { ComplexPacker } from './nesting/algo/ComplexPacker';

export type { NestingProgressUpdate };

/**
 * ГЕНЕРАТОР РАСКРОЯ
 * Главная точка входа, координирующая процесс укладки деталей на листы.
 */
export async function* nestingGenerator(
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[], 
    settings: NestingSettings
): AsyncGenerator<NestingProgressUpdate> {
    
    // 1. Подготовка очереди деталей с расчетом площадей и приоритетов
    const itemsToPack = preparePackerItems(scheduledParts, allParts, tools);

    const totalToPack = itemsToPack.length;
    let totalPackedCount = 0;
    const completedSheets: NestResultSheet[] = [];
    let remainingItems = [...itemsToPack];

    // 2. Цикл по листам (пока есть неразмещенные детали)
    while (remainingItems.length > 0) {
        const stockSheet = selectStockSheet(settings);
        if (!stockSheet) break;

        const effectiveW = stockSheet.width - settings.sheetMarginLeft - settings.sheetMarginRight;
        const effectiveH = stockSheet.height - settings.sheetMarginTop - settings.sheetMarginBottom;

        // Инициализация упаковщика согласно настройкам (прямоугольники или сложная форма)
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
                
                // Промежуточное обновление прогресса
                yield { 
                    sheets: [...completedSheets], 
                    progress: (totalPackedCount / totalToPack) * 100, 
                    status: `Размещение: ${item.name}` 
                };
            }
        }

        if (packedOnThisSheet.length === 0) {
            console.error("Item too big for sheet", remainingItems[0]);
            remainingItems.shift(); // Пропускаем деталь, которая не лезет ни на один пустой лист
            continue;
        }

        // Удаляем успешно упакованные из общего списка
        remainingItems = remainingItems.filter(it => !packedOnThisSheet.includes(it.uid));

        // 3. Формирование итогового объекта листа
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
            quantity: 1,
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
