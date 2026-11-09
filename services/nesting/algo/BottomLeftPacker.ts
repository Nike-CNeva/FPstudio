
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, Point, NestingSettings } from '../../../types';
import { getRotatedExtents, doPartsIntersect } from '../../geometry';

/**
 * BOTTOM-LEFT / DIRECTIONAL FILL АЛГОРИТМ
 * Размещает детали в соответствии с заданным направлением (например, Top-Left или Bottom-Left),
 * соблюдая зоны зажимов листа.
 */
export class BottomLeftPacker implements INestingPacker {
    private placed: { item: PackerItem; result: PlacedResult }[] = [];
    
    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly parts: Part[],
        private readonly tools: Tool[],
        private readonly settings?: NestingSettings
    ) {}

    /**
     * Проверка попадания детали в защитную зону зажимов листа
     */
    private isClampCollision(x: number, y: number, width: number, height: number): boolean {
        if (!this.settings || this.settings.nestUnderClamps) return false;
        const marginLeft = this.settings.sheetMarginLeft || 0;
        const marginBottom = this.settings.sheetMarginBottom || 0;
        
        const sheetX1 = x + marginLeft;
        const sheetX2 = sheetX1 + width;
        const sheetY1 = y + marginBottom;
        
        const clampDeadZoneY = 80;
        if (sheetY1 > clampDeadZoneY) return false;

        const clampHalfWidth = 65;
        for (const clampX of this.settings.clampPositions || []) {
            const cMin = clampX - clampHalfWidth;
            const cMax = clampX + clampHalfWidth;
            if (Math.max(0, Math.min(sheetX2, cMax) - Math.max(sheetX1, cMin)) > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Оценка штрафа позиции в зависимости от направления раскроя (0..8)
     */
    private calculateDirectionPenalty(x: number, y: number, w: number, h: number): number {
        const dir = this.settings?.nestingDirection ?? 6;
        const topGap = this.sheetH - (y + h);
        const rightGap = this.sheetW - (x + w);

        switch (dir) {
            case 6: // Top-Left
                return topGap * 1000 + x;
            case 7: // Top-Center
                return topGap * 1000 + Math.abs(x + w / 2 - this.sheetW / 2);
            case 8: // Top-Right
                return topGap * 1000 + rightGap;
            case 3: // Center-Left
                return Math.abs(y + h / 2 - this.sheetH / 2) * 1000 + x;
            case 4: // Center
                return Math.hypot(x + w / 2 - this.sheetW / 2, y + h / 2 - this.sheetH / 2);
            case 5: // Center-Right
                return Math.abs(y + h / 2 - this.sheetH / 2) * 1000 + rightGap;
            case 1: // Bottom-Center
                return y * 1000 + Math.abs(x + w / 2 - this.sheetW / 2);
            case 2: // Bottom-Right
                return y * 1000 + rightGap;
            case 0: // Bottom-Left
            default:
                return y * 1000 + x;
        }
    }

    /**
     * Находит наилучшую позицию для детали с учетом направления
     */
    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        const rotationCandidates = [...item.allowedRotations];
        if (item.preferredRotation !== undefined && !rotationCandidates.includes(item.preferredRotation)) {
            rotationCandidates.unshift(item.preferredRotation);
        }

        let bestPosition: PlacedResult | null = null;
        let bestScore = Infinity;

        // Перебираем ротации
        for (const rot of rotationCandidates) {
            const extents = getRotatedExtents(partDef, rot, this.tools);
            if (extents.width > this.sheetW || extents.height > this.sheetH) continue;

            const candidatePositions = this.generateCandidatePositions(extents.width, extents.height);
            
            let lastYieldTime = Date.now();
            for (const { x, y } of candidatePositions) {
                const now = Date.now();
                if (now - lastYieldTime > 40) {
                    await new Promise(r => setTimeout(r, 0));
                    lastYieldTime = Date.now();
                }

                if (x < 0 || y < 0 || x + extents.width > this.sheetW || y + extents.height > this.sheetH) continue;

                // Проверка зажимов
                if (this.isClampCollision(x, y, extents.width, extents.height)) continue;

                const candidateOrigin: Point = { x: x + extents.ox, y: y + extents.oy };
                
                // Проверка пересечений
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
                    const score = this.calculateDirectionPenalty(x, y, extents.width, extents.height);
                    if (score < bestScore) {
                        bestScore = score;
                        bestPosition = {
                            x, y,
                            rotation: rot,
                            ox: extents.ox,
                            oy: extents.oy,
                            width: extents.width,
                            height: extents.height
                        };
                    }
                }
            }
        }

        return bestPosition;
    }

    /**
     * Генерирует кандидатские позиции на основе целевого угла и существующих деталей
     */
    private generateCandidatePositions(itemWidth: number, itemHeight: number): { x: number; y: number }[] {
        const positions: { x: number; y: number }[] = [];
        const dir = this.settings?.nestingDirection ?? 6;

        // Начальные угловые точки в зависимости от направления
        positions.push({ x: 0, y: 0 }); // Bottom-Left
        positions.push({ x: 0, y: Math.max(0, this.sheetH - itemHeight) }); // Top-Left
        positions.push({ x: Math.max(0, this.sheetW - itemWidth), y: Math.max(0, this.sheetH - itemHeight) }); // Top-Right
        positions.push({ x: Math.max(0, this.sheetW - itemWidth), y: 0 }); // Bottom-Right

        // Генерируем позиции на основе существующих деталей
        for (const placed of this.placed) {
            const { x, y, width, height } = placed.result;
            
            // Справа от детали
            positions.push({ x: x + width + this.spacingX, y: y });
            // Слева от детали
            positions.push({ x: x - itemWidth - this.spacingX, y: y });
            // Сверху от детали
            positions.push({ x: x, y: y + height + this.spacingY });
            // Снизу от детали
            positions.push({ x: x, y: y - itemHeight - this.spacingY });
            
            // Диагональные углы
            positions.push({ x: x + width + this.spacingX, y: y + height + this.spacingY });
            positions.push({ x: x + width + this.spacingX, y: y - itemHeight - this.spacingY });
            positions.push({ x: x - itemWidth - this.spacingX, y: y + height + this.spacingY });
            positions.push({ x: x - itemWidth - this.spacingX, y: y - itemHeight - this.spacingY });
        }

        // Фильтруем допустимые неотрицательные координаты
        const validPositions = positions.filter(p => p.x >= 0 && p.y >= 0 && p.x + itemWidth <= this.sheetW && p.y + itemHeight <= this.sheetH);

        // Удаляем дубликаты
        const uniqueMap = new Map<string, { x: number; y: number }>();
        for (const p of validPositions) {
            const k = `${Math.round(p.x)},${Math.round(p.y)}`;
            if (!uniqueMap.has(k)) uniqueMap.set(k, p);
        }

        const result = Array.from(uniqueMap.values());

        // Сортируем согласно штрафу направления
        result.sort((a, b) => {
            return this.calculateDirectionPenalty(a.x, a.y, itemWidth, itemHeight) -
                   this.calculateDirectionPenalty(b.x, b.y, itemWidth, itemHeight);
        });

        return result;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        this.placed.push({ item, result });
    }

    getPlacedItems() {
        return this.placed;
    }
}
