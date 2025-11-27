
import React, { useState, ChangeEvent, useEffect, useMemo } from 'react';
import { AppMode, NestLayout, Part, Tool, PlacedTool, ManualPunchMode, Point, NibbleSettings, DestructSettings, PlacementReference, SnapMode, ScheduledPart, TurretLayout, AutoPunchSettings, PlacementSide, TeachCycle, ToastMessage, ParametricScript } from './types';
import { initialTools, initialParts, initialNests, initialTurretLayouts, initialScripts } from './data/initialData';
import { generateId } from './utils/helpers';
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
import { AutoPunchSettingsModal } from './components/AutoPunchSettingsModal';
import { GCodeModal } from './components/GCodeModal';
import { TeachCycleSaveModal } from './components/TeachCycleSaveModal';
import { ConfirmationModal } from './components/common/ConfirmationModal';
import { ToastContainer } from './components/common/Toast';

import { parseDxf, dxfEntitiesToSvg } from './services/dxfParser';
import { parseCp } from './services/cpParser';
import { generateContourPunches, generateNibblePunches, generateDestructPunches } from './services/punching';
import { performNesting } from './services/nesting';
import { generateGCode } from './services/gcode';
import { getGeometryFromEntities, findSnapPoint, findClosestSegment, detectPartProfile } from './services/geometry';
import { calculateEdgePlacement } from './services/placement';
import { generateParametricScript } from './services/scriptGenerator';
import { createTeachCycleFromSelection } from './services/teachLogic';

