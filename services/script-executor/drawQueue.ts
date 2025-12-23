
import { Point, DxfEntity, PlacedTool } from '../../types';
import { generateId } from '../../utils/helpers';

export type DrawOp = 
    | { type: 'move', x: number, y: number }
    | { type: 'line', x: number, y: number }
    | { type: 'arc', endX: number, endY: number, centerX: number, centerY: number, clockwise: boolean };

export interface RawPunch {
    toolId: string;
    x: number;
    y: number;
    rotation: number;
    lineId?: string;
}

/**
 * КЛАСС DrawQueue
 * Накапливает результаты выполнения скрипта и производит финальную 
 * нормализацию (центрирование) геометрии.
 */
export class DrawQueue {
    public ops: DrawOp[] = [];
    public rawPunches: RawPunch[] = [];

    addOp(op: DrawOp) { this.ops.push(op); }
    addPunch(p: RawPunch) { this.rawPunches.push(p); }

    /**
     * Вычисляет границы и возвращает данные для сборки Part
     */
    process() {
        if (this.ops.length === 0) throw new Error("Скрипт не сгенерировал геометрию.");

        // 1. Расчет Bounding Box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let curX = 0, curY = 0;

        const checkPoint = (x: number, y: number) => {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        };

        this.ops.forEach(op => {
            if (op.type === 'move' || op.type === 'line') {
                checkPoint(op.x, op.y);
                curX = op.x; curY = op.y;
            } else if (op.type === 'arc') {
                checkPoint(op.endX, op.endY);
                // Упрощенный расчет экстремумов дуги (можно расширить до точного)
                const r = Math.sqrt((curX - op.centerX)**2 + (curY - op.centerY)**2);
                checkPoint(op.centerX - r, op.centerY - r);
                checkPoint(op.centerX + r, op.centerY + r);
                curX = op.endX; curY = op.endY;
            }
        });

        const bbox = { minX, minY, maxX, maxY };
        const width = maxX - minX;
        const height = maxY - minY;

        // 2. Нормализация и генерация Path/Entities
        let path = "";
        const entities: DxfEntity[] = [];
        const normX = (v: number) => v - minX;
        const normY = (v: number) => v - minY;
        
        let penX = 0, penY = 0;

        this.ops.forEach(op => {
            const nx = normX(op.type === 'arc' ? op.endX : op.x);
            const ny = normY(op.type === 'arc' ? op.endY : op.y);

            if (op.type === 'move') {
                path += `M ${nx.toFixed(3)} ${ny.toFixed(3)} `;
            } else if (op.type === 'line') {
                path += `L ${nx.toFixed(3)} ${ny.toFixed(3)} `;
                entities.push({ type: 'LINE', start: { x: penX, y: penY }, end: { x: nx, y: ny } });
            } else if (op.type === 'arc') {
                const r = Math.sqrt((penX - normX(op.centerX))**2 + (penY - normY(op.centerY))**2);
                const largeArc = 0; // Требует доработки для скриптов
                const sweep = op.clockwise ? 1 : 0;
                path += `A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${largeArc} ${sweep} ${nx.toFixed(3)} ${ny.toFixed(3)} `;
                entities.push({ 
                    type: 'ARC', 
                    center: { x: normX(op.centerX), y: normY(op.centerY) }, 
                    radius: r, 
                    startAngle: 0, endAngle: 0 // Заглушка
                });
            }
            penX = nx; penY = ny;
        });

        const punches: PlacedTool[] = this.rawPunches.map(p => ({
            ...p, id: generateId(), x: normX(p.x), y: normY(p.y)
        }));

        return { path: path + " Z", width, height, entities, bbox: { minX: 0, minY: 0, maxX: width, maxY: height }, punches };
    }
}
