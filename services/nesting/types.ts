
import { NestResultSheet } from '../../types';

export interface NestingProgressUpdate {
    sheets: NestResultSheet[];
    progress: number;
    status: string;
}

export interface PackerItem {
    uid: string;
    partId: string;
    name: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    allowedRotations: number[];
    hasCommonLine: boolean;
    area: number;
    preferredRotation?: number;
    aspectRatio: number;
}

export interface PlacedResult {
    x: number;      // Координата X (относительно области упаковки)
    y: number;      // Координата Y
    rotation: number;
    ox: number;     // Смещение начала координат детали (origin offset)
    oy: number;
    width: number;  // Итоговая ширина в этой ротации
    height: number; // Итоговая высота
}

/**
 * Единый интерфейс для всех алгоритмов раскроя
 */
export interface INestingPacker {
    readonly sheetW: number;
    readonly sheetH: number;
    findPosition(item: PackerItem): Promise<PlacedResult | null>;
    placeItem(item: PackerItem, result: PlacedResult): void;
    getPlacedItems(): { item: PackerItem; result: PlacedResult }[];
}
