
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
import { preparePackerItemsImproved, SortStrategy } from './nesting/scoring-improved';
import { RectanglePacker } from './nesting/algo/RectanglePacker';
import { ComplexPacker } from './nesting/algo/ComplexPacker';
import { ComplexPackerFast } from './nesting/algo/ComplexPackerFast';
import { BottomLeftPacker } from './nesting/algo/BottomLeftPacker';

export type { NestingProgressUpdate };

/**
 * Тип алгоритма упаковки
 */
export type PackingAlgorithm = 
    | 'rectangle-basic'      // Базовый прямоугольный (быстрый)
    | 'rectangle-guillotine' // Прямоугольный с гильотинной нарезкой
    | 'complex-basic'        // Базовый сложный (медленный, точный)
    | 'complex-fast'         // Быстрый сложный с адаптивным шагом
    | 'bottom-left'          // Bottom-Left для максимального заполнения
    | 'hybrid';              // Гибридный (автовыбор)

/**
 * Расширенные настройки раскроя
 */
export interface ExtendedNestingSettings extends NestingSettings {
    algorithm?: PackingAlgorithm;
    sortStrategy?: SortStrategy;
}

/**
 * УЛУЧШЕННЫЙ ГЕНЕРАТОР РАСКРОЯ
 * Поддерживает множественные алгоритмы и стратегии оптимизации
 */
export async function* nestingGeneratorImproved(
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[], 
    settings: ExtendedNestingSettings
): AsyncGenerator<NestingProgressUpdate> {
    
    // Выбор алгоритма и стратегии сортировки
    const algorithm = settings.algorithm || 'hybrid';
    const sortStrategy = settings.sortStrategy || 'hybrid-score';
    
    // Получаем размеры листа для генетической оптимизации
    const stockSheet = selectStockSheet(settings);
    const sheetWidth = stockSheet ? stockSheet.width : undefined;
    const sheetHeight = stockSheet ? stockSheet.height : undefined;

    // 1. Подготовка очереди деталей с улучшенной сортировкой
    const itemsToPack = preparePackerItemsImproved(
        scheduledParts, 
        allParts, 
        tools, 
        sortStrategy,
        sheetWidth,
        sheetHeight
    );

    const totalToPack = itemsToPack.length;
    let totalPackedCount = 0;
    const completedSheets: NestResultSheet[] = [];
    let remainingItems = [...itemsToPack];

    // 2. Цикл по листам
    while (remainingItems.length > 0) {
        const currentSheet = selectStockSheet(settings);
        if (!currentSheet) break;

        const effectiveW = currentSheet.width - settings.sheetMarginLeft - settings.sheetMarginRight;
        const effectiveH = currentSheet.height - settings.sheetMarginTop - settings.sheetMarginBottom;

        // Инициализация упаковщика согласно выбранному алгоритму
        const packer = createPacker(
            algorithm,
            effectiveW,
            effectiveH,
            settings,
            allParts,
            tools,
            remainingItems.length
        );

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
                    status: `Размещение: ${item.name} [${algorithm}]` 
                };
            }
        }

        if (packedOnThisSheet.length === 0) {
            console.error("Деталь слишком большая для листа", remainingItems[0]);
            remainingItems.shift(); // Пропускаем
            continue;
        }

        // Удаляем успешно упакованные
        remainingItems = remainingItems.filter(it => !packedOnThisSheet.includes(it.uid));

        // 3. Формирование итогового объекта листа
        const placedItems = packer.getPlacedItems();
        const usedAreaPx = placedItems.reduce((sum, p) => sum + p.item.area, 0);
        const totalAreaPx = currentSheet.width * currentSheet.height;

        const resultSheet: NestResultSheet = {
            id: generateId(),
            sheetName: `Sheet ${completedSheets.length + 1}`,
            stockSheetId: currentSheet.id,
            width: currentSheet.width,
            height: currentSheet.height,
            material: currentSheet.material,
            thickness: currentSheet.thickness,
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

        // Проверка на идентичность с предыдущим листом
        const lastSheet = completedSheets.length > 0 ? completedSheets[completedSheets.length - 1] : null;
        
        if (lastSheet && areSheetsIdentical(lastSheet, resultSheet)) {
            // Если листы идентичны, увеличиваем счетчик предыдущего
            const updatedLastSheet = { ...lastSheet, quantity: lastSheet.quantity + 1 };
            completedSheets[completedSheets.length - 1] = updatedLastSheet;
            
            yield { 
                sheets: [...completedSheets], 
                progress: (totalPackedCount / totalToPack) * 100, 
                status: `Лист #${completedSheets.length} (x${updatedLastSheet.quantity}) готов` 
            };
        } else {
            // Иначе добавляем новый лист
            // Если были сгруппированные листы до этого, нужно обновить имя текущего?
            // Обычно Sheet 1, Sheet 2... Если Sheet 1 имеет quantity 5, следующий будет Sheet 2 или Sheet 6?
            // Обычно в интерфейсе просто список уникальных раскладок. Пусть будет Sheet N по порядку уникальных.
            resultSheet.sheetName = `Sheet ${completedSheets.length + 1}`;
            
            completedSheets.push(resultSheet);
            yield { 
                sheets: [...completedSheets], 
                progress: (totalPackedCount / totalToPack) * 100, 
                status: `Лист #${completedSheets.length} готов (${resultSheet.usedArea.toFixed(1)}% заполнение)` 
            };
        }
    }
}

