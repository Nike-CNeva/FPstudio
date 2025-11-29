
import { PunchType, Tool, ToolShape, PartProfile } from '../types';

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

/**
 * Extracts the base name of a part by removing the dimension suffix if present.
 * Suffix pattern: _100x200 or _50x100x50 etc.
 */
export const getPartBaseName = (currentName: string): string => {
    // Regex looks for underscore followed by digits joined by 'x' at the end of the string
    // e.g. "Box_100x200", "Profile_50x100x50"
    return currentName.replace(/_(\d+x?)+$/, '');
};

/**
 * Generates a standard part name based on profile and dimensions.
 * Format: BaseName_wLeft x wCenter x wRight x hTop x hCenter x hBottom
 * Only non-zero dimensions are included.
 */
export const generatePartNameFromProfile = (
    baseName: string, 
    profile: PartProfile | undefined, 
    width: number, 
    height: number
): string => {
    let hTop = 0, hCenter = 0, hBottom = 0;
    let wLeft = 0, wCenter = 0, wRight = 0;

    const type = profile?.type || 'flat';
    const orientation = profile?.orientation || 'vertical';
    const dims = profile?.dims || { a: 0, b: 0, c: 0 };

    if (type === 'L') {
        if (orientation === 'vertical') {
            wLeft = dims.a;
            wRight = dims.b;
            hCenter = height;
        } else {
            hTop = dims.a;
            hBottom = dims.b;
            wCenter = width;
        }
    } else if (type === 'U') {
        if (orientation === 'vertical') {
            wLeft = dims.a;
            wCenter = dims.b;
            wRight = dims.c;
            hCenter = height;
        } else {
            hTop = dims.a;
            hCenter = dims.b;
            hBottom = dims.c;
            wCenter = width;
        }
    } else {
        // Flat
        hCenter = height;
        wCenter = width;
    }

    // Order: wLeft, wCenter, wRight, hTop, hCenter, hBottom (Width x Height)
    const values = [wLeft, wCenter, wRight, hTop, hCenter, hBottom];
    
    // Filter non-zero values, round them
    const dimStr = values
        .filter(v => v > 0)
        .map(v => Math.round(v))
        .join('x');
    
    // Fallback if something went wrong (e.g. 0 sizes)
    const finalSuffix = dimStr || `${Math.round(width)}x${Math.round(height)}`;

    return `${baseName}_${finalSuffix}`;
};
