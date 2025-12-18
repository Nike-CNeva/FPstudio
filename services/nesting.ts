
import { NestResultSheet, ScheduledPart, Part, Tool, NestingSettings, SheetStock, SheetUtilizationStrategy, PlacedPart, Point, NestingConstraints } from '../types';
import { generateId } from '../utils/helpers';
import { getRotatedExtents, isPointInsideContour, getToolCorners } from './geometry';

// ----------------------------------------------------------------------
// ГЛОБАЛЬНЫЕ НАСТРОЙКИ СЕТКИ
// ----------------------------------------------------------------------
const GRID_RES = 4; 

export interface NestingProgressUpdate {
    sheets: NestResultSheet[];
    progress: number;
    status: string;
}

interface PartMask {
    rotation: number;
    width: number;
    height: number;
    gridW: number;
    gridH: number;
    relativePoints: {gx: number, gy: number}[];
    ox: number;
    oy: number;
    avgDepthLeft: number;
    avgDepthRight: number;
    avgDepthBottom: number;
    avgDepthTop: number;
}

interface BakedPart {
    partId: string;
    masks: Map<number, PartMask>; // Хранит все 4 поворота: 0, 90, 180, 270
}

// ----------------------------------------------------------------------
// ГЕНЕРАТОР МАСОК
// ----------------------------------------------------------------------

const bakePartFull = (part: Part, tools: Tool[]): BakedPart => {
    const masks = new Map<number, PartMask>();
    const allRotations = [0, 90, 180, 270];

    allRotations.forEach(rot => {
        const extents = getRotatedExtents(part, rot, tools);
        const gridW = Math.ceil(extents.width / GRID_RES);
        const gridH = Math.ceil(extents.height / GRID_RES);

        const canvas = new OffscreenCanvas(gridW, gridH);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.fillStyle = 'black';
        ctx.translate(extents.ox / GRID_RES, extents.oy / GRID_RES);
        ctx.scale(1 / GRID_RES, 1 / GRID_RES);
        ctx.rotate(rot * Math.PI / 180);

        const path = new Path2D(part.geometry.path);
        ctx.fill(path);

        part.punches.forEach(p => {
            const tool = tools.find(t => t.id === p.toolId);
            if (!tool) return;
            const corners = getToolCorners(tool, p.x, p.y, p.rotation);
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
            ctx.closePath();
            ctx.fill();
        });

        const imgData = ctx.getImageData(0, 0, gridW, gridH);
        const relPoints: {gx: number, gy: number}[] = [];
        const rowsMinX = new Array(gridH).fill(gridW);
        const rowsMaxX = new Array(gridH).fill(0);
        const colsMinY = new Array(gridW).fill(gridH);
        const colsMaxY = new Array(gridW).fill(0);

        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const alpha = imgData.data[(gy * gridW + gx) * 4 + 3];
                if (alpha > 10) {
                    relPoints.push({ gx, gy });
                    if (gx < rowsMinX[gy]) rowsMinX[gy] = gx;
                    if (gx > rowsMaxX[gy]) rowsMaxX[gy] = gx;
                    if (gy < colsMinY[gx]) colsMinY[gx] = gy;
                    if (gy > colsMaxY[gx]) colsMaxY[gx] = gy;
                }
            }
        }

        const avg = (arr: number[], limit: number) => arr.length === 0 ? 0 : arr.reduce((s, v) => s + (v === limit ? 0 : v), 0) / arr.length;
        const avgMax = (arr: number[], limit: number) => arr.length === 0 ? 0 : arr.reduce((s, v) => s +