
/**
 * ОТВЕТСТВЕННОСТЬ: Состояние выбора пуансона, конкретного удара на чертеже и режимов привязки.
 */
import { useState } from 'react';
import { Tool, SnapMode } from '../../types';

export const usePunchToolState = (tools: Tool[]) => {
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
    const [selectedPunchId, setSelectedPunchId] = useState<string | null>(null);
    const [punchOrientation, setPunchOrientation] = useState(0);
    const [snapMode, setSnapMode] = useState<SnapMode>(SnapMode.Vertex);
    const [punchOffset, setPunchOffset] = useState<number>(0);

    const selectedTool = tools.find(t => t.id === selectedToolId) || null;

    return {
        selectedToolId, setSelectedToolId,
        selectedPunchId, setSelectedPunchId,
        punchOrientation, setPunchOrientation,
        snapMode, setSnapMode,
        punchOffset, setPunchOffset,
        selectedTool
    };
};
