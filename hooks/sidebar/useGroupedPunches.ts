
/**
 * ОТВЕТСТВЕННОСТЬ: Трансформация плоского списка PlacedTool в сгруппированный список для UI.
 */
import { useMemo } from 'react';
import { Part, Tool, PlacedTool } from '../../types';

export interface GroupedPunchItem {
    type: 'single' | 'group';
    id: string; 
    name: string;
    count: number;
    refIds: string[]; 
}

export const useGroupedPunches = (activePart: Part | null, tools: Tool[]) => {
    return useMemo(() => {
        const grouped: GroupedPunchItem[] = [];
        const processedLineIds = new Set<string>();

        if (activePart) {
            activePart.punches.forEach(p => {
                if (p.lineId) {
                    if (!processedLineIds.has(p.lineId)) {
                        processedLineIds.add(p.lineId);
                        const group = activePart.punches.filter(gp => gp.lineId === p.lineId);
                        const tool = tools.find(t => t.id === p.toolId);
                        grouped.push({
                            type: 'group',
                            id: p.id, 
                            name: `${tool?.name || 'Unknown'} (x${group.length})`,
                            count: group.length,
                            refIds: group.map(gp => gp.id)
                        });
                    }
                } else {
                    const tool = tools.find(t => t.id === p.toolId);
                    grouped.push({
                        type: 'single',
                        id: p.id,
                        name: tool?.name || 'Неизвестный',
                        count: 1,
                        refIds: [p.id]
                    });
                }
            });
        }
        return grouped;
    }, [activePart, tools]);
};
