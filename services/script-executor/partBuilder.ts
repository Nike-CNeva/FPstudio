
import { Tool } from '../../types';
import { generateId } from '../../utils/helpers';
import { DrawQueue } from './drawQueue';

const findToolByPattern = (tools: Tool[], pattern: string): Tool | undefined => {
    if (!pattern) return undefined;
    const cleanName = pattern.split(' ')[0].trim().toUpperCase();
    return tools.find(t => t.name.toUpperCase().includes(cleanName));
};

export const createPartBuilder = (queue: DrawQueue, tools: Tool[]) => ({
    SetMaterial: () => {},
    SetControllerIndex: () => {}, 
    
    StartContour: (x: number, y: number) => {
        queue.addOp({ type: 'move', x, y });
    },
    LineTo: (x: number, y: number) => {
        queue.addOp({ type: 'line', x, y });
    },
    ArcTo: (endX: number, endY: number, centerX: number, centerY: number, clockwise: boolean) => {
        queue.addOp({ type: 'arc', endX, endY, centerX, centerY, clockwise });
    },
    NibbleLine: (toolPattern: string, x1: number, y1: number, x2: number, y2: number, angle: number, pitch: number) => {
        const tool = findToolByPattern(tools, toolPattern);
        if (!tool) return;
        const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const count = Math.max(1, Math.ceil(dist / pitch));
        const dx = (x2 - x1) / count;
        const dy = (y2 - y1) / count;
        const lineId = `script_nibble_${generateId()}`;
        for (let i = 0; i <= count; i++) {
            queue.addPunch({ toolId: tool.id, x: x1 + dx * i, y: y1 + dy * i, rotation: angle, lineId });
        }
    },
    Strike: (toolPattern: string, x: number, y: number, angle: number) => {
        const tool = findToolByPattern(tools, toolPattern);
        if (tool) queue.addPunch({ toolId: tool.id, x, y, rotation: angle });
    }
});
