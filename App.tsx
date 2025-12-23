
/**
 * ОТВЕТСТВЕННОСТЬ: Главный оркестратор приложения. Связывает хуки состояния с обработчиками событий.
 * ДОЛЖЕН СОДЕРЖАТЬ: Вызовы кастомных хуков (useAppPersistence, useEditorState и т.д.) и привязку хэндлеров.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: Объемную логику или JSX (передано в AppUI).
 */
import React, { useEffect } from 'react';
import { AppMode, NestLayout, Part, PlacedTool, Point, ScheduledPart, OptimizerSettings, PunchOp } from './types';
import { initialNests } from './data/initialData';
import { generateId, getPartBaseName, generatePartNameFromProfile } from './utils/helpers';
import { usePanAndZoom } from './hooks/usePanAndZoom';
import { useConfirmation } from './hooks/useConfirmation';
import { useFileImport } from './hooks/useFileImport';

// New Custom Hooks
import { useAppPersistence } from './hooks/useAppPersistence';
import { useEditorState } from './hooks/useEditorState';
import { useNestingState } from './hooks/useNestingState';
import { useSimulationState } from './hooks/useSimulationState';
import { useUIState } from './hooks/useUIState';

// Service imports for handlers
import { generateContourPunches } from './services/punching';
import { nestingGenerator } from './services/nesting';
import { generateGCode, calculateOptimizedPath } from './services/gcode';
import { findClosestSegment, detectPartProfile } from './services/geometry';
import { generateParametricScript } from './services/scriptGenerator';
import { createTeachCycleFromSelection } from './services/teachLogic';

import { AppUI } from './AppUI';

