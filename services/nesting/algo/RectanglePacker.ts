
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, NestingSettings } from '../../../types';
import { getRotatedExtents } from '../../geometry';

interface FreeRect { x: number; y: number; w: number; h: number; }

export class RectanglePacker implements INestingPacker {
    private freeRects: FreeRect[];
    private placed: { item: PackerItem; result: PlacedResult }[] = [];

    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly useCommonLine: boolean,
        private readonly parts: Part[],
        private readonly tools: Tool[],
        private readonly settings?: NestingSettings
    ) {
        this.freeRects = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
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
        
        // Зона зажима по Y (стандартно 80мм от нижнего края заготовки)
        const clampDeadZoneY = 80;
        if (sheetY1 > clampDeadZoneY) return false;

        const clampHalfWidth = 65; // полуширина защитной зоны зажима
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
     * Оценка привлекательности позиции в зависимости от направления раскладки (nestingDirection 0..8)
     */
    private calculateDirectionPenalty(x: number, y: number, w: number, h: number): number {
        const dir = this.settings?.nestingDirection ?? 6; // по умолчанию 6 (Top-Left)
        const topGap = this.sheetH - (y + h);
        const rightGap = this.sheetW - (x + w);

        switch (dir) {
            case 6: // Top-Left (сверху-вниз, слева-направо)
                return topGap * 1000 + x;
            case 7: // Top-Center
                return topGap * 1000 + Math.abs(x + w / 2 - this.sheetW / 2);
            case 8: // Top-Right (сверху-вниз, справа-налево)
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
            case 0: // Bottom-Left (снизу-вверх, слева-направо)
            default:
                return y * 1000 + x;
        }
    }

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        let bestScore = Infinity;
        let bestRect: FreeRect | null = null;
        let bestRot = 0;
        let finalSX = 0;
        let finalSY = 0;

        // Перебираем все разрешенные углы поворота детали
        const rotations = item.allowedRotations.length > 0 ? item.allowedRotations : [0];

        let lastYieldTime = Date.now();

        // Сортируем свободные прямоугольники в соответствии с целевым направлением
        const sortedRects = [...this.freeRects].sort((a, b) => {
            const penA = this.calculateDirectionPenalty(a.x, a.y, 0, 0);
            const penB = this.calculateDirectionPenalty(b.x, b.y, 0, 0);
            return penA - penB;
        });

        for (const rect of sortedRects) {
            for (const rot of rotations) {
                const now = Date.now();
                if (now - lastYieldTime > 40) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    lastYieldTime = Date.now();
                }

                const isRot90or270 = rot === 90 || rot === 270;
                const curW = isRot90or270 ? item.height : item.width;
                const curH = isRot90or270 ? item.width : item.height;

                const isCommon = this.useCommonLine && item.hasCommonLine;
                const sX = rect.x === 0 ? 0 : (isCommon ? 0 : this.spacingX);
                const sY = rect.y === 0 ? 0 : (isCommon ? 0 : this.spacingY);
                
                const effW = curW + sX;
                const effH = curH + sY;

                if (effW <= rect.w && effH <= rect.h) {
                    const posX = rect.x + sX;
                    const posY = rect.y + sY;

                    // Проверка коллизии с зажимами
                    if (this.isClampCollision(posX, posY, curW, curH)) {
                        continue;
                    }

                    // Комбинированный скор: штраф за направление + штраф за остаточный зазор (best-fit)
                    const dirPenalty = this.calculateDirectionPenalty(posX, posY, curW, curH);
                    const fitPenalty = Math.min(rect.w - effW, rect.h - effH) * 0.1;
                    const score = dirPenalty + fitPenalty;

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
