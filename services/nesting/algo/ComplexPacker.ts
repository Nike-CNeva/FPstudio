
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, Point } from '../../../types';
import { getRotatedExtents, isPointInsideContour } from '../../geometry';

interface RasterMask {
    width: number;
    height: number;
    data: Uint8Array; // 1 = Part Material, 0 = Empty
    offsetX: number;  // Смещение внутри маски до начала координат (0,0) детали
    offsetY: number;
}

export class ComplexPacker implements INestingPacker {
    // Глобальная сетка листа: 1D массив, эмулирующий 2D (index = y * width + x)
    // 0 = Свободно, 1 = Занято
    private grid: Uint8Array;
    private readonly gridW: number;
    private readonly gridH: number;
    private readonly resolution: number = 1; // 1 пиксель = 1 мм (Максимальная точность)

    // Кэш растеризованных масок для (PartId + Rotation)
    // Ключ: `${partId}_${rotation}`
    private maskCache: Map<string, RasterMask> = new Map();
    
    private placedItems: { item: PackerItem; result: PlacedResult }[] = [];

    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly parts: Part[],
        private readonly tools: Tool[]
    ) {
        this.gridW = Math.ceil(sheetW / this.resolution);
        this.gridH = Math.ceil(sheetH / this.resolution);
        this.grid = new Uint8Array(this.gridW * this.gridH);
    }

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        // Собираем уникальные ротации
        const rotations = Array.from(new Set([
            ...(item.preferredRotation !== undefined ? [item.preferredRotation] : []),
            ...item.allowedRotations
        ]));

        const step = 1; // Шаг 1мм по просьбе пользователя для максимальной плотности
        
        let bestResult: PlacedResult | null = null;

        // Стратегия: LEFT-MOST PACKING (Приоритет X)
        // Мы ищем позицию с минимальным X. При равных X берем минимальный Y.
        // Это позволяет детали "всплывать" или "опускаться" по Y, чтобы найти "карман" левее.

        for (const rot of rotations) {
            const mask = this.getOrGenerateMask(partDef, rot);

            // Пропуск, если деталь больше листа
            if (mask.width > this.gridW || mask.height > this.gridH) continue;

            const limitX = this.gridW - mask.width;
            const limitY = this.gridH - mask.height;

            let foundPosForRot: { x: number, y: number } | null = null;

            // Внешний цикл по X: Мы хотим заполнять лист слева направо.
            // Это радикально меняет поведение по сравнению с построчным (Y-first) заполнением.
            // Теперь алгоритм проверит Y=0, Y=50, Y=100 для X=0, прежде чем перейти к X=1.
            xLoop: for (let x = 0; x <= limitX; x += step) {
                
                // Оптимизация отсечения (Pruning):
                // Если мы уже нашли решение в другой ротации с X=100, 
                // а сейчас мы проверяем X=101, то нет смысла продолжать эту ротацию.
                // Мы ищем МИНИМАЛЬНЫЙ X глобально.
                if (bestResult && (x * this.resolution) > bestResult.x) {
                    break xLoop; 
                }

                // Внутренний цикл по Y: Ищем любое свободное место по вертикали для текущего X
                for (let y = 0; y <= limitY; y += step) {
                    if (!this.checkCollision(x, y, mask)) {
                        foundPosForRot = { x, y };
                        break xLoop; // Для этой ротации это наилучший X (т.к. цикл X возрастает)
                    }
                }
                
                // UI responsiveness (реже, т.к. X цикл длиннее, но break срабатывает часто)
                if (x % 50 === 0) await new Promise(r => setTimeout(r, 0));
            }

            if (foundPosForRot) {
                const candidate: PlacedResult = {
                    x: foundPosForRot.x * this.resolution,
                    y: foundPosForRot.y * this.resolution,
                    rotation: rot,
                    width: mask.width * this.resolution,
                    height: mask.height * this.resolution,
                    ox: mask.offsetX,
                    oy: mask.offsetY
                };

                // Сравниваем с лучшим результатом других ротаций
                if (!bestResult) {
                    bestResult = candidate;
                } else {
                    // Приоритет 1: Меньше X
                    if (candidate.x < bestResult.x) {
                        bestResult = candidate;
                    } 
                    // Приоритет 2: При равном X, меньше Y (для компактности снизу)
                    else if (candidate.x === bestResult.x && candidate.y < bestResult.y) {
                        bestResult = candidate;
                    }
                }
            }
        }

        return bestResult;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return;

        const mask = this.getOrGenerateMask(partDef, result.rotation);
        
        const gridX = Math.round(result.x / this.resolution);
        const gridY = Math.round(result.y / this.resolution);

        this.writeMaskToGrid(gridX, gridY, mask);
        this.placedItems.push({ item, result });
    }

    getPlacedItems() {
        return this.placedItems;
    }

    // --- Private Methods ---

    private checkCollision(sx: number, sy: number, mask: RasterMask): boolean {
        // Быстрая проверка границ массива
        if (sx + mask.width > this.gridW || sy + mask.height > this.gridH) return true;

        // Оптимизация: Проверяем центр и углы сначала, так как там чаще всего бывают коллизии
        // Центр
        const cy = Math.floor(mask.height/2);
        const cx = Math.floor(mask.width/2);
        if (mask.data[cy * mask.width + cx] && this.grid[(sy + cy) * this.gridW + (sx + cx)]) return true;
        
        // Углы (TL, TR, BL, BR) - если там есть материал
        const mw = mask.width;
        const mh = mask.height;
        // TL
        if (mask.data[0] && this.grid[sy * this.gridW + sx]) return true;
        
        // Полный проход
        for (let my = 0; my < mh; my++) {
            const sheetRowOffset = (sy + my) * this.gridW + sx;
            const maskRowOffset = my * mw;

            for (let mx = 0; mx < mw; mx++) {
                if (mask.data[maskRowOffset + mx] === 1) {
                    if (this.grid[sheetRowOffset + mx] === 1) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private writeMaskToGrid(sx: number, sy: number, mask: RasterMask) {
        for (let my = 0; my < mask.height; my++) {
            const sheetRowOffset = (sy + my) * this.gridW + sx;
            const maskRowOffset = my * mask.width;

            for (let mx = 0; mx < mask.width; mx++) {
                if (mask.data[maskRowOffset + mx] === 1) {
                    this.grid[sheetRowOffset + mx] = 1;
                }
            }
        }
    }

    private getOrGenerateMask(part: Part, rotation: number): RasterMask {
        const key = `${part.id}_${rotation}`;
        if (this.maskCache.has(key)) {
            return this.maskCache.get(key)!;
        }

        const extents = getRotatedExtents(part, rotation, this.tools);
        
        // Spacing: увеличиваем маску детали, чтобы обеспечить зазор.
        // Маска = Деталь + Spacing справа и снизу (условно).
        const spacing = Math.ceil(Math.max(this.spacingX, this.spacingY) / this.resolution);
        
        const rawW = Math.ceil(extents.width / this.resolution);
        const rawH = Math.ceil(extents.height / this.resolution);
        
        const maskW = rawW + spacing; 
        const maskH = rawH + spacing;

        const data = new Uint8Array(maskW * maskH);

        const rad = -rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        for (let y = 0; y < rawH; y++) {
            for (let x = 0; x < rawW; x++) {
                const bboxX = x * this.resolution;
                const bboxY = y * this.resolution;

                // Перевод в систему координат детали
                const rotX = bboxX - extents.ox;
                const rotY = bboxY - extents.oy;

                const localX = rotX * cos - rotY * sin;
                const localY = rotX * sin + rotY * cos;

                if (isPointInsideContour({ x: localX, y: localY }, part.geometry)) {
                    const idx = y * maskW + x;
                    data[idx] = 1;

                    // Dilate (расширение) на величину spacing
                    if (spacing > 0) {
                        // Рисуем "тень" безопасности вправо
                        for(let s=1; s<=spacing; s++) {
                            if (x + s < maskW) data[y * maskW + (x + s)] = 1;
                        }
                        // Рисуем "тень" безопасности вниз
                        for(let sy=1; sy<=spacing; sy++) {
                            if (y + sy < maskH) {
                                const rowOff = (y + sy) * maskW;
                                for(let sx=0; sx<=spacing; sx++) {
                                    if (x + sx < maskW) data[rowOff + (x + sx)] = 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        const mask: RasterMask = {
            width: maskW,
            height: maskH,
            data: data,
            offsetX: extents.ox,
            offsetY: extents.oy
        };

        this.maskCache.set(key, mask);
        return mask;
    }
}
