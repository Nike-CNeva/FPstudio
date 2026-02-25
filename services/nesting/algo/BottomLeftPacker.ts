
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, Point } from '../../../types';
import { getRotatedExtents, doPartsIntersect } from '../../geometry';

/**
 * BOTTOM-LEFT-FILL АЛГОРИТМ
 * Размещает детали как можно ниже и левее, максимизируя плотность упаковки
 */
export class BottomLeftPacker implements INestingPacker {
    private placed: { item: PackerItem; result: PlacedResult }[] = [];
    
    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly parts: Part[],
        private readonly tools: Tool[]
    ) {}

    /**
     * Находит самую нижнюю и левую позицию для детали
     */
    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        const rotationCandidates = [...item.allowedRotations];
        if (item.preferredRotation !== undefined && !rotationCandidates.includes(item.preferredRotation)) {
            rotationCandidates.unshift(item.preferredRotation);
        }

        let bestPosition: PlacedResult | null = null;
        let lowestY = Infinity;
        let leftmostX = Infinity;

        // Перебираем ротации
        for (const rot of rotationCandidates) {
            const extents = getRotatedExtents(partDef, rot, this.tools);
            if (extents.width > this.sheetW || extents.height > this.sheetH) continue;

            // Генерируем кандидатские позиции на основе уже размещенных деталей
            const candidatePositions = this.generateCandidatePositions(extents.width, extents.height);
            
            for (const { x, y } of candidatePositions) {
                if (x + extents.width > this.sheetW || y + extents.height > this.sheetH) continue;

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
                    // Bottom-Left критерий: сначала Y (ниже), затем X (левее)
                    if (y < lowestY || (y === lowestY && x < leftmostX)) {
                        lowestY = y;
                        leftmostX = x;
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
     * Генерирует умные кандидатские позиции на основе уже размещенных деталей
     */
    private generateCandidatePositions(itemWidth: number, itemHeight: number): { x: number; y: number }[] {
        const positions: { x: number; y: number }[] = [];
        
        // Всегда проверяем начало координат
        positions.push({ x: 0, y: 0 });

        // Генерируем позиции на основе углов существующих деталей
        for (const placed of this.placed) {
            const { x, y, width, height } = placed.result;
            
            // Правый нижний угол (справа от детали)
            positions.push({ x: x + width + this.spacingX, y: y });
            
            // Левый верхний угол (сверху от детали)
            positions.push({ x: x, y: y + height + this.spacingY });
            
            // Правый верхний угол (по диагонали)
            positions.push({ x: x + width + this.spacingX, y: y + height + this.spacingY });
            
            // Дополнительная позиция: на одной линии с верхним краем, слева
            positions.push({ x: 0, y: y + height + this.spacingY });
        }

        // Удаляем дубликаты и сортируем по Bottom-Left критерию
        const uniquePositions = Array.from(
            new Set(positions.map(p => `${p.x},${p.y}`))
        ).map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });

        // Сортировка: сначала по Y (снизу вверх), затем по X (слева направо)
        uniquePositions.sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });

        return uniquePositions;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        this.placed.push({ item, result });
    }

    getPlacedItems() {
        return this.placed;
    }
}
