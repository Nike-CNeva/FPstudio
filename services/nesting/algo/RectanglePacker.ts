
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool } from '../../../types';
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
        private readonly tools: Tool[]
    ) {
        this.freeRects = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
    }

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        let bestScore = Infinity;
        let bestRect: FreeRect | null = null;
        let bestRot = 0;
        let finalSX = 0;
        let finalSY = 0;

        const rotations = [0];
        if (item.allowedRotations.includes(90) || item.allowedRotations.includes(270)) rotations.push(90);

        for (const rect of this.freeRects) {
            for (const rot of rotations) {
                const isRot = rot === 90;
                const curW = isRot ? item.height : item.width;
                const curH = isRot ? item.width : item.height;

                const sX = rect.x === 0 ? 0 : this.spacingX;
                const sY = rect.y === 0 ? 0 : this.spacingY;
                
                const effW = curW + sX;
                const effH = curH + sY;

                if (effW <= rect.w && effH <= rect.h) {
                    const score = Math.min(rect.w - effW, rect.h - effH);
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