const App: React.FC = () => {
    const [mode, setMode] = useState<AppMode>(AppMode.PartEditor);
    const [tools, setTools] = useState<Tool[]>(initialTools);
    
    // "parts" now acts as the Library of Concrete Parts ready for Nesting
    const [parts, setParts] = useState<Part[]>(initialParts);
    
    // "scripts" is the library of templates
    const [scripts, setScripts] = useState<ParametricScript[]>(initialScripts);
    
    // "activePart" is the current WIP part on the editor workbench
    const [activePart, setActivePart] = useState<Part | null>(null);
    
    const [nests, setNests] = useState<NestLayout[]>(initialNests);
    const [turretLayouts, setTurretLayouts] = useState<TurretLayout[]>(initialTurretLayouts);
    
    const [activeNestId, setActiveNestId] = useState<string | null>(initialNests[0]?.id || null);
    const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
    const [selectedPunchId, setSelectedPunchId] = useState<string | null>(null);

    // Nesting Interaction State
    const [selectedNestPartId, setSelectedNestPartId] = useState<string | null>(null);

    // Manual Punching State
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

    // Teach Cycles State
    const [teachCycles, setTeachCycles] = useState<TeachCycle[]>([]);
    const [teachMode, setTeachMode] = useState(false);
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
    const [selectedTeachPunchIds, setSelectedTeachPunchIds] = useState<string[]>([]);

    // Modal States
    const [showGCodeModal, setShowGCodeModal] = useState(false);
    const [generatedGCode, setGeneratedGCode] = useState('');
    const [showAutoPunchSettingsModal, setShowAutoPunchSettingsModal] = useState(false);
    const [showTeachSaveModal, setShowTeachSaveModal] = useState(false);
    
    // Toast
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

    const activePartProcessedGeometry = useMemo(() => {
        if (!activePart) return null;
        return getGeometryFromEntities(activePart);
    }, [activePart]);

    // Handle Punch Deletion with Keyboard
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Delete' && selectedPunchId && mode === AppMode.PartEditor) {
                handleDeletePunch(selectedPunchId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPunchId, activePart, mode]);
    
    const handleCanvasClick = (point: Point) => {
        if (mode === AppMode.Nesting) {
             return;
        }

        if (mode !== AppMode.PartEditor || !activePart) return;
        
        // --- TEACH MODE ---
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
                 return;
             }
             return;
        }

        if (selectedPunchId) {
            setSelectedPunchId(null);
        }
        
        if (!selectedToolId || !selectedTool) return;

        const snapResult = findSnapPoint(point, activePartProcessedGeometry, snapMode);
        const finalPoint = snapResult?.point ?? point;

        switch(manualPunchMode) {
            case ManualPunchMode.Punch: {
                if (placementReference === PlacementReference.Center) {
                    addPunchesWithCollisionCheck([{ 
                        toolId: selectedToolId, 
                        x: finalPoint.x, 
                        y: finalPoint.y, 
                        rotation: punchOrientation 
                    }]);
                    return;
                }

                const placementAngle = snapResult?.angle ?? 0;
                const { x, y, rotation } = calculateEdgePlacement(
                    finalPoint,
                    placementAngle,
                    selectedTool,
                    punchOrientation,
                    punchOffset,
                    snapResult?.snapTarget ?? 'middle',
                    snapResult?.wasNormalized ?? false,
                    placementSide
                );
                
                addPunchesWithCollisionCheck([{ toolId: selectedToolId, x, y, rotation }]);
                break;
            }
            case ManualPunchMode.Nibble: {
                const closestSeg = findClosestSegment(point, activePartProcessedGeometry);
                if (closestSeg) {
                     const punches = generateNibblePunches(
                        closestSeg.p1, 
                        closestSeg.p2, 
                        selectedTool, 
                        nibbleSettings, 
                        closestSeg.angle, 
                        closestSeg.wasNormalized,
                        punchOrientation,
                        punchOffset
                    );
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
                    const endPoint = finalPoint;
                    let newPunchesData: Omit<PlacedTool, 'id'>[] = [];
                    
                    if (manualPunchMode === ManualPunchMode.Destruct && selectedTool) {
                         newPunchesData = generateDestructPunches(startPoint, endPoint, selectedTool, destructSettings);
                    }
                    addPunchesWithCollisionCheck(newPunchesData);
                }
                break;
            }
        }
    };
    
    // Teach Punch Selection Handler
    const handleTeachPunchSelect = (id: string) => {
        if (!teachMode) {
            setSelectedPunchId(id);
            return;
        }
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
        setTeachMode(enable);
        setSelectedSegmentIds([]);
        setSelectedTeachPunchIds([]);
        if (enable) setSelectedPunchId(null);
    };

    const handleCreateCycle = (name: string, symmetry: any) => {
        if (!activePart || !activePartProcessedGeometry) return;
        
        const newCycle = createTeachCycleFromSelection(
            name,
            symmetry,
            selectedSegmentIds,
            selectedTeachPunchIds,
            activePart,
            activePartProcessedGeometry
        );

        if (newCycle) {
            setTeachCycles(prev => [...prev, newCycle]);
            handleTeachModeToggle(false); // Exit mode
        } else {
            alert("Не удалось создать цикл. Убедитесь, что выбраны линии и инструменты.");
        }
        setShowTeachSaveModal(false);
    };

    const handleDeleteCycle = (id: string) => {
        setTeachCycles(prev => prev.filter(c => c.id !== id));
    };

    const { svgRef, viewBox, setViewBox, isDragging, getPointFromEvent, panZoomHandlers } = usePanAndZoom(
        { x: 0, y: 0, width: 100, height: 100 },
        { onClick: handleCanvasClick }
    );

    useEffect(() => {
        if (activePart) {
            setViewBox({
                x: -5,
                y: -5,
                width: activePart.geometry.width + 10,
                height: activePart.geometry.height + 10
            });
             setSelectedPunchId(null);
        }
    }, [activePart?.id]); 

     useEffect(() => {
        setPunchCreationStep(0);
        setPunchCreationPoints([]);
    }, [manualPunchMode, activePart]);
     
      useEffect(() => {
        setSelectedPunchId(null);
        setTeachMode(false);
        if (mode === AppMode.Nesting && activeNest) {
             // Reset view for nesting sheet
             const sheetToView = activeNest.sheets[activeSheetIndex];
             // If we have a result sheet, use its dimension. 
             // If not, try available stock or default.
             let width = 2500;
             let height = 1250;
             if (sheetToView) {
                 width = sheetToView.width;
                 height = sheetToView.height;
             } else {
                 const stock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0];
                 if(stock) { width = stock.width; height = stock.height; }
             }

             setViewBox({ x: -50, y: -50, width: width + 100, height: height + 100 });
        }
    }, [mode, activeNestId, activeSheetIndex]);

    const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            const fileName = file.name;
            
            // Handle .cp files (NC Express)
            if (fileName.toLowerCase().endsWith('.cp')) {
                try {
                    const parsedPart = parseCp(content, fileName, tools);
                    if (parsedPart) {
                        // Detect profile
                        parsedPart.profile = detectPartProfile(parsedPart.geometry);
                        
                        setActivePart(parsedPart);
                        setMode(AppMode.PartEditor);
                        addToast(`Файл ${fileName} успешно импортирован.`, "success");
                        return;
                    } else {
                        addToast("Ошибка при разборе CP файла.", "error");
                        return;
                    }
                } catch (err) {
                    console.error(err);
                    addToast("Ошибка чтения файла CP.", "error");
                    return;
                }
            }

            // Handle DXF files
            try {
                const parsedEntities = parseDxf(content);
                if (parsedEntities.length > 0) {
                    const { path, width, height, bbox } = dxfEntitiesToSvg(parsedEntities);
                    if (width === 0 || height === 0) {
                        addToast("Геометрия в файле имеет нулевой размер.", "error");
                        return;
                    }
                    const newPart: Part = {
                        id: generateId(),
                        name: fileName.replace(/\.(dxf|DXF)$/, ''),
                        geometry: { path, width, height, entities: parsedEntities, bbox },
                        punches: [],
                        material: { code: 'St-3', thickness: 1.0, dieClearance: 0.2 },
                        nesting: {
                            allow0_180: true,
                            allow90_270: true,
                            initialRotation: 0,
                            commonLine: true,
                            canMirror: false
                        },
                        faceWidth: width, 
                        faceHeight: height 
                    };
                    
                    // Detect Profile (L/U shape via notches)
                    newPart.profile = detectPartProfile(newPart.geometry);

                    setActivePart(newPart);
                    setMode(AppMode.PartEditor);
                    addToast("DXF загружен.", "success");
                } else {
                    addToast("Не удалось найти геометрию в DXF файле.", "error");
                }
            } catch (error) {
                console.error("Error during DXF processing:", error);
                addToast("Ошибка при чтении DXF.", "error");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const addPunchesToPart = (punchesData: Omit<PlacedTool, 'id'>[]) => {
        if (!activePart) return;
        const newPunches = punchesData.map(p => ({ ...p, id: generateId() }));
        const updatedPart = { ...activePart, punches: [...activePart.punches, ...newPunches] };
        setActivePart(updatedPart);
    };
    
    const addPunchesWithCollisionCheck = (punchesData: Omit<PlacedTool, 'id'>[]) => {
        if (!activePart) return;
        addPunchesToPart(punchesData);
        setPunchCreationStep(0);
        setPunchCreationPoints([]);
    };
    
    const handleDeletePunch = (punchId: string | string[]) => {
        if (!activePart) return;
        const idsToDelete = Array.isArray(punchId) ? punchId : [punchId];
        const updatedPart = { ...activePart, punches: activePart.punches.filter(p => !idsToDelete.includes(p.id)) };
        setActivePart(updatedPart);
        if (selectedPunchId && idsToDelete.includes(selectedPunchId)) {
            setSelectedPunchId(null);
        }
    };
    
    const handleUpdatePunch = (punchId: string, updates: Partial<PlacedTool>) => {
        if (!activePart) return;
        const updatedPunches = activePart.punches.map(p => p.id === punchId ? { ...p, ...updates } : p);
        const updatedPart = { ...activePart, punches: updatedPunches };
        setActivePart(updatedPart);
    };

    const handleDeletePartFromLibrary = (partId: string) => {
        confirm(
            "Удаление детали",
            "Вы уверены, что хотите удалить эту деталь из списка для раскроя?",
            () => {
                setParts(prev => prev.filter(p => p.id !== partId));
                setNests(prevNests => prevNests.map(nest => ({
                    ...nest,
                    scheduledParts: nest.scheduledParts.filter(sp => sp.partId !== partId)
                })));
            }
        );
    };

    const handleUpdateActivePart = (updates: Partial<Part>) => {
        if (activePart) {
            setActivePart({ ...activePart, ...updates });
        }
    }

    const handleClosePart = () => {
        confirm(
            "Закрыть редактор?",
            "Все несохраненные изменения в текущей детали будут потеряны.",
            () => {
                setActivePart(null);
            }
        );
    }

    // SCRIPT LIBRARY LOGIC
    
    const handleSavePartAsScript = () => {
        if (!activePart) return;
        
        const generatedCode = generateParametricScript(activePart, tools);
        const newScript: ParametricScript = {
            id: generateId(),
            name: activePart.name,
            code: generatedCode,
            defaultWidth: activePart.faceWidth,
            defaultHeight: activePart.faceHeight,
            updatedAt: Date.now()
        };
        
        setScripts(prev => [...prev, newScript]);
        setActivePart(null);
        addToast("Скрипт сохранен в библиотеку", "success");
    };

    const handleSavePartAsStatic = () => {
        if (!activePart) return;
        
        setParts(prev => {
            const idx = prev.findIndex(p => p.id === activePart.id);
            if (idx > -1) {
                const copy = [...prev];
                copy[idx] = activePart;
                return copy;
            }
            return [...prev, activePart];
        });
        
        setActivePart(null);
        addToast("Деталь сохранена в список для раскроя", "success");
    };

    const handleSaveScript = (script: ParametricScript) => {
        setScripts(prev => {
            const idx = prev.findIndex(s => s.id === script.id);
            if (idx > -1) {
                const copy = [...prev];
                copy[idx] = script;
                return copy;
            }
            return [...prev, script];
        });
        addToast("Скрипт обновлен", "success");
    };

    const handleDeleteScript = (id: string) => {
        setScripts(prev => prev.filter(s => s.id !== id));
    };

    const handleCreatePartFromScript = (part: Part) => {
        setParts(prev => [...prev, part]);
        addToast(`Деталь "${part.name}" добавлена к списку для раскроя`, "success");
    }

    const handleLoadPart = (part: Part) => {
        setActivePart(part);
        setMode(AppMode.PartEditor);
    };

    const handleUpdatePartInLibrary = (updatedPart: Part) => {
        setParts(prev => prev.map(p => p.id === updatedPart.id ? updatedPart : p));
        addToast("Деталь обновлена", "success");
    };

    const handleOpenAutoPunchSettings = () => {
        if (!activePart) return;
        setShowAutoPunchSettingsModal(true);
    };
    
    const handleApplyAutoPunch = (settings: AutoPunchSettings) => {
        if (!activePart) return;
        const newPunchesData = generateContourPunches(
            activePart.geometry, 
            tools, 
            settings, 
            turretLayouts,
            teachCycles
        );
        addPunchesWithCollisionCheck(newPunchesData);
        setShowAutoPunchSettingsModal(false);
        addToast(`Сгенерировано ударов: ${newPunchesData.length}`, "success");
    };
    
    const handleRunNesting = () => {
        if (!activeNest) return;
        
        if (activeNest.scheduledParts.length === 0) {
            addToast("Нет деталей для раскроя.", "error");
            return;
        }

        try {
            const generatedSheets = performNesting(activeNest.scheduledParts, parts, tools, activeNest.settings);
            
            if (generatedSheets.length === 0) {
                 addToast("Не удалось разместить детали. Проверьте размеры листа.", "error");
            } else {
                 const updatedNest = { ...activeNest, sheets: generatedSheets };
                 setNests(nests.map(n => n.id === activeNestId ? updatedNest : n));
                 setActiveSheetIndex(0); // Reset to first sheet
                 addToast(`Раскрой завершен. Листов: ${generatedSheets.length}`, "success");
            }
        } catch (e: any) {
            console.error(e);
            addToast(`Ошибка раскроя: ${e.message}`, "error");
        }
    };

    const handleClearNest = () => {
        if (!activeNest) return;
        confirm(
            "Очистить результат",
            "Вы уверены, что хотите сбросить все результаты раскроя?",
            () => {
                const updatedNest = { ...activeNest, sheets: [] };
                setNests(nests.map(n => n.id === activeNestId ? updatedNest : n));
                setSelectedNestPartId(null);
                setActiveSheetIndex(0);
                addToast("Результаты сброшены", "info");
            }
        );
    };

    const handleMoveNestPart = (partId: string, dx: number, dy: number) => {
        if (!activeNest || !currentNestSheet) return;
        
        const updatedSheet = {
            ...currentNestSheet,
            placedParts: currentNestSheet.placedParts.map(pp => 
                pp.id === partId ? { ...pp, x: pp.x + dx, y: pp.y + dy } : pp
            )
        };

        const updatedSheets = [...activeNest.sheets];
        updatedSheets[activeSheetIndex] = updatedSheet;

        const updatedNest = { ...activeNest, sheets: updatedSheets };
        setNests(nests.map(n => n.id === activeNestId ? updatedNest : n));
    };

    const handleRotateNestPart = (partId: string) => {
        if (!activeNest || !currentNestSheet) return;
        
        const updatedSheet = {
             ...currentNestSheet,
             placedParts: currentNestSheet.placedParts.map(pp => 
                 pp.id === partId ? { ...pp, rotation: (pp.rotation + 90) % 360 } : pp
             )
        };
        const updatedSheets = [...activeNest.sheets];
        updatedSheets[activeSheetIndex] = updatedSheet;

        const updatedNest = { ...activeNest, sheets: updatedSheets };
        setNests(nests.map(n => n.id === activeNestId ? updatedNest : n));
    };
    
    const handleSelectNestPart = (id: string | null) => {
        setSelectedNestPartId(id);
    };

    const handleGenerateGCode = () => {
        if (!currentNestSheet) return;
        const code = generateGCode(currentNestSheet, parts, tools, activeNest?.name || 'Nest');
        setGeneratedGCode(code);
        setShowGCodeModal(true);
    };
    
    const downloadGCode = () => {
        if (!generatedGCode) return;
        const blob = new Blob([generatedGCode], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = activeNest?.name ? `${activeNest.name.replace(/\s/g, '_')}_Sheet${activeSheetIndex+1}.nc` : `gcode_${Date.now()}.nc`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleSaveTool = (toolToSave: Tool) => {
        const toolIndex = tools.findIndex(t => t.id === toolToSave.id);

        if (toolIndex > -1) {
            const newTools = [...tools];
            newTools[toolIndex] = toolToSave;
            setTools(newTools.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
            const newToolWithId = { ...toolToSave, id: generateId() };
            setTools([...tools, newToolWithId].sort((a, b) => a.name.localeCompare(b.name)));
        }
    };

    const handleDeleteTool = (toolId: string) => {
        confirm(
            "Удаление инструмента",
            "Вы уверены, что хотите удалить этот инструмент? Это действие нельзя отменить.",
            () => {
                setTools(prev => prev.filter(t => t.id !== toolId));
            }
        );
    };
    
    const handleCyclePunchOrientation = () => {
        setPunchOrientation(current => (current + 90) % 360);
    };

    const handleUpdateNestingSettings = (newSettings: NestLayout['settings'], newScheduledParts: ScheduledPart[]) => {
        if (!activeNest) return;
        const updatedNest = {
            ...activeNest,
            settings: newSettings,
            scheduledParts: newScheduledParts
        };
        setNests(nests.map(n => n.id === activeNestId ? updatedNest : n));
    }

    const renderContent = () => {
        if (mode === AppMode.ToolLibrary) {
            return (
                <ToolLibraryView 
                    tools={tools} 
                    onSaveTool={handleSaveTool} 
                    onDeleteTool={handleDeleteTool} 
                />
            );
        }
        if (mode === AppMode.ScriptLibrary) {
            return (
                <ScriptLibraryView 
                    scripts={scripts}
                    tools={tools}
                    onSaveScript={handleSaveScript}
                    onDeleteScript={handleDeleteScript}
                    onCreatePart={handleCreatePartFromScript}
                />
            );
        }
        if (mode === AppMode.PartLibrary) {
            return (
                <PartLibraryView 
                    parts={parts}
                    tools={tools}
                    onLoadPart={handleLoadPart}
                    onDeletePart={handleDeletePartFromLibrary}
                    onUpdatePart={handleUpdatePartInLibrary}
                />
            );
        }
        if (mode === AppMode.TurretSetup) {
            return (
                <TurretSetupView 
                    tools={tools}
                    setTools={setTools}
                    layouts={turretLayouts}
                    setLayouts={setTurretLayouts}
                />
            );
        }
        
        return (
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
                    manualPunchMode={manualPunchMode}
                    setManualPunchMode={setManualPunchMode}
                    selectedToolId={selectedToolId}
                    setSelectedToolId={setSelectedToolId}
                    selectedPunchId={selectedPunchId}
                    setSelectedPunchId={setSelectedPunchId}
                    onDeletePunch={handleDeletePunch}
                    onUpdatePunch={handleUpdatePunch}
                    placementReference={placementReference}
                    setPlacementReference={setPlacementReference}
                    placementSide={placementSide}
                    setPlacementSide={setPlacementSide}
                    punchOrientation={punchOrientation}
                    setPunchOrientation={setPunchOrientation}
                    onCyclePunchOrientation={handleCyclePunchOrientation}
                    snapMode={snapMode}
                    setSnapMode={setSnapMode}
                    punchOffset={punchOffset}
                    setPunchOffset={setPunchOffset}
                    // Nesting Sidebar Logic
                    onUpdateNestingSettings={handleUpdateNestingSettings}
                    nibbleSettings={nibbleSettings}
                    setNibbleSettings={setNibbleSettings}
                    destructSettings={destructSettings}
                    setDestructSettings={setDestructSettings}
                    onOpenTurretView={() => setMode(AppMode.TurretSetup)}
                    onSavePartAsScript={handleSavePartAsScript}
                    onSavePartAsStatic={handleSavePartAsStatic}
                    onUpdateActivePart={handleUpdateActivePart}
                    onClosePart={handleClosePart}
                    // Teach Mode Props
                    teachMode={teachMode}
                    setTeachMode={handleTeachModeToggle}
                    onSaveTeachCycle={() => setShowTeachSaveModal(true)}
                    teachCycles={teachCycles}
                    onDeleteTeachCycle={handleDeleteCycle}
                    // Nesting Props
                    onRunNesting={handleRunNesting}
                    onClearNest={handleClearNest}
                    selectedNestPartId={selectedNestPartId}
                    onMoveNestPart={handleMoveNestPart}
                    onRotateNestPart={handleRotateNestPart}
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
                    panZoomHandlers={panZoomHandlers}
                    getPointFromEvent={getPointFromEvent}
                    onOpenAutoPunchSettings={handleOpenAutoPunchSettings}
                    punchCreationStep={punchCreationStep}
                    punchCreationPoints={punchCreationPoints}
                    manualPunchMode={manualPunchMode}
                    selectedToolId={selectedToolId}
                    selectedPunchId={selectedPunchId}
                    onSelectPunch={handleTeachPunchSelect}
                    placementReference={placementReference}
                    placementSide={placementSide}
                    punchOrientation={punchOrientation}
                    snapMode={snapMode}
                    punchOffset={punchOffset}
                    nibbleSettings={nibbleSettings}
                    // Teach Mode
                    teachMode={teachMode}
                    selectedSegmentIds={selectedSegmentIds}
                    selectedTeachPunchIds={selectedTeachPunchIds}
                    onTeachBulkSelect={handleTeachBulkSelect}
                    // Nesting
                    selectedNestPartId={selectedNestPartId}
                    onSelectNestPart={handleSelectNestPart}
                    onMoveNestPart={handleMoveNestPart}
                />
                <RightPanel 
                    tools={tools}
                    selectedToolId={selectedToolId}
                    setSelectedToolId={setSelectedToolId}
                    onOpenTurretView={() => setMode(AppMode.TurretSetup)}
                    // Nesting Props
                    isNestingMode={mode === AppMode.Nesting}
                    activeNest={activeNest}
                    activeSheetIndex={activeSheetIndex}
                    setActiveSheetIndex={setActiveSheetIndex}
                    allParts={parts}
                />
            </>
        );
    }

    return (
        <div className="flex flex-col h-screen font-sans relative">
            <Header 
                mode={mode} 
                setMode={setMode} 
                onGenerateGCode={handleGenerateGCode}
                onOpenTurretConfig={() => setMode(AppMode.TurretSetup)}
            />

            <div className="flex flex-1 overflow-hidden">
                 {renderContent()}
            </div>

            {showAutoPunchSettingsModal && activePart && (
                <AutoPunchSettingsModal 
                    onClose={() => setShowAutoPunchSettingsModal(false)}
                    onApply={handleApplyAutoPunch}
                    turretLayouts={turretLayouts}
                />
            )}
            {showTeachSaveModal && (
                <TeachCycleSaveModal 
                    onClose={() => setShowTeachSaveModal(false)}
                    onSave={handleCreateCycle}
                />
            )}
            {showGCodeModal && (
                <GCodeModal gcode={generatedGCode} onClose={() => setShowGCodeModal(false)} onDownload={downloadGCode} />
            )}
            
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <ConfirmationModal state={confirmationState} onCancel={closeConfirmation} />
        </div>
    );
};

export default App;
