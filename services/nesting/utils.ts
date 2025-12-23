
import { NestingSettings, SheetStock, SheetUtilizationStrategy } from '../../types';

/**
 * Вспомогательная функция выбора заготовки листа на основе стратегии
 */
export function selectStockSheet(settings: NestingSettings): SheetStock | null {
    const sheets = settings.availableSheets.filter(s => s.useInNesting && s.quantity > 0);
    if (sheets.length === 0) return null;

    switch (settings.utilizationStrategy) {
        case SheetUtilizationStrategy.SmallestFirst:
            return [...sheets].sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
        case SheetUtilizationStrategy.BestFit:
            // В данной реализации просто берем первый доступный
            return sheets[0];
        case SheetUtilizationStrategy.ListedOrder:
        default:
            return sheets[0];
    }
}
