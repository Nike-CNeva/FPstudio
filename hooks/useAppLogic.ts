
/**
 * ОТВЕТСТВЕННОСТЬ: Главный мозг приложения. 
 * Объединяет все специализированные хуки и определяет высокоуровневые функции (handlers).
 * ПРЕИМУЩЕСТВО: App.tsx становится чистым, а логика — типизированной и изолированной.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    AppMode, Point, Tool, Part, PlacedTool, ScheduledPart, 
    OptimizerSettings, PunchOp, TurretLayout, NestLayout, AutoPunchSettings
} from '../types';
import { useAppPersistence } from './useAppPersistence';
import { useEditorState, UseEditorStateResult } from './useEditorState';
import { useNestingState } from './useNestingState';
import { useSimulationState } from './useSimulationState';
import { useUIState } from './useUIState';
import { usePanAndZoom } from './usePanAndZoom';
import { useConfirmation } from './useConfirmation';
import { useFileImport } from './useFileImport';

// Services
import { nestingGenerator } from '../services/nesting';
import { generateGCode, calculateOptimizedPath } from '../services/gcode';
import { findClosestSegment } from '../services/geometry';
import { createTeachCycleFromSelection } from '../services/teachLogic';
import { generateContourPunches } from '../services/punching';
import { generateId } from '../utils/helpers';

export interface UseAppLogicResult {
    mode: AppMode;
    setMode: React.Dispatch<React.SetStateAction<AppMode>>;
    persistence: ReturnType<typeof useAppPersistence>;
    ui: ReturnType<typeof useUIState>;
    editor: UseEditorStateResult;
    nesting: ReturnType<typeof useNestingState>;
    simulation: ReturnType<typeof useSimulationState>;
    confirmation: {
        state: ReturnType<typeof useConfirmation>['confirmationState'];
        confirm: ReturnType<typeof useConfirmation>['confirm'];
        close: ReturnType<typeof useConfirmation>['closeConfirmation'];
    };
    panZoom: ReturnType<typeof usePanAndZoom>;
    handlers: {
        onRunOptimization: (finalSettings: OptimizerSettings) => void;
        handleRunNesting: () => Promise<void>;
        handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
        downloadGCode: () => void;
        onGenerateGCodeRequest: () => void;
        onOptimizePathRequest: () => void;
        onClearAllPunches: () => void;
        onAutoPunchApply: (settings: AutoPunchSettings) => void;
        onSaveTeachCycle: (name: string, symmetry: any) => void;
    };
    derived: {
        activeNest: NestLayout | null;
        currentNestSheet: import('../types').NestResultSheet | null;
    };
}

/**
 * **useAppLogic**
 * 
 * The central aggregation hook ("The Brain") for the entire CAD/CAM application.
 * It follows the "Container/Presenter" pattern where this hook acts as the Container logic
 * for the root `App` component.
 * 
 * **Responsibilities:**
 * 1.  Aggregates sub-hooks (`persistence`, `editor`, `nesting`, `ui`, `simulation`).
 * 2.  Manages high-level `AppMode` switching.
 * 3.  Defines complex event handlers that cross domain boundaries (e.g., File Upload affecting Editor, Nesting affecting Simulation).
 * 4.  Calculates derived state used by multiple child components.
 * 
 * **Usage:**
 * ```tsx
 * const App = () => {
 *   const logic = useAppLogic();
 *   return <AppUI {...logic} />;
 * }
 * ```
 * 
 * @returns {UseAppLogicResult} An object containing all state selectors and action dispatchers required by the UI.
 */
