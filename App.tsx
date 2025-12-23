
/**
 * Finn-Power CAD/CAM Studio
 * ОТВЕТСТВЕННОСТЬ: Корневой компонент. Только оркестрация хуков и UI.
 */
import React from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { AppUI } from './AppUI';
import { AppMode, ScheduledPart, Part, Tool } from './types';
import { generateId, getPartBaseName, generatePartNameFromProfile } from './utils/helpers';
// FIX: Added missing import for generateParametricScript
import { generateParametricScript } from './services/scriptGenerator';

const App: React.FC = () => {
    const app = useAppLogic();
    const { persistence, editor, nesting, simulation, ui, handlers, derived } = app;

    // Вспомогательная обертка для проброса всех необходимых пропсов в AppUI
    // Это позволяет AppUI оставаться чистым компонентом представления.
    return (
        <AppUI 
            // Core
            mode={app.mode} 
            setMode={app.setMode}
            
            // Data
            tools={persistence.tools} 
            parts={persistence.parts} 
            scripts={persistence.scripts} 
            nests={persistence.nests}
            turretLayouts={persistence.turretLayouts} 
            machineSettings={persistence.machineSettings}
            optimizerSettings={persistence.optimizerSettings} 
            teachCycles={persistence.teachCycles}

            // Editor
            activePart={editor.activePart} 
            activePartProcessedGeometry={editor.activePartProcessedGeometry}
            manualPunchMode={editor.manualPunchMode} 
            selectedToolId={editor.selectedToolId} 
            selectedPunchId={editor.selectedPunchId}
            punchOrientation={editor.punchOrientation} 
            snapMode={editor.snapMode} 
            punchOffset={editor.punchOffset}
            nibbleSettings={editor.nibbleSettings} 
            destructSettings={editor.destructSettings} 
            teachMode={editor.teachMode}
            selectedSegmentIds={editor.selectedSegmentIds} 
            selectedTeachPunchIds={editor.selectedTeachPunchIds}

            // Nesting
            activeNest={derived.activeNest} 
            activeSheetIndex={nesting.activeSheetIndex} 
            selectedNestPartId={nesting.selectedNestPartId}
            isNestingProcessing={nesting.isNestingProcessing} 
            nestingProgress={nesting.nestingProgress} 
            nestingStatus={nesting.nestingStatus}

            // Simulation
            optimizedOperations={simulation.optimizedOperations} 
            simulationStep={simulation.simulationStep}
            isSimulating={simulation.isSimulating} 
            simulationSpeed={simulation.simulationSpeed}

            // Handlers
            onGenerateGCodeRequest={handlers.onGenerateGCodeRequest}
            onOptimizePathRequest={handlers.onOptimizePathRequest}
            onRunOptimization={handlers.onRunOptimization}
            onToggleSimulation={() => simulation.setIsSimulating(!simulation.isSimulating)}
            onStopSimulation={simulation.stopSimulation}
            onStepSimulation={simulation.stepSimulation}
            onSpeedChange={simulation.setSimulationSpeed}
            onFileUpload={handlers.handleFileUpload}
            onClearAllPunches={handlers.onClearAllPunches}
            onCanvasClick={app.panZoom.panZoomHandlers.onMouseUp as any} // Fallback proxy
            onTeachBulkSelect={(segs, punches, add) => { 
                if (add) { 
                    editor.setSelectedSegmentIds(prev => Array.from(new Set([...prev, ...segs]))); 
                    editor.setSelectedTeachPunchIds(prev => Array.from(new Set([...prev, ...punches]))); 
                } else { 
                    editor.setSelectedSegmentIds(segs); 
                    editor.setSelectedTeachPunchIds(punches); 
                }
            }}
            onTeachModeToggle={(val) => { editor.setTeachMode(val); editor.setSelectedSegmentIds([]); editor.setSelectedTeachPunchIds([]); }}
            onSaveTeachCycle={handlers.onSaveTeachCycle}
            onDeleteTeachCycle={(id) => persistence.setTeachCycles(prev => prev.filter(c => c.id !== id))}
            onDeletePunch={(ids) => editor.setActivePart(p => p ? {...p, punches: p.punches.filter(px => !(Array.isArray(ids) ? ids.includes(px.id) : px.id === ids))} : null)}
            onUpdatePunch={(id, u) => editor.setActivePart(p => p ? {...p, punches: p.punches.map(px => px.id === id ? {...px, ...u} : px)} : null)}
            onSavePartAsScript={() => { const code = generateParametricScript(editor.activePart!, persistence.tools); persistence.setScripts(s => [...s, {id: generateId(), name: editor.activePart!.name, code, defaultWidth: editor.activePart!.faceWidth, defaultHeight: editor.activePart!.faceHeight, updatedAt: Date.now()}]); editor.setActivePart(null); ui.addToast("Скрипт сохранен", "success"); }}
            onSavePartAsStatic={() => { const name = generatePartNameFromProfile(getPartBaseName(editor.activePart!.name), editor.activePart!.profile, editor.activePart!.faceWidth, editor.activePart!.faceHeight); persistence.setParts(prev => [...prev.filter(x=>x.id!==editor.activePart!.id), {...editor.activePart!, name}]); editor.setActivePart(null); ui.addToast(`Деталь ${name} сохранена`, "success"); }}
            onRunNesting={handlers.handleRunNesting}
            onClearNest={() => app.confirmation.confirm("Сброс", "Очистить раскрой?", () => { persistence.setNests(n => n.map(x => x.id === nesting.activeNestId ? {...x, sheets: []} : x)); nesting.setSelectedNestPartId(null); nesting.setActiveSheetIndex(0); })}
            onMoveNestPart={(id, dx, dy) => { 
                const newSheets = [...derived.activeNest!.sheets]; 
                newSheets[nesting.activeSheetIndex] = {...derived.currentNestSheet!, placedParts: derived.currentNestSheet!.placedParts.map(p => p.id === id ? {...p, x: p.x+dx, y: p.y+dy} : p)};
                persistence.setNests(n => n.map(x => x.id === nesting.activeNestId ? {...x, sheets: newSheets} : x));
            }}
            onRotateNestPart={(id) => {
                const newSheets = [...derived.activeNest!.sheets];
                newSheets[nesting.activeSheetIndex] = { ...derived.currentNestSheet!, placedParts: derived.currentNestSheet!.placedParts.map(pp => {
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
            onClosePart={() => app.confirmation.confirm("Закрыть?", "Изменения будут потеряны.", () => editor.setActivePart(null))}
            onSelectNestPart={nesting.setSelectedNestPartId}
            onLoadPartFromLibrary={(p) => { editor.setActivePart(p); app.setMode(AppMode.PartEditor); }}
            onDeletePartFromLibrary={(id) => app.confirmation.confirm("Удаление", "Удалить деталь?", () => { persistence.setParts(p => p.filter(x => x.id !== id)); persistence.setNests(n => n.map(x => ({...x, scheduledParts: x.scheduledParts.filter(s => s.partId !== id)}))); })}
            onUpdatePartInLibrary={(p) => { persistence.setParts(prev => prev.map(px => px.id === p.id ? p : px)); ui.addToast("Обновлено", "success"); }}
            onSaveScript={(s) => { persistence.setScripts(prev => prev.map(sx => sx.id === s.id ? s : sx)); ui.addToast("Обновлено", "success"); }}
            onDeleteScript={(id) => app.confirmation.confirm("Удаление", "Удалить скрипт?", () => persistence.setScripts(prev => prev.filter(s => s.id !== id)))}
            onCreatePartFromScript={(p) => { persistence.setParts(prev => [...prev, p]); ui.addToast("Создано", "success"); }}
            onBatchProcess={(pNew, spNew) => { 
                persistence.setParts(prev => [...prev, ...pNew.filter(pn => !prev.some(px => px.id === pn.id))]);
                if (nesting.activeNestId) { persistence.setNests(prev => prev.map(n => n.id === nesting.activeNestId ? { ...n, scheduledParts: [...n.scheduledParts, ...spNew] } : n)); }
            }}
            onSaveTool={(t) => { persistence.setTools(prev => prev.some(px => px.id === t.id) ? prev.map(px => px.id === t.id ? t : px) : [...prev, t]); ui.addToast("Сохранено", "success"); }}
            onDeleteTool={(id) => app.confirmation.confirm("Удаление", "Удалить инструмент?", () => persistence.setTools(prev => prev.filter(t => t.id !== id)))}
            onUpdateMachineSettings={persistence.setMachineSettings}
            onUpdateTurretTools={persistence.setTools}
            onUpdateTurretLayouts={persistence.setTurretLayouts}
            
            // UI States
            ui={{
                ...ui,
                downloadGCode: handlers.downloadGCode,
                openAutoPunchSettings: () => ui.setShowAutoPunchSettingsModal(true),
                onAutoPunchApply: handlers.onAutoPunchApply
            }}
            confirmation={{ state: app.confirmation.state, close: app.confirmation.close }}
            panZoom={{ ...app.panZoom, handlers: app.panZoom.panZoomHandlers }}
            manualPunchState={{ step: editor.manualPunch.punchCreationStep, points: editor.manualPunch.punchCreationPoints }}
            setActiveSheetIndex={nesting.setActiveSheetIndex}
            // FIX: Removed duplicate manualPunchMode prop (previously here)
            setManualPunchMode={editor.setManualPunchMode}
            setSelectedToolId={editor.setSelectedToolId}
            setSelectedPunchId={editor.setSelectedPunchId}
            setPunchOrientation={editor.setPunchOrientation}
            setSnapMode={editor.setSnapMode}
            setPunchOffset={editor.setPunchOffset}
            setNibbleSettings={editor.setNibbleSettings}
            setDestructSettings={editor.setDestructSettings}
        />
    );
};

export default App;
