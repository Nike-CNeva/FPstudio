
import { NestingSettings, SheetStock, SheetUtilizationStrategy } from '../../types';

/**
 * Вспомогательная функция выбора заготовки листа на основе стратегии и остатка на складе
 */
export function selectStockSheet(
    settings: NestingSettings, 
    remainingStock?: Map<string, number>
): SheetStock | null {
    // 1. Фильтруем листы, разрешенные для раскроя и имеющие положительный остаток
    const sheets = settings.availableSheets.filter(s => {
        if (!s.useInNesting) return false;
        if (remainingStock && remainingStock.has(s.id)) {
            return remainingStock.get(s.id)! > 0;
        }
        return s.quantity > 0;
    });

    if (sheets.length === 0) return null;

    // 2. Если задан активный лист и выбрана стратегия SelectedOnly или ListedOrder
    if (settings.activeSheetId) {
        const active = sheets.find(s => s.id === settings.activeSheetId);
        if (active && (settings.utilizationStrategy === SheetUtilizationStrategy.SelectedOnly || settings.utilizationStrategy === SheetUtilizationStrategy.ListedOrder)) {
            return active;
        }
    }

    switch (settings.utilizationStrategy) {
        case SheetUtilizationStrategy.SelectedOnly: {
            if (settings.activeSheetId) {
                const active = sheets.find(s => s.id === settings.activeSheetId);
                return active || null;
            }
            return sheets[0];
        }
        case SheetUtilizationStrategy.SmallestFirst:
            return [...sheets].sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
        
        case SheetUtilizationStrategy.FirstOnly:
            return sheets[0];

        case SheetUtilizationStrategy.BestFit:
            // Для BestFit в качестве базы выбираем наибольший доступный лист для максимальной эффективности
            return [...sheets].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];

        case SheetUtilizationStrategy.ListedOrder:
        default:
            return sheets[0];
    }
}
