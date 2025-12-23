
/**
 * ОТВЕТСТВЕННОСТЬ: Низкоуровневые геометрические проверки для процесса авто-расстановки.
 */
import { Point, Tool, PlacedTool } from '../../types';
import { Segment } from '../geometry';

/**
 * Проверка: находится ли центр удара на (или вблизи) сегмента геометрии.
 */
export const isPunchOnSegment = (p: Omit<PlacedTool, 'id'>, seg: Segment, tools: Tool[]): boolean => {
    const tool = tools.find(t => t.id === p.toolId);
    const maxDim = tool ? Math.max(tool.width, tool.height) : 20;
    const MARGIN = (maxDim / 2) + 2.0;

    const minX = Math.min(seg.p1.x, seg.p2.x) - MARGIN;
    const maxX = Math.max(seg.p1.x, seg.p2.x) + MARGIN;
    const minY = Math.min(seg.p1.y, seg.p2.y) - MARGIN;
    const maxY = Math.max(seg.p1.y, seg.p2.y) + MARGIN;
    
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;

    if (seg.type === 'line') {
        const l2 = (seg.p2.x - seg.p1.x)**2 + (seg.p2.y - seg.p1.y)**2;
        if (l2 === 0) return false;
        const t = ((p.x - seg.p1.x) * (seg.p2.x - seg.p1.x) + (p.y - seg.p1.y) * (seg.p2.y - seg.p1.y)) / l2;
        if (t < -0.1 || t > 1.1) return false;
        const projX = seg.p1.x + t * (seg.p2.x - seg.p1.x);
        const projY = seg.p1.y + t * (seg.p2.y - seg.p1.y);
        const distSq = (p.x - projX)**2 + (p.y - projY)**2;
        return distSq < (MARGIN * MARGIN);
    } 
    else if (seg.type === 'arc' && seg.center && seg.radius) {
        const d = Math.sqrt((p.x - seg.center.x)**2 + (p.y - seg.center.y)**2);
        return Math.abs(d - seg.radius) < MARGIN;
    }
    return false;
};

/**
 * Получение вектора направления от вершины вдоль сегмента (касательная для дуг).
 */
export const getVectorFromVertex = (seg: Segment, v: Point): {x:number, y:number} => {
    const other = (Math.abs(seg.p1.x - v.x) < 0.001 && Math.abs(seg.p1.y - v.y) < 0.001) ? seg.p2 : seg.p1;
    let vec = { x: other.x - v.x, y: other.y - v.y };
    
    if (seg.type === 'arc' && seg.center) {
        const nx = v.x - seg.center.x;
        const ny = v.y - seg.center.y;
        const t1 = { x: -ny, y: nx };
        const dot1 = t1.x * vec.x + t1.y * vec.y;
        if (dot1 > 0) return t1;
        return { x: ny, y: -nx };
    }
    return vec;
};