export const useAppLogic = (): UseAppLogicResult => {
    const [mode, setMode] = useState<AppMode>(AppMode.PartEditor);
    
    // --- 1. Состояние данных (Persistence) ---
    const persistence = useAppPersistence();
    
    // --- 2. Состояние интерфейса ---
    const ui = useUIState();
    const { confirmationState, confirm, closeConfirmation } = useConfirmation();
    
    // --- 3. Состояние редактора ---
    const editor = useEditorState({ 
        tools: persistence.tools, 
        onAddPunches: (data) => {
            // Note: We use a callback pattern here to ensure we work with the latest state
            // inside the editor hook's own state management if possible, but here we perform the logic
            editor.setActivePart(currentPart => {
                if (currentPart) {
                    const newPunches = data.map(p => ({ ...p, id: generateId() }));
                    return { ...currentPart, punches: [...currentPart.punches, ...newPunches] };
                }
                return null;
            });
        }
    });

    // --- 4. Состояние раскроя ---
    const nesting = useNestingState(persistence.nests[0]?.id || null);
    const activeNest = useMemo(() => persistence.nests.find(n => n.id === nesting.activeNestId) || null, [persistence.nests, nesting.activeNestId]);
    const currentNestSheet = useMemo(() => activeNest?.sheets[nesting.activeSheetIndex] || null, [activeNest, nesting.activeSheetIndex]);

    // --- 5. Состояние симуляции ---
    const simulation = useSimulationState();

    // --- 6. Импорт файлов ---
    const { handleFileUpload } = useFileImport({ 
        tools: persistence.tools, setMode, setActivePart: editor.setActivePart, addToast: ui.addToast 
    });

    // --- 7. Навигация и Pan/Zoom ---
    const handleCanvasClickProxy = useCallback((rawPoint: Point) => {
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
    }, [mode, editor.activePart, editor.teachMode, editor.activePartProcessedGeometry, editor.selectedPunchId, editor.manualPunch]);

    const panZoom = usePanAndZoom({ x: 0, y: 0, width: 100, height: 100 }, { onClick: handleCanvasClickProxy });

    // --- Side Effects ---
    useEffect(() => {
        simulation.setOptimizedOperations(null);
        simulation.setSimulationStep(0);
        simulation.setIsSimulating(false);
    }, [nesting.activeNestId, nesting.activeSheetIndex, currentNestSheet]);

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

    // --- Business Handlers ---
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
        } catch(e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            ui.addToast("Ошибка раскроя: " + errorMsg, "error");
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

    return {
        mode, setMode,
        persistence,
        ui,
        editor,
        nesting,
        simulation,
        confirmation: { state: confirmationState, confirm, close: closeConfirmation },
        panZoom,
        handlers: {
            onRunOptimization,
            handleRunNesting,
            handleFileUpload,
            downloadGCode,
            onGenerateGCodeRequest: () => { if(!currentNestSheet) { ui.addToast("Нет листа", "error"); return; } ui.setIsGeneratingGCode(true); ui.setShowOptimizerModal(true); },
            onOptimizePathRequest: () => { if(!currentNestSheet) { ui.addToast("Нет листа", "error"); return; } ui.setIsGeneratingGCode(false); ui.setShowOptimizerModal(true); },
            onClearAllPunches: () => confirm("Очистка", "Удалить все инструменты?", () => { editor.setActivePart(p => p ? {...p, punches: []} : null); ui.addToast("Инструменты удалены", "info"); }),
            onAutoPunchApply: (s: AutoPunchSettings) => { 
                const p = generateContourPunches(editor.activePart!.geometry, persistence.tools, s, persistence.turretLayouts, persistence.teachCycles); 
                if (editor.activePart) { 
                    const newPunches = p.map(px => ({...px, id: generateId()})); 
                    editor.setActivePart(prev => prev ? {...prev, punches: [...prev.punches, ...newPunches]} : null); 
                } 
                ui.setShowAutoPunchSettingsModal(false); 
                ui.addToast(`Сгенерировано: ${p.length}`, "success"); 
            },
            onSaveTeachCycle: (name: string, symmetry: any) => {
                const cycle = createTeachCycleFromSelection(name, symmetry, editor.selectedSegmentIds, editor.selectedTeachPunchIds, editor.activePart!, editor.activePartProcessedGeometry!);
                if (cycle) { persistence.setTeachCycles(prev => [...prev, cycle]); editor.setTeachMode(false); }
                ui.setShowTeachSaveModal(false);
            }
        },
        derived: {
            activeNest,
            currentNestSheet
        }
    };
};
