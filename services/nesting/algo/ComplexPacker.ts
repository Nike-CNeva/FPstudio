
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, Point } from '../../../types';
import { getRotatedExtents, doPartsIntersect } from '../../geometry';

export class ComplexPacker implements INestingPacker {
    private placed: { item: PackerItem; result: PlacedResult }[] = [];
    
    constructor(
        public readonly sheetW: number,
        public readonly sheetH: number,
        private readonly spacingX: number,
        private readonly spacingY: number,
        private readonly parts: Part[],
        private readonly tools: Tool[]
    ) {}

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        const step = 5; // Шаг поиска (точность)
        const rotationCandidates = [...item.allowedRotations];
        if (item.preferredRotation !== undefined && !rotationCandidates.includes(item.preferredRotation)) {
            rotationCandidates.unshift(item.preferredRotation);
        }

        for (let x = 0; x <= this.sheetW - step; x += step) {
            if (x % 50 === 0) await new Promise(resolve => setTimeout(resolve, 0));

            for (const rot of rotationCandidates) {
                const extents = getRotatedExtents(partDef, rot, this.tools);
                if (x + extents.width > this.sheetW) continue;

                for (let y = 0; y <= this.sheetH - extents.height; y += step) {
                    const candidateOrigin: Point = { x: x + extents.ox, y: y + extents.oy };
                    
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
                        return { x, y, rotation: rot, ox: extents.ox, oy: extents.oy, width: extents.width, height: extents.height };
                    }
                }
            }
        }
        return null;
    }

    placeItem(item: PackerItem, result: PlacedResult) {
        this.placed.push({ item, result });
    }

    getPlacedItems() { return this.placed; }
}