/**
 * Проверка идентичности двух листов раскроя
 */
function areSheetsIdentical(sheetA: NestResultSheet, sheetB: NestResultSheet): boolean {
    // 1. Проверка исходного листа
    if (sheetA.stockSheetId !== sheetB.stockSheetId) return false;
    
    // 2. Проверка количества деталей
    if (sheetA.placedParts.length !== sheetB.placedParts.length) return false;
    
    // 3. Проверка расположения деталей
    // Предполагаем, что упаковщик детерминирован и порядок деталей совпадает
    for (let i = 0; i < sheetA.placedParts.length; i++) {
        const pA = sheetA.placedParts[i];
        const pB = sheetB.placedParts[i];
        
        if (pA.partId !== pB.partId) return false;
        
        // Сравниваем координаты и поворот с небольшим допуском
        if (Math.abs(pA.x - pB.x) > 0.001) return false;
        if (Math.abs(pA.y - pB.y) > 0.001) return false;
        if (Math.abs(pA.rotation - pB.rotation) > 0.1) return false;
    }
    
    return true;
}

/**
 * Фабрика упаковщиков
 */
function createPacker(
    algorithm: PackingAlgorithm,
    width: number,
    height: number,
    settings: ExtendedNestingSettings,
    parts: Part[],
    tools: Tool[],
    remainingItemsCount: number
): INestingPacker {
    
    const { partSpacingX, partSpacingY, useCommonLine, nestAsRectangle } = settings;

    switch (algorithm) {
        case 'rectangle-basic':
        case 'rectangle-guillotine':
            return new RectanglePacker(
                width, height, 
                partSpacingX, partSpacingY, 
                useCommonLine, 
                parts, tools
            );
        
        case 'complex-basic':
            return new ComplexPacker(
                width, height,
                partSpacingX, partSpacingY,
                parts, tools
            );
        
        case 'complex-fast':
            return new ComplexPackerFast(
                width, height,
                partSpacingX, partSpacingY,
                parts, tools
            );
        
        case 'bottom-left':
            return new BottomLeftPacker(
                width, height,
                partSpacingX, partSpacingY,
                parts, tools
            );
        
        case 'hybrid':
        default:
            // Умный выбор: для прямоугольного режима или большого количества деталей - Rectangle
            // Для сложных форм и малого количества - ComplexFast или BottomLeft
            if (nestAsRectangle || remainingItemsCount > 50) {
                return new RectanglePacker(
                    width, height,
                    partSpacingX, partSpacingY,
                    useCommonLine,
                    parts, tools
                );
            } else if (remainingItemsCount < 10) {
                return new BottomLeftPacker(
                    width, height,
                    partSpacingX, partSpacingY,
                    parts, tools
                );
            } else {
                return new ComplexPackerFast(
                    width, height,
                    partSpacingX, partSpacingY,
                    parts, tools
                );
            }
    }
}

// Экспорт оригинального генератора для обратной совместимости
export { nestingGenerator } from './nesting';
