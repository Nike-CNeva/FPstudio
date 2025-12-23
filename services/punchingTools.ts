
/**
 * СЕРВИС ПОДБОРА ИНСТРУМЕНТА
 * Ответственность: Алгоритмы выбора оптимального инструмента из библиотеки.
 */
import { Tool, ToolShape, PunchType } from '../types';
import { TOLERANCE } from './punchingUtils';

/**
 * Находит лучший инструмент для контурной обработки на основе предпочтений.
 */
export const findBestContourTool = (tools: Tool[], preference: number): Tool | null => {
    const contourTools = tools.filter(t => t.punchType === PunchType.Contour);
    if (contourTools.length === 0) return null;

    const scoredTools = contourTools.map(tool => {
        const speedScore = tool.width / 50; 
        const aspectRatio = tool.width / tool.height;
        const qualityScore = 1 / (1 + Math.abs(aspectRatio - 1));
        const finalScore = (1 - preference) * speedScore + preference * qualityScore;
        return { tool, score: finalScore };
    });

    scoredTools.sort((a, b) => b.score - a.score);
    return scoredTools[0].tool;
};

type ToolSelectorStrategy = (dim1: number, dim2: number, tools: Tool[], tolerance: number) => Tool[];

const scoreToolShape = (t: Tool) => {
    if (t.shape === ToolShape.Rectangle) return 10;
    if (t.shape === ToolShape.Square) return 5;
    if (t.shape === ToolShape.Oblong) return 0;
    return 1;
};

const selectLineTools: ToolSelectorStrategy = (len, _, tools, tolerance) => {
    let candidates = tools.filter(t => [ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape));
    return candidates.sort((a, b) => {
        const sA = scoreToolShape(a);
        const sB = scoreToolShape(b);
        if (sA !== sB) return sB - sA;
        const lenA = Math.max(a.width, a.height);
        const lenB = Math.max(b.width, b.height);
        if (len > 0) {
            const fitsA = lenA <= (len + tolerance);
            const fitsB = lenB <= (len + tolerance);
            if (fitsA && !fitsB) return -1;
            if (!fitsA && fitsB) return 1;
            if (fitsA && fitsB) {
                const isExactA = Math.abs(lenA - len) <= tolerance;
                const isExactB = Math.abs(lenB - len) <= tolerance;
                if (isExactA && !isExactB) return -1;
                if (!isExactA && isExactB) return 1;
                return lenB - lenA;
            } else {
                return lenA - lenB;
            }
        }
        return lenB - lenA;
    });
};

const selectCircleTools: ToolSelectorStrategy = (diameter, _, tools, tolerance) => {
    let candidates = tools.filter(t => t.shape === ToolShape.Circle);
    if (diameter > 0) {
        candidates = candidates.filter(t => Math.abs(t.width - diameter) <= tolerance);
    }
    return candidates.sort((a, b) => Math.abs(a.width - diameter) - Math.abs(b.width - diameter));
};

const selectRectTools: ToolSelectorStrategy = (w, h, tools, tolerance) => {
    let candidates = tools.filter(t => [ToolShape.Rectangle, ToolShape.Square].includes(t.shape));
    candidates = candidates.filter(t => {
        const matchNormal = Math.abs(t.width - w) <= tolerance && Math.abs(t.height - h) <= tolerance;
        const matchRotated = Math.abs(t.height - w) <= tolerance && Math.abs(t.width - h) <= tolerance;
        return matchNormal || matchRotated;
    });
    return candidates.sort((a, b) => {
        const diffA = Math.min(Math.abs(a.width - w) + Math.abs(a.height - h), Math.abs(a.height - w) + Math.abs(a.width - h));
        const diffB = Math.min(Math.abs(b.width - w) + Math.abs(b.height - h), Math.abs(b.height - w) + Math.abs(b.width - h));
        return diffA - diffB;
    });
};

const selectOblongTools: ToolSelectorStrategy = (w, h, tools, tolerance) => {
    let candidates = tools.filter(t => t.shape === ToolShape.Oblong);
    candidates = candidates.filter(t => {
        const matchNormal = Math.abs(t.width - w) <= tolerance && Math.abs(t.height - h) <= tolerance;
        const matchRotated = Math.abs(t.height - w) <= tolerance && Math.abs(t.width - h) <= tolerance;
        return matchNormal || matchRotated;
    });
    return candidates.sort((a, b) => {
        const diffA = Math.min(Math.abs(a.width - w) + Math.abs(a.height - h), Math.abs(a.height - w) + Math.abs(a.width - h));
        const diffB = Math.min(Math.abs(b.width - w) + Math.abs(b.height - h), Math.abs(b.height - w) + Math.abs(b.width - h));
        return diffA - diffB;
    });
};

const strategies: Record<string, ToolSelectorStrategy> = {
    line: selectLineTools,
    circle: selectCircleTools,
    rect: selectRectTools,
    oblong: selectOblongTools
};

/**
 * Возвращает приоритетный список инструментов для конкретной задачи.
 */
export const getPreferredTools = (
    type: 'line' | 'circle' | 'rect' | 'oblong',
    dim1: number, 
    dim2: number, 
    tools: Tool[],
    tolerance: number = 0.2
): Tool[] => {
    const strategy = strategies[type];
    if (!strategy) return [];
    return strategy(dim1, dim2, tools, tolerance);
};
