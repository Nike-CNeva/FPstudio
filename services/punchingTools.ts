
import { Tool, ToolShape } from '../types';
import { TOLERANCE } from './punchingUtils';

type ToolSelectorStrategy = (dim1: number, dim2: number, tools: Tool[], tolerance: number) => Tool[];

const scoreToolShape = (t: Tool) => {
    if (t.shape === ToolShape.Rectangle) return 3;
    if (t.shape === ToolShape.Square) return 2;
    return 1;
};

// Strategy: Line (Nibbling)
// Prioritizes straight edge tools (Rect > Square > Oblong)
const selectLineTools: ToolSelectorStrategy = (len, _, tools, tolerance) => {
    let candidates = tools.filter(t => [ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape));
    
    return candidates.sort((a, b) => {
        // 1. Shape Priority
        const sA = scoreToolShape(a);
        const sB = scoreToolShape(b);
        if (sA !== sB) return sB - sA;

        // 2. Size Fitness
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
                return lenB - lenA; // Bigger is better if both fit
            } else {
                return lenA - lenB; // Smaller is better if both don't fit (closer to fit)
            }
        }
        return lenB - lenA;
    });
};

// Strategy: Circle (Single Hit)
const selectCircleTools: ToolSelectorStrategy = (diameter, _, tools, tolerance) => {
    let candidates = tools.filter(t => t.shape === ToolShape.Circle);
    if (diameter > 0) {
        candidates = candidates.filter(t => Math.abs(t.width - diameter) <= tolerance);
    }
    return candidates.sort((a, b) => Math.abs(a.width - diameter) - Math.abs(b.width - diameter));
};

// Strategy: Rect/Oblong (Single Hit)
const selectRectTools: ToolSelectorStrategy = (w, h, tools, tolerance) => {
    let candidates = tools.filter(t => [ToolShape.Rectangle, ToolShape.Square].includes(t.shape));
    
    // Check exact match (normal or rotated)
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

// Strategy: Oblong specifically
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
 * Advanced Tool Selection - Returns prioritized list of candidates.
 */
export const getPreferredTools = (
    type: 'line' | 'circle' | 'rect' | 'oblong',
    dim1: number, // Length/Diameter/Width
    dim2: number, // Height (if rect/oblong)
    tools: Tool[],
    tolerance: number = 0.2
): Tool[] => {
    const strategy = strategies[type];
    if (!strategy) return [];
    return strategy(dim1, dim2, tools, tolerance);
};
