
import { ScheduledPart, Part, Tool } from '../../types';
import { PackerItem } from './types';
import { generateId } from '../../utils/helpers';
import { getRotatedExtents } from '../geometry';

/**
 * Превращает заказ деталей в плоский список элементов для упаковщика с расчетом габаритов.
 */
export const preparePackerItems = (
    scheduledParts: ScheduledPart[], 
    allParts: Part[], 
    tools: Tool[]
): PackerItem[] => {
    const items: PackerItem[] = [];
    
    for (const sp of scheduledParts) {
        const part = allParts.find(p => p.id === sp.partId);
        if (!part) continue;

        const ext0 = getRotatedExtents(part, 0, tools);
        const allowed: number[] = [0];
        if (sp.nesting.allow0_180) allowed.push(180);
        if (sp.nesting.allow90_270) { allowed.push(90); allowed.push(270); }

        for (let i = 0; i < sp.quantity; i++) {
            items.push({
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
    return items.sort((a, b) => b.area - a.area);
};
