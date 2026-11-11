
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

/**
 * Возвращает полный полигональный контур инструмента с учетом формы (Circle, Square, Rectangle, Oblong).
 * Для круга аппроксимируется 16-угольником, для продолговатого (oblong) - со скругленными краями.
 */
export const getToolPolygon = (tool: Tool, x: number, y: number, rotation: number): Point[] => {
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const transform = (localX: number, localY: number): Point => ({
        x: x + (localX * cos - localY * sin),
        y: y + (localX * sin + localY * cos)
    });

    if (tool.shape === ToolShape.Circle) {
        const r = tool.width / 2;
        const pts: Point[] = [];
        const n = 16;
        for (let i = 0; i < n; i++) {
            const a = (i * 2 * Math.PI) / n;
            pts.push(transform(r * Math.cos(a), r * Math.sin(a)));
        }
        return pts;
    }

    if (tool.shape === ToolShape.Oblong) {
        const w = tool.width;
        const h = tool.height;
        const pts: Point[] = [];
        if (w >= h) {
            const r = h / 2;
            const halfStraight = (w - h) / 2;
            // Правый полукруг
            for (let i = -4; i <= 4; i++) {
                const a = (i * Math.PI) / 8;
                pts.push(transform(halfStraight + r * Math.cos(a), r * Math.sin(a)));
            }
            // Левый полукруг
            for (let i = 4; i <= 12; i++) {
                const a = (i * Math.PI) / 8;
                pts.push(transform(-halfStraight + r * Math.cos(a), r * Math.sin(a)));
            }
        } else {
            const r = w / 2;
            const halfStraight = (h - w) / 2;
            // Верхний полукруг
            for (let i = 0; i <= 8; i++) {
                const a = (i * Math.PI) / 8;
                pts.push(transform(r * Math.cos(a), halfStraight + r * Math.sin(a)));
            }
            // Нижний полукруг
            for (let i = 8; i <= 16; i++) {
                const a = (i * Math.PI) / 8;
                pts.push(transform(r * Math.cos(a), -halfStraight + r * Math.sin(a)));
            }
        }
        return pts;
    }

    if (tool.shape === ToolShape.Special && tool.customPath) {
        // Парсим SVG путь в полигональные точки специнструмента (относительно центра пуансона)
        const pts = parseSvgPathToPoints(tool.customPath, tool.width, tool.height);
        if (pts.length > 0) {
            return pts.map(p => transform(p.x, p.y));
        }
    }

    // По умолчанию: прямоугольник / квадрат
    return getToolCorners(tool, x, y, rotation);
};

/**
 * Преобразует SVG path специнструмента в центрированные вершины полигона (относительно центра 0,0).
 */
export const parseSvgPathToPoints = (pathStr: string, width: number, height: number): Point[] => {
    const pts: Point[] = [];
    const commands = pathStr.match(/[MLAZmlaz][^MLAZmlaz]*/g);
    if (!commands) return [];

    let curX = 0;
    let curY = 0;

    for (const cmd of commands) {
        const type = cmd[0];
        const nums = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

        if (type === 'M' || type === 'L') {
            for (let i = 0; i < nums.length; i += 2) {
                curX = nums[i];
                curY = nums[i + 1];
                pts.push({ x: curX - width / 2, y: curY - height / 2 });
            }
        } else if (type === 'A') {
            // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
            if (nums.length >= 7) {
                curX = nums[5];
                curY = nums[6];
                pts.push({ x: curX - width / 2, y: curY - height / 2 });
            }
        }
    }

    return pts;
};

/**
 * Ограничивающий прямоугольник (AABB) отпечатка удара инструмента на плоскости.
 */
export const getToolBoundingBox = (tool: Tool, x: number, y: number, rotation: number): { minX: number, maxX: number, minY: number, maxY: number } => {
    const pts = getToolPolygon(tool, x, y, rotation);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
};
