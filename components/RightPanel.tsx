
import React from 'react';
import { NestLayout, Part, Tool, PunchOp } from '../types';
import { EditorPanel } from './right-panel/EditorPanel';
import { NestingPanel } from './right-panel/NestingPanel';
import { SimulationPanel } from './right-panel/SimulationPanel';

interface RightPanelProps {
    tools: Tool[];
    selectedToolId: string | null;
    setSelectedToolId: (id: string | null) => void;
    onOpenTurretView: () => void;
    
    isNestingMode: boolean;
    activeNest: NestLayout | null;
    activeSheetIndex: number;
    setActiveSheetIndex: (index: number) => void;
    allParts: Part[];
    
    simulationStep: number;
    totalSimulationSteps: number;
    isSimulating: boolean;
    simulationSpeed: number;
    onToggleSimulation: () => void;
    onStopSimulation: () => void;
    onStepChange: (step: number) => void;
    onSpeedChange: (speed: number) => void;
    optimizedOperations: PunchOp[] | null;
}

export const RightPanel: React.FC<RightPanelProps> = (props) => {
    const { isNestingMode, activeNest, activeSheetIndex, setActiveSheetIndex, allParts, optimizedOperations } = props;

    return (
        <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col h-full text-sm shadow-xl">
            {isNestingMode ? (
                <div className="flex flex-col h-full">
                    <div className="p-3 bg-gray-900 border-b border-gray-700">
                        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide">Отчет Раскроя</h3>
                    </div>
                    
                    <NestingPanel 
                        activeNest={activeNest}
                        activeSheetIndex={activeSheetIndex}
                        setActiveSheetIndex={setActiveSheetIndex}
                        allParts={allParts}
                    />

                    {optimizedOperations && (
                        <SimulationPanel 
                            step={props.simulationStep}
                            total={props.totalSimulationSteps}
                            isSimulating={props.isSimulating}
                            onToggle={props.onToggleSimulation}
                            onStop={props.onStopSimulation}
                            onStepChange={props.onStepChange}
                        />
                    )}
                </div>
            ) : (
                <EditorPanel 
                    tools={props.tools}
                    selectedToolId={props.selectedToolId}
                    setSelectedToolId={props.setSelectedToolId}
                    onOpenTurretView={props.onOpenTurretView}
                />
            )}
        </aside>
    );
};
