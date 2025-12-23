
/**
 * ОТВЕТСТВЕННОСТЬ: Управление логикой револьвера.
 * Содержит: выбор станций, установку/снятие инструмента, проверку совместимости станций и управление конфигурациями (layouts).
 */
// FIX: Added React to imports to resolve 'Cannot find namespace React' errors in UseTurretLogicProps
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tool, TurretLayout, StationConfig } from '../../types';
import { generateId } from '../../utils/helpers';

interface UseTurretLogicProps {
    tools: Tool[];
    setTools: React.Dispatch<React.SetStateAction<Tool[]>>;
    layouts: TurretLayout[];
    setLayouts: React.Dispatch<React.SetStateAction<TurretLayout[]>>;
}

export const useTurretLogic = ({ tools, setTools, layouts, setLayouts }: UseTurretLogicProps) => {
    const [activeLayoutId, setActiveLayoutId] = useState<string>(layouts[0]?.id || '');
    const [currentStations, setCurrentStations] = useState<StationConfig[]>(layouts[0]?.stations || []);
    const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
    const [isMtView, setIsMtView] = useState(false);
    const [selectedMtSlotId, setSelectedMtSlotId] = useState<number | null>(null);
    const [newLayoutName, setNewLayoutName] = useState('');

    useEffect(() => {
        const layout = layouts.find(l => l.id === activeLayoutId);
        if (layout) {
            setCurrentStations(layout.stations);
        }
    }, [activeLayoutId, layouts]);

    const toolsOnTurret = useMemo(() => tools.filter(t => t.stationNumber !== 0 && t.stationNumber !== undefined), [tools]);
    const availableTools = useMemo(() => tools.filter(t => !t.stationNumber), [tools]);

    const loadLayout = useCallback((layoutId: string) => {
        const layout = layouts.find(l => l.id === layoutId);
        if (!layout) return;
        setTools(JSON.parse(JSON.stringify(layout.toolsSnapshot)));
        setCurrentStations(JSON.parse(JSON.stringify(layout.stations)));
        setActiveLayoutId(layoutId);
        setSelectedStationId(null);
        setIsMtView(false);
        setSelectedMtSlotId(null);
    }, [layouts, setTools]);

    const saveLayout = useCallback(() => {
        if (!newLayoutName.trim()) return;
        const newLayout: TurretLayout = {
            id: generateId(),
            name: newLayoutName,
            toolsSnapshot: JSON.parse(JSON.stringify(tools)),
            stations: JSON.parse(JSON.stringify(currentStations))
        };
        setLayouts(prev => [...prev, newLayout]);
        setActiveLayoutId(newLayout.id);
        setNewLayoutName('');
    }, [newLayoutName, tools, currentStations, setLayouts]);

    const deleteLayout = useCallback((id: string) => {
        if (layouts.length <= 1) return;
        setLayouts(prev => prev.filter(l => l.id !== id));
        if (activeLayoutId === id) {
            loadLayout(layouts[0].id);
        }
    }, [layouts, activeLayoutId, loadLayout, setLayouts]);

    const updateStationConfig = useCallback((id: number, updates: Partial<StationConfig>) => {
        setCurrentStations(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { 
            ...l, 
            stations: currentStations.map(s => s.id === id ? { ...s, ...updates } : s) 
        } : l));
    }, [activeLayoutId, currentStations, setLayouts]);

    const handleStationClick = useCallback((stationId: number) => {
        const station = currentStations.find(s => s.id === stationId);
        if (station?.type === 'MT') {
            setIsMtView(true);
            setSelectedMtSlotId(1);
        }
        setSelectedStationId(stationId);
    }, [currentStations]);

    const checkCompatibility = useCallback((tool: Tool, station: StationConfig): boolean => {
        if (station.type === 'MT') return tool.stationType === 'MT';
        return tool.toolSize === station.type;
    }, []);

    const handleMountTool = useCallback((tool: Tool, mtIndex?: number) => {
        if (!selectedStationId) return;
        const station = currentStations.find(s => s.id === selectedStationId);
        if (!station || !checkCompatibility(tool, station)) return;

        const updatedTools = tools.map(t => {
            if (t.stationNumber === selectedStationId) {
                if (isMtView) {
                    if (t.mtIndex === mtIndex) return { ...t, stationNumber: 0, mtIndex: 0 };
                } else {
                    return { ...t, stationNumber: 0, mtIndex: 0 };
                }
            }
            if (t.id === tool.id) {
                return { ...t, stationNumber: selectedStationId, mtIndex: mtIndex || 0 };
            }
            return t;
        });
        setTools(updatedTools);
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, toolsSnapshot: updatedTools } : l));
    }, [selectedStationId, currentStations, checkCompatibility, tools, isMtView, activeLayoutId, setTools, setLayouts]);

    const handleUnmountTool = useCallback((toolId: string) => {
        const updatedTools = tools.map(t => t.id === toolId ? { ...t, stationNumber: 0, mtIndex: 0 } : t);
        setTools(updatedTools);
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, toolsSnapshot: updatedTools } : l));
    }, [tools, activeLayoutId, setTools, setLayouts]);

    const updateToolRotation = useCallback((toolId: string, rotation: number) => {
        const updatedTools = tools.map(t => t.id === toolId ? { ...t, defaultRotation: rotation } : t);
        setTools(updatedTools);
        setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, toolsSnapshot: updatedTools } : l));
    }, [tools, activeLayoutId, setTools, setLayouts]);

    return {
        activeLayoutId, currentStations, selectedStationId, isMtView, setIsMtView,
        selectedMtSlotId, setSelectedMtSlotId, newLayoutName, setNewLayoutName,
        toolsOnTurret, availableTools,
        loadLayout, saveLayout, deleteLayout, updateStationConfig,
        handleStationClick, handleMountTool, handleUnmountTool, updateToolRotation
    };
};
