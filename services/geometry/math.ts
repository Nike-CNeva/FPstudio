
import { Point, PartGeometry } from '../../types';

/**
 * Квадрат расстояния между точками.
 */
export const distanceSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

/**
 * Нормализация точки относительно границ (смещение в 0,0).
 */
export const normalize = (p: Point, bbox: PartGeometry['bbox']) => ({
    x: p.x - bbox.minX,
    y: p.y - bbox.minY
});

/**
 * Площадь полигона (метод шнурования).
 */
export const polygonArea = (vertices: Point[]): number => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area / 2);
};

/**
 * Геометрический центр набора точек.
 */
export const polygonCenter = (vertices: Point[]): Point => {
    let x = 0;
    let y = 0;
    for(const v of vertices) {
        x += v.x;
        y += v.y;
    }
    return { x: x / vertices.length, y: y / vertices.length };
};
