
/**
 * ОТВЕТСТВЕННОСТЬ: Отрисовка всех всплывающих окон приложения.
 */
import React from 'react';
import { AutoPunchSettingsModal } from '../AutoPunchSettingsModal';
import { GCodeModal } from '../GCodeModal';
import { OptimizerSettingsModal } from '../OptimizerSettingsModal';
import { TeachCycleSaveModal } from '../TeachCycleSaveModal';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ToastContainer } from '../common/Toast';

interface ModalRegistryProps {
    ui: any;
    confirmation: any;
    data: any;
    handlers: any;
    activeNest: any;
    activeSheetIndex: number;
}

export const ModalRegistry: React.FC<ModalRegistryProps> = ({ ui, confirmation, data, handlers, activeNest, activeSheetIndex }) => {
    return (
        <>
            {ui.showAutoPunchSettingsModal && (
                <AutoPunchSettingsModal 
                    onClose={() => ui.setShowAutoPunchSettingsModal(false)}
                    onApply={ui.onAutoPunchApply}
                    turretLayouts={data.turretLayouts}
                />
            )}
            
            {ui.showTeachSaveModal && (
                <TeachCycleSaveModal 
                    onClose={() => ui.setShowTeachSaveModal(false)} 
                    onSave={handlers.onSaveTeachCycle} 
                />
            )}
            
            {ui.showOptimizerModal && (
                <OptimizerSettingsModal
                    initialSettings={data.optimizerSettings}
                    onClose={() => ui.setShowOptimizerModal(false)}
                    onGenerate={handlers.onRunOptimization}
                />
            )}

            {ui.showGCodeModal && (
                <GCodeModal 
                    gcode={ui.generatedGCode} 
                    onClose={() => ui.setShowGCodeModal(false)} 
                    onDownload={ui.downloadGCode}
                    sheet={activeNest?.sheets[activeSheetIndex] || undefined}
                    parts={data.parts}
                    tools={data.tools}
                    clampPositions={activeNest?.settings.clampPositions}
                    scheduledParts={activeNest?.scheduledParts}
                    nestName={activeNest?.workOrder ? `${activeNest.workOrder}_${activeSheetIndex + 1}.nc` : `Program_${activeSheetIndex + 1}.nc`}
                    allSheets={activeNest?.sheets}
                />
            )}
            
            <ToastContainer toasts={ui.toasts} removeToast={ui.removeToast} />
            <ConfirmationModal state={confirmation.state} onCancel={confirmation.close} />
        </>
    );
};
