
/**
 * ОТВЕТСТВЕННОСТЬ: Состояние редактирования детали, выбор инструментов, Snap-режимы и обучение.
 * ДОЛЖЕН СОДЕРЖАТЬ: activePart, selectedToolId, snapMode, teachMode и интеграцию useManualPunch.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: Логику раскроя или персистентность.
 */
import { useState, useMemo } from 'react';
import { Part, Tool, ManualPunchMode, SnapMode, NibbleSettings, DestructSettings } from '../types';
import { getGeometryFromEntities } from '../services/geometry';
import { useManualPunch } from './useManualPunch';

interface UseEditorStateProps {
    tools: Tool[];
    onAddPunches: (punches: any[]) => void;
}

export const useEditorState = ({ tools, onAddPunches }: UseEditorStateProps) => {
    const [activePart, setActivePart] = useState<Part | null>(null);
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
    const [selectedPunchId, setSelectedPunchId] = useState<string | null>(null);
    const [manualPunchMode, setManualPunchMode] = useState<ManualPunchMode>(ManualPunchMode.Punch);
    const [punchOrientation, setPunchOrientation] = useState(0);
    const [snapMode, setSnapMode] = useState<SnapMode>(SnapMode.Vertex);
    const [punchOffset, setPunchOffset] = useState<number>(0);
    const [nibbleSettings, setNibbleSettings] = useState<NibbleSettings>({ 
        extensionStart: 0, extensionEnd: 0, minOverlap: 1, hitPointMode: 'offset', toolPosition: 'long' 
    });
    const [destructSettings, setDestructSettings] = useState<DestructSettings>({ 
        overlap: 0.7, scallop: 0.25, notchExpansion: 0.25 
    });

    const [teachMode, setTeachMode] = useState(false);
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
    const [selectedTeachPunchIds, setSelectedTeachPunchIds] = useState<string[]>([]);

    const activePartProcessedGeometry = useMemo(() => 
        activePart ? getGeometryFromEntities(activePart) : null, [activePart]
    );

    const selectedTool = tools.find(t => t.id === selectedToolId) || null;

    const manualPunch = useManualPunch({
        activePart,
        activePartProcessedGeometry,
        selectedTool,
        manualPunchMode,
        punchOrientation,
        punchOffset,
        snapMode,
        nibbleSettings,
        destructSettings,
        onAddPunches,
        setSelectedPunchId
    });

    return {
        activePart, setActivePart,
        selectedToolId, setSelectedToolId,
        selectedPunchId, setSelectedPunchId,
        manualPunchMode, setManualPunchMode,
        punchOrientation, setPunchOrientation,
        snapMode, setSnapMode,
        punchOffset, setPunchOffset,
        nibbleSettings, setNibbleSettings,
        destructSettings, setDestructSettings,
        teachMode, setTeachMode,
        selectedSegmentIds, setSelectedSegmentIds,
        selectedTeachPunchIds, setSelectedTeachPunchIds,
        activePartProcessedGeometry,
        selectedTool,
        manualPunch
    };
};
