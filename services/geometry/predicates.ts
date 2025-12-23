
import { Point, PartGeometry } from '../../types';

/**
 * Проверка пересечения луча с сегментом (вспомогательная для Ray Casting).
 */
export const rayIntersectsSegment = (p: Point, a: Point, b: Point): boolean => {
    if ((a.y > p.y) !== (b.y > p.y)) {
        const intersectX = a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y);
        if (intersectX > p.x) {
            return true;
        }
    }
    return false;
};

/**
 * Проверка: находится ли точка внутри контура (Ray Casting).
 */
export const isPointInsideContour = (point: Point, partGeometry: PartGeometry): boolean => {
    const { bbox, entities } = partGeometry;
    if (!bbox || !entities) return false;

    if (point.x < bbox.minX || point.x > bbox.maxX || point.y < bbox.minY || point.y > bbox.maxY) {
        return false;
    }

    let intersections = 0;
    for (const entity of entities) {
        switch (entity.type) {
            case 'LWPOLYLINE': {
                const vertices = entity.vertices;
                for (let i = 0; i < vertices.length; i++) {
                    const p1 = vertices[i];
                    const p2 = vertices[(i + 1) % vertices.length];
                    if (!entity.closed && i === vertices.length - 1) continue;
                    if (rayIntersectsSegment(point, p1, p2)) intersections++;
                }
                break;
            }
            case 'LINE': {
                if (rayIntersectsSegment(point, entity.start, entity.end)) intersections++;
                break;
            }
            case 'CIRCLE': {
                const dy = point.y - entity.center.y;
                if (Math.abs(dy) <= entity.radius) {
                    const dx = Math.sqrt(entity.radius * entity.radius - dy * dy);
                    if (entity.center.x - dx > point.x) intersections++;
                    if (entity.center.x + dx > point.x) intersections++;
                }
                break;
            }
            case 'ARC': {
                const dy = point.y - entity.center.y;
                if (Math.abs(dy) <= entity.radius) {
                     const dx = Math.sqrt(entity.radius * entity.radius - dy * dy);
                     const intersectXs = [entity.center.x - dx, entity.center.x + dx];
                     for (const ix of intersectXs) {
                         if (ix > point.x) {
                             const angle = Math.atan2(point.y - entity.center.y, ix - entity.center.x) * (180 / Math.PI);
                             let normAngle = angle < 0 ? angle + 360 : angle;
                             let start = entity.startAngle;
                             let end = entity.endAngle;
                             if (end < start) end += 360;
                             if (normAngle < start) normAngle += 360;
                             if (normAngle >= start && normAngle <= end) intersections++;
                         }
                     }
                }
                break;
            }
        }
    }
    return intersections % 2 !== 0;
};

/**
 * Проверка точки внутри прямоугольника с учетом вращения.
 */
export const isPointInRectangle = (point: Point, rectX: number, rectY: number, width: number, height: number, rotation: number): boolean => {
    const dx = point.x - rectX;
    const dy = point.y - rectY;
    const rad = -rotation * (Math.PI / 180);
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    return localX >= 0 && localX <= width && localY >= 0 && localY <= height;
};
