
import React, { useState, ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { AppMode, NestLayout, Part, Tool, PlacedTool, ManualPunchMode, Point, NibbleSettings, DestructSettings, PlacementReference, SnapMode, ScheduledPart, TurretLayout, AutoPunchSettings, PlacementSide, TeachCycle, ToastMessage, ParametricScript, MachineSettings, OptimizerSettings, PunchOp } from './types';
import { initialTools, initialParts, initialNests, initialTurretLayouts, initialScripts, defaultMachineSettings, defaultOptimizerSettings } from './data/initialData';
import { generateId, getPartBaseName, generatePartNameFromProfile } from './utils/helpers';
import { usePanAndZoom } from './hooks/usePanAndZoom';
import { useConfirmation } from './hooks/useConfirmation';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { CanvasArea } from './components/CanvasArea';
import { ToolLibraryView } from './components/ToolLibraryView';
import { TurretSetupView } from './components/TurretSetupView';
import { ScriptLibraryView } from './components/ScriptLibraryView';
import { PartLibraryView } from './components/PartLibraryView';
import { MachineSetupView } from './components/MachineSetupView';
import { AutoPunchSettingsModal } from './components/AutoPunchSettingsModal';
import { GCodeModal } from './components/GCodeModal';
import { OptimizerSettingsModal } from './components/OptimizerSettingsModal';
import { TeachCycleSaveModal } from './components/TeachCycleSaveModal';
import { ConfirmationModal } from './components/common/ConfirmationModal';
import { ToastContainer } from './components/common/Toast';

import { parseDxf, dxfEntitiesToSvg } from './services/dxfParser';
import { parseCp } from './services/cpParser';
import { generateContourPunches, generateNibblePunches, generateDestructPunches } from './services/punching';
import { nestingGenerator } from './services/nesting';
import { generateGCode, calculateOptimizedPath } from './services/gcode';
import { getGeometryFromEntities, findSnapPoint, findClosestSegment, detectPartProfile } from './services/geometry';
import { calculateEdgePlacement } from './services/placement';
import { generateParametricScript } from './services/scriptGenerator';
import { createTeachCycleFromSelection } from './services/teachLogic';

const App: React.FC = () => {
    const [mode, setMode] = useState<AppMode>(AppMode.PartEditor);
    const [tools, setTools] = useState<Tool[]>(initialTools);
    const [parts, setParts] = useState<Part[]>(initialParts);
    const [scripts, setScripts] = useState<ParametricScript[]>(initialScripts);
    const [activePart, setActivePart] = useState<Part | null>(null);
    const [nests, setNests] = useState<NestLayout[]>(initialNests);
    const [turretLayouts, setTurretLayouts] = useState<TurretLayout[]>(initialTurretLayouts);
    
    const [activeNestId, setActiveNestId] = useState<string | null>(initialNests[0]?.id || null);
    const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
    const [selectedPunchId, setSelectedPunchId] = useState<string | null>(null);
    const [selectedNestPartId, setSelectedNestPartId] = useState<string | null>(null);

    const [machineSettings, setMachineSettings] = useState<MachineSettings>(defaultMachineSettings);
    const [optimizerSettings, setOptimizerSettings] = useState<OptimizerSettings>(defaultOptimizerSettings);

    // --- Optimization & Simulation State ---
    const [optimizedOperations, setOptimizedOperations] = useState<PunchOp[] | null>(null);
    const [simulationStep, setSimulationStep] = useState<number>(0);
    const [isSimulating, setIsSimulating] = useState<boolean>(false);
    const [simulationSpeed, setSimulationSpeed] = useState<number>(50); // ms per step
    const simulationInterval = useRef<number | null>(null);

    const [manualPunchMode, setManualPunchMode] = useState<ManualPunchMode>(ManualPunchMode.Punch);
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
    const [punchCreationStep, setPunchCreationStep] = useState(0);
    const [punchCreationPoints, setPunchCreationPoints] = useState<Point[]>([]);
    const [placementReference, setPlacementReference] = useState<PlacementReference>(PlacementReference.Edge);
    const [placementSide, setPlacementSide] = useState<PlacementSide>(PlacementSide.Outside);
    const [punchOrientation, setPunchOrientation] = useState(0);
    const [snapMode, setSnapMode] = useState<SnapMode>(SnapMode.Vertex);
    const [punchOffset, setPunchOffset] = useState<number>(0);
    const [nibbleSettings, setNibbleSettings] = useState<NibbleSettings>({ extensionStart: 0, extensionEnd: 0, minOverlap: 1, hitPointMode: 'offset', toolPosition: 'long' });
    const [destructSettings, setDestructSettings] = useState<DestructSettings>({ overlap: 0.7, scallop: 0.25, notchExpansion: 0.25 });

    const [teachCycles, setTeachCycles] = useState<TeachCycle[]>([]);
    const [teachMode, setTeachMode] = useState(false);
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
    const [selectedTeachPunchIds, setSelectedTeachPunchIds] = useState<string[]>([]);

    const [showGCodeModal, setShowGCodeModal] = useState(false);
    const [showOptimizerModal, setShowOptimizerModal] = useState(false);
    const [isGeneratingGCode, setIsGeneratingGCode] = useState(false); // Distinction: Are we optimizing path OR generating code?
    const [generatedGCode, setGeneratedGCode] = useState('');
    const [showAutoPunchSettingsModal, setShowAutoPunchSettingsModal] = useState(false);
    const [showTeachSaveModal, setShowTeachSaveModal] = useState(false);
    
    // Nesting Process State
    const [isNestingProcessing, setIsNestingProcessing] = useState(false);
    
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    
    const addToast = (message: string, type: ToastMessage['type']) => {
        setToasts(prev => [...prev, { id: generateId(), message, type }]);
    };
    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const { confirmationState, confirm, closeConfirmation } = useConfirmation();
    
    const activeNest = nests.find(n => n.id === activeNestId) || null;
    const currentNestSheet = activeNest?.sheets[activeSheetIndex] || null;
    const selectedTool = tools.find(t => t.id === selectedToolId) || null;

    // Reset Optimization when sheet changes
    useEffect(() => {
        setOptimizedOperations(null);
        setSimulationStep(0);
        setIsSimulating(false);
    }, [activeNestId, activeSheetIndex, currentNestSheet]);

    // Simulation Timer
    useEffect(() => {
        if (isSimulating && optimizedOperations) {
            simulationInterval.current = window.setInterval(() => {
                setSimulationStep(prev => {
                    if (prev >= optimizedOperations.length - 1) {
                        setIsSimulating(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, simulationSpeed);
        } else {
            if (simulationInterval.current) {
                clearInterval(simulationInterval.current);
                simulationInterval.current = null;
            }
        }
        return () => {
            if (simulationInterval.current) clearInterval(simulationInterval.current);
        };
    }, [isSimulating, optimizedOperations, simulationSpeed]);

    // --- Actions ---

    const handleOpenOptimizer = (forGCode: boolean) => {
        if (!currentNestSheet) {
            addToast("Нет листа для обработки", "error");
            return;
        }
        setIsGeneratingGCode(forGCode);
        setShowOptimizerModal(true);
    };

    const handleRunOptimization = (finalSettings: OptimizerSettings) => {
        if (!currentNestSheet) return;
        setOptimizerSettings(finalSettings);
        setShowOptimizerModal(false);

        const ops = calculateOptimizedPath(currentNestSheet, parts, tools, finalSettings);
        setOptimizedOperations(ops);
        setSimulationStep(0); 

        if (isGeneratingGCode) {
            const programNumber = activeSheetIndex + 1;
            const ncFilename = activeNest?.workOrder 
                ? `${activeNest.workOrder}_${programNumber}.nc` 
                : `Program_${programNumber}.nc`;
            const currentClamps = activeNest?.settings.clampPositions || [420, 1010, 1550];

            const code = generateGCode(
                currentNestSheet, 
                parts, 
                tools, 
                ncFilename,
                machineSettings,
                finalSettings,
                currentClamps,
                programNumber,
                ops
            );
            setGeneratedGCode(code);
            setShowGCodeModal(true);
        } else {
            addToast(`Оптимизация завершена. ${ops.length} операций.`, "success");
        }
    };

    const toggleSimulation = () => setIsSimulating(!isSimulating);
    const stopSimulation = () => { setIsSimulating(false); setSimulationStep(0); };
    const stepSimulation = (val: number) => {
        setIsSimulating(false);
        if (optimizedOperations) {
            setSimulationStep(Math.max(0, Math.min(val, optimizedOperations.length - 1)));
        }
    };

    const handleCanvasClick = (point: Point) => {
        if (mode === AppMode.Nesting) return;
        if (mode !== AppMode.PartEditor || !activePart) return;
        if (teachMode) {
             const closestSeg = findClosestSegment(point, activePartProcessedGeometry);
             if (closestSeg) {
                 const idx = activePartProcessedGeometry?.segments.findIndex(s => 
                     s.p1.x === closestSeg.p1.x && s.p1.y === closestSeg.p1.y &&
                     s.p2.x === closestSeg.p2.x && s.p2.y === closestSeg.p2.y
                 ) ?? -1;
                 if (idx !== -1) {
                     setSelectedSegmentIds(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
                 }
             }
             return;
        }
        if (selectedPunchId) setSelectedPunchId(null);
        if (!selectedToolId || !selectedTool) return;

        const snapResult = findSnapPoint(point, activePartProcessedGeometry, snapMode);
        const finalPoint = snapResult?.point ?? point;

        switch(manualPunchMode) {
            case ManualPunchMode.Punch: {
                if (placementReference === PlacementReference.Center) {
                    addPunchesWithCollisionCheck([{ toolId: selectedToolId, x: finalPoint.x, y: finalPoint.y, rotation: punchOrientation }]);
                    return;
                }
                const placementAngle = snapResult?.angle ?? 0;
                const { x, y, rotation } = calculateEdgePlacement(finalPoint, placementAngle, selectedTool, punchOrientation, punchOffset, snapResult?.snapTarget ?? 'middle', snapResult?.wasNormalized ?? false, placementSide);
                addPunchesWithCollisionCheck([{ toolId: selectedToolId, x, y, rotation }]);
                break;
            }
            case ManualPunchMode.Nibble: {
                const closestSeg = findClosestSegment(point, activePartProcessedGeometry);
                if (closestSeg) {
                     const punches = generateNibblePunches(closestSeg.p1, closestSeg.p2, selectedTool, nibbleSettings, closestSeg.angle, closestSeg.wasNormalized, punchOrientation, punchOffset);
                    addPunchesWithCollisionCheck(punches);
                }
                break;
            }
            case ManualPunchMode.Destruct: {
                if (punchCreationStep === 0) {
                    setPunchCreationPoints([finalPoint]);
                    setPunchCreationStep(1);
                } else {
                    const [startPoint] = punchCreationPoints;
                    const newPunchesData = generateDestructPunches(startPoint, finalPoint, selectedTool, destructSettings);
                    addPunchesWithCollisionCheck(newPunchesData);
                }
                break;
            }
        }
    };
    
    const handleTeachPunchSelect = (id: string) => {
        if (!teachMode) { setSelectedPunchId(id); return; }
        setSelectedTeachPunchIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    };
    const handleTeachBulkSelect = (segmentIndices: number[], punchIds: string[], add: boolean) => {
        if (add) {
            setSelectedSegmentIds(prev => Array.from(new Set([...prev, ...segmentIndices])));
            setSelectedTeachPunchIds(prev => Array.from(new Set([...prev, ...punchIds])));
        } else {
            setSelectedSegmentIds(segmentIndices);
            setSelectedTeachPunchIds(punchIds);
        }
    };
    const handleTeachModeToggle = (enable: boolean) => {
        setTeachMode(enable); setSelectedSegmentIds([]); setSelectedTeachPunchIds([]); if (enable) setSelectedPunchId(null);
    };
    const handleCreateCycle = (name: string, symmetry: any) => {
        if (!activePart || !activePartProcessedGeometry) return;
        const newCycle = createTeachCycleFromSelection(name, symmetry, selectedSegmentIds, selectedTeachPunchIds, activePart, activePartProcessedGeometry);
        if (newCycle) { setTeachCycles(prev => [...prev, newCycle]); handleTeachModeToggle(false); }
        setShowTeachSaveModal(false);
    };
    const handleDeleteCycle = (id: string) => setTeachCycles(prev => prev.filter(c => c.id !== id));

    const { svgRef, viewBox, setViewBox, isDragging, getPointFromEvent, panZoomHandlers } = usePanAndZoom({ x: 0, y: 0, width: 100, height: 100 }, { onClick: handleCanvasClick });

    const activePartProcessedGeometry = useMemo(() => activePart ? getGeometryFromEntities(activePart) : null, [activePart]);

    useEffect(() => {
        if (activePart) {
            setViewBox({ x: -5, y: -activePart.geometry.height - 5, width: activePart.geometry.width + 10, height: activePart.geometry.height + 10 });
            setSelectedPunchId(null);
        }
    }, [activePart?.id]); 

    useEffect(() => {
        setSelectedPunchId(null);
        setTeachMode(false);
        if (mode === AppMode.Nesting && activeNest) {
             const sheetToView = activeNest.sheets[activeSheetIndex];
             let width = 2500, height = 1250;
             if (sheetToView) { width = sheetToView.width; height = sheetToView.height; }
             else { const stock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0]; if(stock) { width = stock.width; height = stock.height; } }
             setViewBox({ x: -50, y: -height - 50, width: width + 100, height: height + 100 });
        }
    }, [mode, activeNestId, activeSheetIndex]);

    const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            const fileName = file.name;
            if (fileName.toLowerCase().endsWith('.cp')) {
                const parsedPart = parseCp(content, fileName, tools);
                if (parsedPart) { parsedPart.profile = detectPartProfile(parsedPart.geometry); setActivePart(parsedPart); setMode(AppMode.PartEditor); addToast(`Файл ${fileName} импортирован.`, "success"); return; }
            }
            try {
                const parsedEntities = parseDxf(content);
                if (parsedEntities.length > 0) {
                    const { path, width, height, bbox } = dxfEntitiesToSvg(parsedEntities);
                    const newPart: Part = { id: generateId(), name: fileName.replace(/\.(dxf|DXF)$/, ''), geometry: { path, width, height, entities: parsedEntities, bbox }, punches: [], material: { code: 'St-3', thickness: 1.0, dieClearance: 0.2 }, nesting: { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: true, canMirror: false }, faceWidth: width, faceHeight: height };
                    newPart.profile = detectPartProfile(newPart.geometry);
                    setActivePart(newPart); setMode(AppMode.PartEditor); addToast("DXF загружен.", "success");
                } else addToast("Ошибка DXF.", "error");
            } catch (error) { addToast("Ошибка DXF.", "error"); }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const addPunchesWithCollisionCheck = (punchesData: Omit<PlacedTool, 'id'>[]) => {
        if (!activePart) return;
        const newPunches = punchesData.map(p => ({ ...p, id: generateId() }));
        setActivePart({ ...activePart, punches: [...activePart.punches, ...newPunches] });
        setPunchCreationStep(0); setPunchCreationPoints([]);
    };
    
    const handleDeletePunch = (id: string | string[]) => {
        if(!activePart) return;
        const ids = Array.isArray(id) ? id : [id];
        setActivePart({...activePart, punches: activePart.punches.filter(p => !ids.includes(p.id))});
    };
    const handleUpdatePunch = (id: string, updates: Partial<PlacedTool>) => {
        if(!activePart) return;
        setActivePart({...activePart, punches: activePart.punches.map(p => p.id === id ? {...p, ...updates} : p)});
    };
    const handleSavePartAsScript = () => { if(!activePart) return; const code = generateParametricScript(activePart, tools); setScripts(p => [...p, {id: generateId(), name: activePart.name, code, defaultWidth: activePart.faceWidth, defaultHeight: activePart.faceHeight, updatedAt: Date.now()}]); setActivePart(null); addToast("Скрипт сохранен", "success"); };
    const handleSavePartAsStatic = () => { if(!activePart) return; const name = generatePartNameFromProfile(getPartBaseName(activePart.name), activePart.profile, activePart.faceWidth, activePart.faceHeight); const p = {...activePart, name}; setParts(pr => [...pr.filter(x=>x.id!==p.id), p]); setActivePart(null); addToast(`Деталь ${name} сохранена`, "success"); };
    
    // --- Async Nesting Runner ---
    const handleRunNesting = async () => {
        if(!activeNest || activeNest.scheduledParts.length===0) return;
        
        setIsNestingProcessing(true);
        setNests(n => n.map(x => x.id === activeNestId ? {...x, sheets: []} : x)); // Clear previous
        setActiveSheetIndex(0);
        addToast("Запуск глубокого раскроя...", "info");

        try {
            // Iterate over generator updates
            for await (const updatedSheets of nestingGenerator(activeNest.scheduledParts, parts, tools, activeNest.settings)) {
                setNests(prev => prev.map(n => {
                    if (n.id === activeNestId) {
                        return { ...n, sheets: updatedSheets };
                    }
                    return n;
                }));
                // Optionally jump to latest sheet? Or stay on 0?
                // setActiveSheetIndex(updatedSheets.length - 1); 
            }
            addToast("Раскрой завершен", "success");
        } catch(e:any) {
            console.error(e);
            addToast("Ошибка раскроя: " + e.message, "error");
        } finally {
            setIsNestingProcessing(false);
        }
    };

    const downloadGCode = () => {
        const blob = new Blob([generatedGCode], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = activeNest?.workOrder ? `${activeNest.workOrder}_${activeSheetIndex + 1}.nc` : `Program_${activeSheetIndex + 1}.nc`;
        link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    };

    const handleLoadPartFromLibrary = (part: Part) => {
        setActivePart(part);
        setMode(AppMode.PartEditor);
    };
    const handleDeletePartFromLibrary = (id: string) => {
        confirm("Удаление", "Удалить деталь из библиотеки?", () => {
            setParts(p => p.filter(x => x.id !== id));
            setNests(n => n.map(x => ({...x, scheduledParts: x.scheduledParts.filter(s => s.partId !== id)})));
        });
    };
    const handleUpdatePartInLibrary = (updatedPart: Part) => {
        setParts(prev => prev.map(p => p.id === updatedPart.id ? updatedPart : p));
        addToast("Деталь обновлена", "success");
    };

    const handleSaveScript = (updatedScript: ParametricScript) => {
        setScripts(prev => prev.map(s => s.id === updatedScript.id ? updatedScript : s));
        addToast("Скрипт обновлен", "success");
    };
    const handleDeleteScript = (id: string) => {
        confirm("Удаление", "Удалить скрипт?", () => setScripts(prev => prev.filter(s => s.id !== id)));
    };
    const handleCreatePartFromScript = (newPart: Part) => {
        setParts(prev => [...prev, newPart]);
        addToast(`Деталь ${newPart.name} создана`, "success");
    };
    const handleBatchProcess = (newParts: Part[], newScheduledParts: ScheduledPart[]) => {
        setParts(prev => {
            const ids = new Set(prev.map(p => p.id));
            const distinctNew = newParts.filter(p => !ids.has(p.id));
            return [...prev, ...distinctNew];
        });
        
        if (activeNestId) {
            setNests(prev => prev.map(n => {
                if (n.id === activeNestId) {
                    const existingMap = new Map<string, ScheduledPart>();
                    n.scheduledParts.forEach(s => existingMap.set(s.partId, { ...s }));
                    
                    newScheduledParts.forEach(ns => {
                        if (existingMap.has(ns.partId)) {
                            const ex = existingMap.get(ns.partId)!;
                            ex.quantity += ns.quantity;
                        } else {
                            existingMap.set(ns.partId, ns);
                        }
                    });
                    return { ...n, scheduledParts: Array.from(existingMap.values()) };
                }
                return n;
            }));
            addToast(`Добавлено ${newParts.length} деталей и ${newScheduledParts.length} позиций в раскрой`, "success");
        }
    };

    const handleSaveTool = (tool: Tool) => {
        if (!tool.id) tool.id = generateId();
        setTools(prev => {
            const exists = prev.find(t => t.id === tool.id);
            if (exists) return prev.map(t => t.id === tool.id ? tool : t);
            return [...prev, tool];
        });
        addToast("Инструмент сохранен", "success");
    };
    const handleDeleteTool = (id: string) => {
        confirm("Удаление", "Удалить инструмент?", () => setTools(prev => prev.filter(t => t.id !== id)));
    };

    return (
        <div className="flex flex-col h-full font-sans relative">
            <Header 
                mode={mode} 
                setMode={setMode} 
                onGenerateGCode={() => handleOpenOptimizer(true)} 
                onOptimizePath={() => handleOpenOptimizer(false)}
                onOpenTurretConfig={() => setMode(AppMode.TurretSetup)}
            />

            <div className="flex flex-1 overflow-hidden">
                {(mode === AppMode.PartEditor || mode === AppMode.Nesting) ? (
                    <>
                        <Sidebar 
                            mode={mode}
                            parts={parts} 
                            activePart={activePart}
                            activePartId={activePart?.id || null}
                            setActivePartId={() => {}} 
                            onDeletePart={handleDeletePartFromLibrary}
                            tools={tools}
                            activeNest={activeNest}
                            activeSheetIndex={activeSheetIndex}
                            setActiveSheetIndex={setActiveSheetIndex}
                            onFileUpload={handleFileUpload}
                            manualPunchMode={manualPunchMode} setManualPunchMode={setManualPunchMode}
                            selectedToolId={selectedToolId} setSelectedToolId={setSelectedToolId}
                            selectedPunchId={selectedPunchId} setSelectedPunchId={setSelectedPunchId}
                            onDeletePunch={handleDeletePunch} onUpdatePunch={handleUpdatePunch}
                            placementReference={placementReference} setPlacementReference={setPlacementReference}
                            placementSide={placementSide} setPlacementSide={setPlacementSide}
                            punchOrientation={punchOrientation} setPunchOrientation={setPunchOrientation} onCyclePunchOrientation={() => setPunchOrientation((punchOrientation+90)%360)}
                            snapMode={snapMode} setSnapMode={setSnapMode}
                            punchOffset={punchOffset} setPunchOffset={setPunchOffset}
                            onUpdateNestingSettings={(s, sp) => setNests(prev => prev.map(n => n.id === activeNestId ? { ...n, settings: s, scheduledParts: sp } : n))}
                            onUpdateNestMetadata={(m) => setNests(prev => prev.map(n => n.id === activeNestId ? { ...n, ...m } : n))}
                            nibbleSettings={nibbleSettings} setNibbleSettings={setNibbleSettings}
                            destructSettings={destructSettings} setDestructSettings={setDestructSettings}
                            onOpenTurretView={() => setMode(AppMode.TurretSetup)}
                            onSavePartAsScript={handleSavePartAsScript}
                            onSavePartAsStatic={handleSavePartAsStatic}
                            onUpdateActivePart={(u) => setActivePart(p => p ? {...p, ...u} : null)}
                            onClosePart={() => confirm("Закрыть?", "Изменения будут потеряны.", () => setActivePart(null))}
                            teachMode={teachMode} setTeachMode={handleTeachModeToggle}
                            onSaveTeachCycle={() => setShowTeachSaveModal(true)}
                            teachCycles={teachCycles} onDeleteTeachCycle={handleDeleteCycle}
                            onRunNesting={handleRunNesting}
                            isNestingProcessing={isNestingProcessing}
                            onClearNest={() => confirm("Сброс", "Очистить раскрой?", () => { setNests(prev => prev.map(n => n.id === activeNestId ? { ...n, sheets: [] } : n)); setSelectedNestPartId(null); setActiveSheetIndex(0); })}
                            selectedNestPartId={selectedNestPartId}
                            onMoveNestPart={(id, dx, dy) => {
                                if(activeNest && currentNestSheet) {
                                    const newSheets = [...activeNest.sheets];
                                    newSheets[activeSheetIndex] = {...currentNestSheet, placedParts: currentNestSheet.placedParts.map(p => p.id === id ? {...p, x: p.x+dx, y: p.y+dy} : p)};
                                    setNests(n => n.map(x => x.id === activeNestId ? {...x, sheets: newSheets} : x));
                                }
                            }}
                            onRotateNestPart={(id) => {
                                if(activeNest && currentNestSheet) {
                                    const newSheets = [...activeNest.sheets];
                                    newSheets[activeSheetIndex] = {
                                        ...currentNestSheet, 
                                        placedParts: currentNestSheet.placedParts.map(pp => {
                                            if(pp.id !== id) return pp;
                                            const part = parts.find(p=>p.id===pp.partId); if(!part) return pp;
                                            const w = part.geometry.width; const h = part.geometry.height;
                                            const oldR = pp.rotation * Math.PI / 180; const newR = ((pp.rotation+90)%360) * Math.PI / 180;
                                            const cxOld = (w/2)*Math.cos(oldR) - (h/2)*Math.sin(oldR); const cyOld = (w/2)*Math.sin(oldR) + (h/2)*Math.cos(oldR);
                                            const cxNew = (w/2)*Math.cos(newR) - (h/2)*Math.sin(newR); const cyNew = (w/2)*Math.sin(newR) + (h/2)*Math.cos(newR);
                                            return {...pp, rotation: (pp.rotation+90)%360, x: pp.x + (cxOld-cxNew), y: pp.y + (cyOld-cyNew)};
                                        })
                                    };
                                    setNests(n => n.map(x => x.id === activeNestId ? {...x, sheets: newSheets} : x));
                                }
                            }}
                        />
                        <CanvasArea 
                            mode={mode}
                            activePart={activePart}
                            processedGeometry={activePartProcessedGeometry}
                            activeNest={activeNest}
                            currentNestSheet={currentNestSheet}
                            tools={tools}
                            parts={parts}
                            svgRef={svgRef}
                            viewBox={viewBox}
                            setViewBox={setViewBox}
                            isDragging={isDragging}
                            getPointFromEvent={getPointFromEvent}
                            panZoomHandlers={panZoomHandlers}
                            onOpenAutoPunchSettings={() => setShowAutoPunchSettingsModal(true)}
                            punchCreationStep={punchCreationStep}
                            punchCreationPoints={punchCreationPoints}
                            manualPunchMode={manualPunchMode}
                            selectedToolId={selectedToolId}
                            selectedPunchId={selectedPunchId}
                            onSelectPunch={setSelectedPunchId}
                            placementReference={placementReference}
                            placementSide={placementSide}
                            punchOrientation={punchOrientation}
                            snapMode={snapMode}
                            punchOffset={punchOffset}
                            nibbleSettings={nibbleSettings}
                            teachMode={teachMode}
                            selectedSegmentIds={selectedSegmentIds}
                            selectedTeachPunchIds={selectedTeachPunchIds}
                            onTeachBulkSelect={handleTeachBulkSelect}
                            selectedNestPartId={selectedNestPartId}
                            onSelectNestPart={setSelectedNestPartId}
                            onMoveNestPart={(id, dx, dy) => {
                                 if(activeNest && currentNestSheet) {
                                    const newSheets = [...activeNest.sheets];
                                    newSheets[activeSheetIndex] = {...currentNestSheet, placedParts: currentNestSheet.placedParts.map(p => p.id === id ? {...p, x: p.x+dx, y: p.y+dy} : p)};
                                    setNests(n => n.map(x => x.id === activeNestId ? {...x, sheets: newSheets} : x));
                                }
                            }}
                            optimizedOperations={optimizedOperations}
                            simulationStep={simulationStep}
                        />
                        <RightPanel 
                            tools={tools}
                            selectedToolId={selectedToolId}
                            setSelectedToolId={setSelectedToolId}
                            onOpenTurretView={() => setMode(AppMode.TurretSetup)}
                            isNestingMode={mode === AppMode.Nesting}
                            activeNest={activeNest}
                            activeSheetIndex={activeSheetIndex}
                            setActiveSheetIndex={setActiveSheetIndex}
                            allParts={parts}
                            simulationStep={simulationStep}
                            totalSimulationSteps={optimizedOperations ? optimizedOperations.length : 0}
                            isSimulating={isSimulating}
                            simulationSpeed={simulationSpeed}
                            onToggleSimulation={toggleSimulation}
                            onStopSimulation={stopSimulation}
                            onStepChange={stepSimulation}
                            onSpeedChange={setSimulationSpeed}
                            optimizedOperations={optimizedOperations}
                        />
                    </>
                ) : (
                    mode === AppMode.PartLibrary ? (
                        <PartLibraryView 
                            parts={parts} 
                            tools={tools}
                            onLoadPart={handleLoadPartFromLibrary}
                            onDeletePart={handleDeletePartFromLibrary}
                            onUpdatePart={handleUpdatePartInLibrary}
                        />
                    ) : mode === AppMode.ScriptLibrary ? (
                        <ScriptLibraryView 
                            scripts={scripts} 
                            tools={tools} 
                            parts={parts}
                            onSaveScript={handleSaveScript}
                            onDeleteScript={handleDeleteScript}
                            onCreatePart={handleCreatePartFromScript}
                            onBatchProcess={handleBatchProcess}
                        />
                    ) : mode === AppMode.ToolLibrary ? (
                        <ToolLibraryView 
                            tools={tools} 
                            onSaveTool={handleSaveTool} 
                            onDeleteTool={handleDeleteTool} 
                        />
                    ) : mode === AppMode.TurretSetup ? (
                        <TurretSetupView 
                            tools={tools} 
                            setTools={setTools} 
                            layouts={turretLayouts} 
                            setLayouts={setTurretLayouts} 
                        />
                    ) : mode === AppMode.MachineSetup ? (
                        <MachineSetupView 
                            settings={machineSettings} 
                            onUpdate={setMachineSettings} 
                        />
                    ) : null
                )}
            </div>

            {showAutoPunchSettingsModal && activePart && (
                <AutoPunchSettingsModal 
                    onClose={() => setShowAutoPunchSettingsModal(false)}
                    onApply={(s) => { 
                        const punches = generateContourPunches(activePart.geometry, tools, s, turretLayouts, teachCycles); 
                        addPunchesWithCollisionCheck(punches); 
                        setShowAutoPunchSettingsModal(false); 
                        addToast(`Сгенерировано: ${punches.length}`, "success"); 
                    }}
                    turretLayouts={turretLayouts}
                />
            )}
            {showTeachSaveModal && <TeachCycleSaveModal onClose={() => setShowTeachSaveModal(false)} onSave={handleCreateCycle} />}
            
            {showOptimizerModal && (
                <OptimizerSettingsModal
                    initialSettings={optimizerSettings}
                    onClose={() => setShowOptimizerModal(false)}
                    onGenerate={handleRunOptimization}
                />
            )}

            {showGCodeModal && (
                <GCodeModal 
                    gcode={generatedGCode} 
                    onClose={() => setShowGCodeModal(false)} 
                    onDownload={downloadGCode}
                    sheet={currentNestSheet || undefined}
                    parts={parts}
                    tools={tools}
                    clampPositions={activeNest?.settings.clampPositions}
                    scheduledParts={activeNest?.scheduledParts}
                    nestName={activeNest?.workOrder ? `${activeNest.workOrder}_${activeSheetIndex + 1}.nc` : `Program_${activeSheetIndex + 1}.nc`}
                    allSheets={activeNest?.sheets}
                />
            )}
            
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <ConfirmationModal state={confirmationState} onCancel={closeConfirmation} />
        </div>
    );
};

export default App;
