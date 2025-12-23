
/**
 * ОТВЕТСТВЕННОСТЬ: Корневой компонент настройки револьвера.
 * Собирает визуализацию и боковую панель управления.
 */
import React from 'react';
import { Tool, TurretLayout, StationConfig } from '../types';
import { TurretVisualizer, MtVisualizer } from './common/TurretVisualizer';
import { useTurretLogic } from '../hooks/turret/useTurretLogic';
import { TurretLayoutManager } from './turret/TurretLayoutManager';
import { StationControlPanel } from './turret/StationControlPanel';
import { TurretLibraryPanel } from './turret/TurretLibraryPanel';

interface TurretSetupViewProps {
    tools: Tool[];
    setTools: React.Dispatch<React.SetStateAction<Tool[]>>;
    layouts: TurretLayout[];
    setLayouts: React.Dispatch<React.SetStateAction<TurretLayout[]>>;
}

export const TurretSetupView: React.FC<TurretSetupViewProps> = (props) => {
    const turret = useTurretLogic(props);
    const { 
        currentStations, selectedStationId, isMtView, selectedMtSlotId, 
        toolsOnTurret, availableTools, setIsMtView, setSelectedMtSlotId
    } = turret;

    const selectedStation = currentStations.find(s => s.id === selectedStationId);
    const activeTool = isMtView 
        ? toolsOnTurret.find(t => t.stationNumber === selectedStationId && t.mtIndex === selectedMtSlotId)
        : (selectedStation ? toolsOnTurret.find(t => t.stationNumber === selectedStation.id && !t.mtIndex) : undefined);

    const mtTools = isMtView ? toolsOnTurret.filter(t => t.stationNumber === selectedStationId) : [];

    return (
        <div className="flex h-full w-full bg-gray-100 text-gray-900 font-sans">
            {/* Левая часть: Визуализация (SVG) */}
            <div className="flex-1 relative bg-gray-300 shadow-inner overflow-hidden flex items-center justify-center">
                 {isMtView ? (
                    <div className="w-full h-full flex flex-col relative p-8">
                        <button onClick={() => setIsMtView(false)} className="absolute top-4 left-4 bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded shadow text-sm transition-colors z-10">
                            &larr; Назад к револьверу
                        </button>
                        <MtVisualizer 
                            tools={mtTools}
                            selectedSlotId={selectedMtSlotId}
                            onSlotClick={setSelectedMtSlotId}
                        />
                    </div>
                 ) : (
                    <div className="w-full h-full p-8">
                        <TurretVisualizer 
                            stations={currentStations}
                            tools={toolsOnTurret}
                            selectedStationId={selectedStationId}
                            onStationClick={turret.handleStationClick}
                            mode="setup"
                        />
                    </div>
                 )}
            </div>

            {/* Правая часть: Панель управления */}
            <div className="w-96 bg-gray-800 text-gray-100 flex flex-col border-l border-gray-700 shadow-xl z-10">
                <TurretLayoutManager 
                    layouts={props.layouts}
                    activeLayoutId={turret.activeLayoutId}
                    onLoad={turret.loadLayout}
                    onDelete={turret.deleteLayout}
                    newName={turret.newLayoutName}
                    setNewName={turret.setNewLayoutName}
                    onSave={turret.saveLayout}
                />

                <StationControlPanel 
                    selectedStation={selectedStation}
                    isMtView={isMtView}
                    selectedMtSlotId={selectedMtSlotId}
                    activeTool={activeTool}
                    onUpdateStation={turret.updateStationConfig}
                    onUpdateRotation={turret.updateToolRotation}
                    onUnmount={turret.handleUnmountTool}
                    onOpenMt={() => { setIsMtView(true); setSelectedMtSlotId(1); }}
                />

                <TurretLibraryPanel 
                    tools={availableTools}
                    selectedStation={selectedStation}
                    isMtView={isMtView}
                    selectedMtSlotId={selectedMtSlotId}
                    onMount={turret.handleMountTool}
                />
            </div>
        </div>
    );
};
