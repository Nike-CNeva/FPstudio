import { PunchType, Tool, ToolShape } from '../types';

export const generateId = (): string => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const getPunchTypeName = (punchType: PunchType): string => {
    switch (punchType) {
        case PunchType.General: return 'Общий';
        case PunchType.Contour: return 'Контурный';
        case PunchType.Starting: return 'Стартовый';
        case PunchType.Finishing: return 'Финишный';
        default: return 'Неизвестный';
    }
};

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