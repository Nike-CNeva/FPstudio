
import { INestingPacker, PackerItem, PlacedResult } from '../types';
import { Part, Tool, Point } from '../../../types';
import { getRotatedExtents, isPointInsideContour } from '../../geometry';

interface RasterMask {
    width: number;
    height: number;
    data: Uint8Array; // 1 = Part Material, 0 = Empty
    // Offset to convert grid index to physical coordinates relative to placement origin
    offsetX: number; 
    offsetY: number;
}

export class ComplexPacker implements INestingPacker {
    private grid: Uint8Array;
    private readonly gridW: number;
    private readonly gridH: number;
    private readonly resolution: number = 1; // 1 pixel = 1 mm for high precision

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
        // Initialize grid with 0 (empty)
        this.grid = new Uint8Array(this.gridW * this.gridH);
    }

    async findPosition(item: PackerItem): Promise<PlacedResult | null> {
        const partDef = this.parts.find(p => p.id === item.partId);
        if (!partDef) return null;

        const rotations = Array.from(new Set([
            ...(item.preferredRotation !== undefined ? [item.preferredRotation] : []),
            ...item.allowedRotations
        ]));

        let bestResult: PlacedResult | null = null;

        // Strategy: Try all rotations, find the one that places the part with minimal X (Left-Most), then minimal Y.
        // This allows the part to "slide" up and down (Y axis) to find the deepest slot in the X axis.

        for (const rot of rotations) {
            // Get mask with spacing included for collision check
            const mask = this.getOrGenerateMask(partDef, rot, true);

            if (mask.width > this.gridW || mask.height > this.gridH) continue;

            const limitX = this.gridW - mask.width;
            const limitY = this.gridH - mask.height;

            let foundPosForRot: { x: number, y: number } | null = null;

            // Scan X first, then Y. This is the "Left-Bottom" strategy.
            // We want to pack as far left as possible. Vertical position is secondary.
            // To support "offset by height", checking every Y for a given X is critical.
            
            const step = 1; 

            xLoop: for (let x = 0; x <= limitX; x += step) {
                // Pruning: If we already found a position in another rotation at X_best,
                // and current x > X_best, we can stop scanning this rotation because it won't beat the best X.
                if (bestResult && x > (bestResult.x / this.resolution)) {
                    break xLoop;
                }

                // Yield to UI thread occasionally if needed (async)
                if (x % 50 === 0) await new Promise(r => setTimeout(r, 0));

                for (let y = 0; y <= limitY; y += step) {
                    if (!this.checkCollision(x, y, mask)) {
                        foundPosForRot = { x, y };
                        break xLoop; // Found the best X for this rotation (since we scan X increasing)
                    }
                }
            }

            if (foundPosForRot) {
                // We must return the physical extents (without spacing dilation) for the final placement result
                const physicalExtents = getRotatedExtents(partDef, rot, this.tools);
                
                const candidate: PlacedResult = {
                    x: foundPosForRot.x * this.resolution,
                    y: foundPosForRot.y * this.resolution,
                    rotation: rot,
                    width: physicalExtents.width,
                    height: physicalExtents.height,
                    ox: physicalExtents.ox,
                    oy: physicalExtents.oy
                };

                if (!bestResult) {
                    bestResult = candidate;
                } else {
                    // Compare candidates. Priority: Min X, then Min Y.
                    if (candidate.x < bestResult.x) {
                        bestResult = candidate;
                    } else if (Math.abs(candidate.x - bestResult.x) < 0.1 && candidate.y < bestResult.y) {
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

        // Write the PART geometry (without spacing) to the grid as "Occupied"
        // Why? Because spacing is handled by the *search* mask (Part + Spacing).
        // The grid should represent actual material.
        const mask = this.getOrGenerateMask(partDef, result.rotation, false);
        
        const gridX = Math.round(result.x / this.resolution);
        const gridY = Math.round(result.y / this.resolution);

        this.writeMaskToGrid(gridX, gridY, mask);
        this.placedItems.push({ item, result });
    }

    getPlacedItems() {
        return this.placedItems;
    }

    // --- Private ---

    private checkCollision(sx: number, sy: number, mask: RasterMask): boolean {
        // Bounds check
        if (sx + mask.width > this.gridW || sy + mask.height > this.gridH) return true;

        // Mask scan
        for (let y = 0; y < mask.height; y++) {
            const gridRowOffset = (sy + y) * this.gridW + sx;
            const maskRowOffset = y * mask.width;
            
            for (let x = 0; x < mask.width; x++) {
                if (mask.data[maskRowOffset + x] === 1) {
                    if (this.grid[gridRowOffset + x] === 1) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private writeMaskToGrid(sx: number, sy: number, mask: RasterMask) {
        for (let y = 0; y < mask.height; y++) {
            const gridRowOffset = (sy + y) * this.gridW + sx;
            const maskRowOffset = y * mask.width;
            for (let x = 0; x < mask.width; x++) {
                if (mask.data[maskRowOffset + x] === 1) {
                    this.grid[gridRowOffset + x] = 1;
                }
            }
        }
    }

    private getOrGenerateMask(part: Part, rotation: number, includeSpacing: boolean): RasterMask {
        const key = `${part.id}_${rotation}_${includeSpacing ? 'spaced' : 'raw'}`;
        if (this.maskCache.has(key)) return this.maskCache.get(key)!;

        const extents = getRotatedExtents(part, rotation, this.tools);
        
        // If including spacing, expand dimensions
        const spX = includeSpacing ? Math.ceil(this.spacingX / this.resolution) : 0;
        const spY = includeSpacing ? Math.ceil(this.spacingY / this.resolution) : 0;

        const rawW = Math.ceil(extents.width / this.resolution);
        const rawH = Math.ceil(extents.height / this.resolution);
        
        const maskW = rawW + spX;
        const maskH = rawH + spY;

        const data = new Uint8Array(maskW * maskH);

        const rad = -rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Rasterize
        for (let y = 0; y < rawH; y++) {
            for (let x = 0; x < rawW; x++) {
                // Center of pixel in part coords
                const px = x * this.resolution;
                const py = y * this.resolution;

                // Transform to Part Local Coords
                // extents.ox/oy shifts bbox min to 0,0.
                const rotX = px - extents.ox;
                const rotY = py - extents.oy;

                const localX = rotX * cos - rotY * sin;
                const localY = rotX * sin + rotY * cos;

                if (isPointInsideContour({ x: localX, y: localY }, part.geometry)) {
                    // Mark this pixel
                    const idx = y * maskW + x;
                    data[idx] = 1;

                    // If spacing is required, dilate this pixel to the right and bottom
                    // Effectively treating every pixel as a box of (1+spX)x(1+spY)
                    if (includeSpacing) {
                        for (let dy = 0; dy <= spY; dy++) {
                            for (let dx = 0; dx <= spX; dx++) {
                                if (x + dx < maskW && y + dy < maskH) {
                                    data[(y + dy) * maskW + (x + dx)] = 1;
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
            data,
            offsetX: extents.ox,
            offsetY: extents.oy
        };

        this.maskCache.set(key, mask);
        return mask;
    }
}