const App: React.FC = () => {
    const [mode, setMode] = React.useState<AppMode>(AppMode.PartEditor);
    
    // --- Hook Initializations ---
    const persistence = useAppPersistence();
    const ui = useUIState();
    const simulation = useSimulationState();
    
    const onAddPunches = (punchesData: Omit<PlacedTool, 'id'>[]) => {
        if (!editor.activePart) return;
        const newPunches = punchesData.map(p => ({ ...p, id: generateId() }));
        editor.setActivePart({ ...editor.activePart, punches: [...editor.activePart.punches, ...newPunches] });
    };

    const editor = useEditorState({ tools: persistence.tools, onAddPunches });
    const nesting = useNestingState(initialNests[0]?.id || null);
    
    const { confirmationState, confirm, closeConfirmation } = useConfirmation();
    const { handleFileUpload } = useFileImport({ 
        tools: persistence.tools, setMode, setActivePart: editor.setActivePart, addToast: ui.addToast 
    });

    // Derived Logic
    const activeNest = persistence.nests.find(n => n.id === nesting.activeNestId) || null;
    const currentNestSheet = activeNest?.sheets[nesting.activeSheetIndex] || null;

    // --- Reset Optimization when sheet changes ---
    useEffect(() => {
        simulation.setOptimizedOperations(null);
        simulation.setSimulationStep(0);
        simulation.setIsSimulating(false);
    }, [nesting.activeNestId, nesting.activeSheetIndex, currentNestSheet]);

    // --- Pan and Zoom Setup ---
    const handleCanvasClickProxy = (rawPoint: Point) => {
        if (mode === AppMode.Nesting) return;
        if (mode !== AppMode.PartEditor || !editor.activePart) return;

        const point = { x: rawPoint.x, y: -rawPoint.y };

        if (editor.teachMode) {
             const closestSeg = findClosestSegment(point, editor.activePartProcessedGeometry);
             if (closestSeg) {
                 const idx = editor.activePartProcessedGeometry?.segments.findIndex((s: any) => 
                     Math.abs(s.p1.x - closestSeg.p1.x) < 0.001 && Math.abs(s.p1.y - closestSeg.p1.y) < 0.001 &&
                     Math.abs(s.p2.x - closestSeg.p2.x) < 0.001 && Math.abs(s.p2.y - closestSeg.p2.y) < 0.001
                 ) ?? -1;
                 
                 if (idx !== -1) {
                     editor.setSelectedSegmentIds(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
                 }
             }
             return;
        }
        
        if (editor.selectedPunchId) editor.setSelectedPunchId(null);
        editor.manualPunch.handleCanvasClick(rawPoint);
    };

    const panZoom = usePanAndZoom({ x: 0, y: 0, width: 100, height: 100 }, { onClick: handleCanvasClickProxy });

    // --- Effects for ViewBox ---
    useEffect(() => {
        if (editor.activePart) {
            panZoom.setViewBox({ x: -5, y: -editor.activePart.geometry.height - 5, width: editor.activePart.geometry.width + 10, height: editor.activePart.geometry.height + 10 });
            editor.setSelectedPunchId(null);
        }
    }, [editor.activePart?.id]); 

    useEffect(() => {
        editor.setSelectedPunchId(null);
        editor.setTeachMode(false);
        if (mode === AppMode.Nesting && activeNest) {
             const sheetToView = activeNest.sheets[nesting.activeSheetIndex];
             let width = 2500, height = 1250;
             if (sheetToView) { width = sheetToView.width; height = sheetToView.height; }
             else { 
                const stock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0]; 
                if(stock) { width = stock.width; height = stock.height; } 
             }
             panZoom.setViewBox({ x: -50, y: -height - 50, width: width + 100, height: height + 100 });
        }
    }, [mode, nesting.activeNestId, nesting.activeSheetIndex]);

    // --- Handlers Binding ---
    const onRunOptimization = (finalSettings: OptimizerSettings) => {
        if (!currentNestSheet) return;
        persistence.setOptimizerSettings(finalSettings);
        ui.setShowOptimizerModal(false);

        const ops = calculateOptimizedPath(currentNestSheet, persistence.parts, persistence.tools, finalSettings);
        simulation.setOptimizedOperations(ops);
        simulation.setSimulationStep(0); 

        if (ui.isGeneratingGCode) {
            const programNumber = nesting.activeSheetIndex + 1;
            const ncFilename = activeNest?.workOrder ? `${activeNest.workOrder}_${programNumber}.nc` : `Program_${programNumber}.nc`;
            const code = generateGCode(currentNestSheet, persistence.parts, persistence.tools, ncFilename, persistence.machineSettings, finalSettings, activeNest?.settings.clampPositions, programNumber, ops);
            ui.setGeneratedGCode(code);
            ui.setShowGCodeModal(true);
        } else {
            ui.addToast(`Оптимизация завершена. ${ops.length} операций.`, "success");
        }
    };

    const handleRunNesting = async () => {
        if(!activeNest || activeNest.scheduledParts.length===0) return;
        nesting.setIsNestingProcessing(true);
        nesting.setNestingProgress(0);
        nesting.setNestingStatus('Инициализация...');
        persistence.setNests(n => n.map(x => x.id === nesting.activeNestId ? {...x, sheets: []} : x)); 
        nesting.setActiveSheetIndex(0);

        try {
            for await (const update of nestingGenerator(activeNest.scheduledParts, persistence.parts, persistence.tools, activeNest.settings)) {
                persistence.setNests(prev => prev.map(n => n.id === nesting.activeNestId ? { ...n, sheets: update.sheets } : n));
                nesting.setNestingProgress(update.progress);
                nesting.setNestingStatus(update.status);
            }
            ui.addToast("Раскрой завершен", "success");
        } catch(e:any) {
            ui.addToast("Ошибка раскроя: " + e.message, "error");
        } finally {
            nesting.setIsNestingProcessing(false);
        }
    };

    const downloadGCode = () => {
        const blob = new Blob([ui.generatedGCode], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = activeNest?.workOrder ? `${activeNest.workOrder}_${nesting.activeSheetIndex + 1}.nc` : `Program_${nesting.activeSheetIndex + 1}.nc`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    };

    return (
        <AppUI 
            mode={mode} setMode={setMode}
            tools={persistence.tools} parts={persistence.parts} scripts={persistence.scripts} nests={persistence.nests}
            turretLayouts={persistence.turretLayouts} machineSettings={persistence.machineSettings}
            optimizerSettings={persistence.optimizerSettings} teachCycles={persistence.teachCycles}
            activePart={editor.activePart} activePartProcessedGeometry={editor.activePartProcessedGeometry}
            manualPunchMode={editor.manualPunchMode} selectedToolId={editor.selectedToolId} selectedPunchId={editor.selectedPunchId}
            punchOrientation={editor.punchOrientation} snapMode={editor.snapMode} punchOffset={editor.punchOffset}
            nibbleSettings={editor.nibbleSettings} destructSettings={editor.destructSettings} teachMode={editor.teachMode}
            selectedSegmentIds={editor.selectedSegmentIds} selectedTeachPunchIds={editor.selectedTeachPunchIds}
            activeNest={activeNest} activeSheetIndex={nesting.activeSheetIndex} selectedNestPartId={nesting.selectedNestPartId}
            isNestingProcessing={nesting.isNestingProcessing} nestingProgress={nesting.nestingProgress} nestingStatus={nesting.nestingStatus}
            optimizedOperations={simulation.optimizedOperations} simulationStep={simulation.simulationStep}
            isSimulating={simulation.isSimulating} simulationSpeed={simulation.simulationSpeed}
            // Bindings
            onGenerateGCodeRequest={() => { if(!currentNestSheet) { ui.addToast("Нет листа", "error"); return; } ui.setIsGeneratingGCode(true); ui.setShowOptimizerModal(true); }}
            onOptimizePathRequest={() => { if(!currentNestSheet) { ui.addToast("Нет листа", "error"); return; } ui.setIsGeneratingGCode(false); ui.setShowOptimizerModal(true); }}
            onRunOptimization={onRunOptimization}
            onToggleSimulation={() => simulation.setIsSimulating(!simulation.isSimulating)}
            onStopSimulation={simulation.stopSimulation}
            onStepSimulation={simulation.stepSimulation}
            onSpeedChange={simulation.setSimulationSpeed}
            onFileUpload={handleFileUpload}
            onClearAllPunches={() => confirm("Очистка", "Удалить все инструменты?", () => { editor.setActivePart(p => p ? {...p, punches: []} : null); ui.addToast("Инструменты удалены", "info"); })}
            onCanvasClick={handleCanvasClickProxy}
            onTeachBulkSelect={(segs, punches, add) => { 
                if (add) { editor.setSelectedSegmentIds(prev => Array.from(new Set([...prev, ...segs]))); editor.setSelectedTeachPunchIds(prev => Array.from(new Set([...prev, ...punches]))); } 
                else { editor.setSelectedSegmentIds(segs); editor.setSelectedTeachPunchIds(punches); }
            }}
            onTeachModeToggle={(val) => { editor.setTeachMode(val); editor.setSelectedSegmentIds([]); editor.setSelectedTeachPunchIds([]); }}
            onSaveTeachCycle={(name, symmetry) => {
                const cycle = createTeachCycleFromSelection(name, symmetry, editor.selectedSegmentIds, editor.selectedTeachPunchIds, editor.activePart!, editor.activePartProcessedGeometry!);
                if (cycle) { persistence.setTeachCycles(prev => [...prev, cycle]); editor.setTeachMode(false); }
                ui.setShowTeachSaveModal(false);
            }}
            onDeleteTeachCycle={(id) => persistence.setTeachCycles(prev => prev.filter(c => c.id !== id))}
            onDeletePunch={(ids) => editor.setActivePart(p => p ? {...p, punches: p.punches.filter(px => !(Array.isArray(ids) ? ids.includes(px.id) : px.id === ids))} : null)}
            onUpdatePunch={(id, u) => editor.setActivePart(p => p ? {...p, punches: p.punches.map(px => px.id === id ? {...px, ...u} : px)} : null)}
            onSavePartAsScript={() => { const code = generateParametricScript(editor.activePart!, persistence.tools); persistence.setScripts(s => [...s, {id: generateId(), name: editor.activePart!.name, code, defaultWidth: editor.activePart!.faceWidth, defaultHeight: editor.activePart!.faceHeight, updatedAt: Date.now()}]); editor.setActivePart(null); ui.addToast("Скрипт сохранен", "success"); }}
            onSavePartAsStatic={() => { const name = generatePartNameFromProfile(getPartBaseName(editor.activePart!.name), editor.activePart!.profile, editor.activePart!.faceWidth, editor.activePart!.faceHeight); persistence.setParts(prev => [...prev.filter(x=>x.id!==editor.activePart!.id), {...editor.activePart!, name}]); editor.setActivePart(null); ui.addToast(`Деталь ${name} сохранена`, "success"); }}
            onRunNesting={handleRunNesting}
            onClearNest={() => confirm("Сброс", "Очистить раскрой?", () => { persistence.setNests(n => n.map(x => x.id === nesting.activeNestId ? {...x, sheets: []} : x)); nesting.setSelectedNestPartId(null); nesting.setActiveSheetIndex(0); })}
            onMoveNestPart={(id, dx, dy) => { 
                const newSheets = [...activeNest!.sheets]; 
                newSheets[nesting.activeSheetIndex] = {...currentNestSheet!, placedParts: currentNestSheet!.placedParts.map(p => p.id === id ? {...p, x: p.x+dx, y: p.y+dy} : p)};
                persistence.setNests(n => n.map(x => x.id === nesting.activeNestId ? {...x, sheets: newSheets} : x));
            }}
            onRotateNestPart={(id) => {
                const newSheets = [...activeNest!.sheets];
                newSheets[nesting.activeSheetIndex] = { ...currentNestSheet!, placedParts: currentNestSheet!.placedParts.map(pp => {
                    if(pp.id !== id) return pp;
                    const pDef = persistence.parts.find(p=>p.id===pp.partId)!;
                    const w = pDef.geometry.width, h = pDef.geometry.height;
                    const oldR = pp.rotation * Math.PI / 180, newR = ((pp.rotation+90)%360) * Math.PI / 180;
                    const cxOld = (w/2)*Math.cos(oldR)-(h/2)*Math.sin(oldR), cyOld = (w/2)*Math.sin(oldR)+(h/2)*Math.cos(oldR);
                    const cxNew = (w/2)*Math.cos(newR)-(h/2)*Math.sin(newR), cyNew = (w/2)*Math.sin(newR)+(h/2)*Math.cos(newR);
                    return {...pp, rotation: (pp.rotation+90)%360, x: pp.x + (cxOld-cxNew), y: pp.y + (cyOld-cyNew)};
                })};
                persistence.setNests(n => n.map(x => x.id === nesting.activeNestId ? {...x, sheets: newSheets} : x));
            }}
            onUpdateNestingSettings={(s, sp) => persistence.setNests(prev => prev.map(n => n.id === nesting.activeNestId ? { ...n, settings: s, scheduledParts: sp } : n))}
            onUpdateNestMetadata={(m) => persistence.setNests(prev => prev.map(n => n.id === nesting.activeNestId ? { ...n, ...m } : n))}
            onUpdateActivePart={(u) => editor.setActivePart(p => p ? {...p, ...u} : null)}
            onClosePart={() => confirm("Закрыть?", "Изменения будут потеряны.", () => editor.setActivePart(null))}
            onSelectNestPart={nesting.setSelectedNestPartId}
            onLoadPartFromLibrary={(p) => { editor.setActivePart(p); setMode(AppMode.PartEditor); }}
            onDeletePartFromLibrary={(id) => confirm("Удаление", "Удалить деталь?", () => { persistence.setParts(p => p.filter(x => x.id !== id)); persistence.setNests(n => n.map(x => ({...x, scheduledParts: x.scheduledParts.filter(s => s.partId !== id)}))); })}
            onUpdatePartInLibrary={(p) => { persistence.setParts(prev => prev.map(px => px.id === p.id ? p : px)); ui.addToast("Обновлено", "success"); }}
            onSaveScript={(s) => { persistence.setScripts(prev => prev.map(sx => sx.id === s.id ? s : sx)); ui.addToast("Обновлено", "success"); }}
            onDeleteScript={(id) => confirm("Удаление", "Удалить скрипт?", () => persistence.setScripts(prev => prev.filter(s => s.id !== id)))}
            onCreatePartFromScript={(p) => { persistence.setParts(prev => [...prev, p]); ui.addToast("Создано", "success"); }}
            onBatchProcess={(pNew, spNew) => { 
                persistence.setParts(prev => [...prev, ...pNew.filter(pn => !prev.some(px => px.id === pn.id))]);
                if (nesting.activeNestId) { persistence.setNests(prev => prev.map(n => n.id === nesting.activeNestId ? { ...n, scheduledParts: [...n.scheduledParts, ...spNew] } : n)); }
            }}
            onSaveTool={(t) => { persistence.setTools(prev => prev.some(px => px.id === t.id) ? prev.map(px => px.id === t.id ? t : px) : [...prev, t]); ui.addToast("Сохранено", "success"); }}
            onDeleteTool={(id) => confirm("Удаление", "Удалить инструмент?", () => persistence.setTools(prev => prev.filter(t => t.id !== id)))}
            onUpdateMachineSettings={persistence.setMachineSettings}
            onUpdateTurretTools={persistence.setTools}
            onUpdateTurretLayouts={persistence.setTurretLayouts}
            ui={{
                ...ui,
                downloadGCode,
                openAutoPunchSettings: () => ui.setShowAutoPunchSettingsModal(true),
                onAutoPunchApply: (s) => { const p = generateContourPunches(editor.activePart!.geometry, persistence.tools, s, persistence.turretLayouts, persistence.teachCycles); onAddPunches(p); ui.setShowAutoPunchSettingsModal(false); ui.addToast(`Сгенерировано: ${p.length}`, "success"); }
            }}
            confirmation={{ state: confirmationState, close: closeConfirmation }}
            panZoom={{ ...panZoom, handlers: panZoom.panZoomHandlers }}
            manualPunchState={{ step: editor.manualPunch.punchCreationStep, points: editor.manualPunch.punchCreationPoints }}
            setActiveSheetIndex={nesting.setActiveSheetIndex}
        />
    );
};

export default App;
