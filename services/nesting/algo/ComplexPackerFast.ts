
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, Point, NestingSettings } from '../../../types';
import { getRotatedExtents, doPartsIntersect } from '../../geometry';

/**
 * ОПТИМИЗИРОВАННЫЙ COMPLEX PACKER
 * Использует адаптивный шаг поиска, пространственную индексацию,
 * сканирование в направлении nestingDirection и учет зажимов.
 */
export class ComplexPackerFast implements INestingPacker {
    private placed: { item: PackerItem; result: PlacedResult }[] = [];
    private spatialGrid: Map<string, { item: PackerItem; result: PlacedResult }[]>;
    private gridCellSize: number;
    
    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly parts: Part[],
        private readonly tools: Tool[],
        private readonly settings?: NestingSettings
    ) {
        // Пространственная сетка для ускорения проверки пересечений
        this.gridCellSize = 100; // Размер ячейки сетки
        this.spatialGrid = new Map();
    }

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
     * Получить ключ ячейки сетки
     */
    private getGridKey(x: number, y: number): string {
        const gx = Math.floor(x / this.gridCellSize);
        const gy = Math.floor(y / this.gridCellSize);
        return `${gx},${gy}`;
    }

    /**
     * Получить все ячейки, которые может занимать деталь
     */
    private getOccupiedCells(x: number, y: number, width: number, height: number): string[] {
        const cells: string[] = [];
        const minGx = Math.floor(x / this.gridCellSize);
        const maxGx = Math.floor((x + width) / this.gridCellSize);
        const minGy = Math.floor(y / this.gridCellSize);
        const maxGy = Math.floor((y + height) / this.gridCellSize);
        
        for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                cells.push(`${gx},${gy}`);
            }
        }
        return cells;
    }

    /**
     * Добавить деталь в пространственную сетку
     */
    private addToGrid(item: PackerItem, result: PlacedResult) {
        const cells = this.getOccupiedCells(result.x, result.y, result.width, result.height);
        for (const cellKey of cells) {
            if (!this.spatialGrid.has(cellKey)) {
                this.spatialGrid.set(cellKey, []);
            }
            this.spatialGrid.get(cellKey)!.push({ item, result });
        }
    }

    /**
     * Получить соседние детали для проверки пересечения
     */
    private getNearbyParts(x: number, y: number, width: number, height: number): { item: PackerItem; result: PlacedResult }[] {
        const cells = this.getOccupiedCells(x, y, width, height);
        const nearby = new Set<{ item: PackerItem; result: PlacedResult }>();
        
        for (const cellKey of cells) {
            const cellParts = this.spatialGrid.get(cellKey);
            if (cellParts) {
                cellParts.forEach(p => nearby.add(p));
            }
        }
        
        return Array.from(nearby);
    }

    /**
     * АДАПТИВНЫЙ ПОИСК ПОЗИЦИИ
     * Использует двухэтапный подход: грубый поиск + точная настройка
     */
    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        // Шаг 1: Грубый поиск с большим шагом
        const coarseStep = 20;
        const candidates: PlacedResult[] = [];

        const rotationCandidates = [...item.allowedRotations];
        if (item.preferredRotation !== undefined && !rotationCandidates.includes(item.preferredRotation)) {
            rotationCandidates.unshift(item.preferredRotation);
        }

        const dir = this.settings?.nestingDirection ?? 6;
        const isTopFirst = dir === 6 || dir === 7 || dir === 8;
        const isRightFirst = dir === 2 || dir === 5 || dir === 8;

        // Грубый проход
        let lastYieldTime = Date.now();
        for (const rot of rotationCandidates) {
            const extents = getRotatedExtents(partDef, rot, this.tools);
            if (extents.width > this.sheetW || extents.height > this.sheetH) continue;

            const startX = isRightFirst ? Math.max(0, this.sheetW - extents.width) : 0;
            const endX = isRightFirst ? 0 : Math.max(0, this.sheetW - extents.width);
            const stepX = isRightFirst ? -coarseStep : coarseStep;

            const startY = isTopFirst ? Math.max(0, this.sheetH - extents.height) : 0;
            const endY = isTopFirst ? 0 : Math.max(0, this.sheetH - extents.height);
            const stepY = isTopFirst ? -coarseStep : coarseStep;

            for (let x = startX; isRightFirst ? x >= endX : x <= endX; x += stepX) {
                // Асинхронная пауза каждые 40мс для отзывчивости UI
                const now = Date.now();
                if (now - lastYieldTime > 40) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    lastYieldTime = Date.now();
                }

                for (let y = startY; isTopFirst ? y >= endY : y <= endY; y += stepY) {
                    if (this.isClampCollision(x, y, extents.width, extents.height)) {
                        continue;
                    }

                    const candidateOrigin: Point = { x: x + extents.ox, y: y + extents.oy };
                    
                    // Проверка пересечений только с близкими деталями
                    const nearbyParts = this.getNearbyParts(x, y, extents.width, extents.height);
                    let collision = false;

                    for (const placed of nearbyParts) {
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
                        return { 
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

        // Шаг 2: Если грубый поиск не дал результата, пробуем точный поиск в начале листа
        if (candidates.length === 0 && this.placed.length < 5) {
            const fineStep = 5;
            for (const rot of rotationCandidates) {
                const extents = getRotatedExtents(partDef, rot, this.tools);
                if (extents.width > this.sheetW || extents.height > this.sheetH) continue;

                for (let x = 0; x <= Math.min(200, this.sheetW - extents.width); x += fineStep) {
                    for (let y = 0; y <= Math.min(200, this.sheetH - extents.height); y += fineStep) {
                        const candidateOrigin: Point = { x: x + extents.ox, y: y + extents.oy };
                        
                        const nearbyParts = this.getNearbyParts(x, y, extents.width, extents.height);
                        let collision = false;

                        for (const placed of nearbyParts) {
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
                            return { 
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
        }

        return null;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        this.placed.push({ item, result });
        this.addToGrid(item, result);
    }

    getPlacedItems() { 
        return this.placed; 
    }
}
