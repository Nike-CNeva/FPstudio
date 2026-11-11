
import { Point, Part, Tool, ToolShape } from '../../types';

/**
 * Расчет физических границ детали при повороте.
 */
export const getRotatedExtents = (part: Part, rotation: number, tools: Tool[]) => {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const basePoints: Point[] = [
        { x: 0, y: 0 },
        { x: part.geometry.width, y: 0 },
        { x: part.geometry.width, y: part.geometry.height },
        { x: 0, y: part.geometry.height }
    ];

    basePoints.forEach(p => {
        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;
        if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    });

    part.punches.forEach(p => {
        const tool = tools.find(t => t.id === p.toolId);
        if (!tool) return;
        const punchRad = (p.rotation + rotation) * Math.PI / 180;
        const tCos = Math.abs(Math.cos(punchRad));
        const tSin = Math.abs(Math.sin(punchRad));
        let tW = tool.width;
        let tH = tool.shape === ToolShape.Circle ? tool.width : tool.height;
        const effW = tW * tCos + tH * tSin;
        const effH = tW * tSin + tH * tCos;
        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;
        if (rx - effW/2 < minX) minX = rx - effW/2;
        if (rx + effW/2 > maxX) maxX = rx + effW/2;
        if (ry - effH/2 < minY) minY = ry - effH/2;
        if (ry + effH/2 > maxY) maxY = ry + effH/2;
    });

    return {
        width: maxX - minX,
        height: maxY - minY,
        ox: -minX,
        oy: -minY
    };
};

/**
 * Вершины повернутого прямоугольника.
 */
export const getRotatedRectVertices = (x: number, y: number, w: number, h: number, rotation: number): Point[] => {
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
        { x: x, y: y },
        { x: x + w * cos, y: y + w * sin },
        { x: x + w * cos - h * sin, y: y + w * sin + h * cos },
        { x: x - h * sin, y: y + h * cos }
    ];
};

/**
 * Координаты углов инструмента с учетом вращения.
 */
export const getToolCorners = (tool: Tool, x: number, y: number, rotation: number): Point[] => {
    const w = tool.width;
    const h = tool.shape === ToolShape.Circle ? tool.width : tool.height;
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [{ x: -w/2, y: -h/2 }, { x: w/2, y: -h/2 }, { x: w/2, y: h/2 }, { x: -w/2, y: h/2 }];
    return corners.map(p => ({
        x: x + (p.x * cos - p.y * sin),
        y: y + (p.x * sin + p.y * cos)
    }));
};
