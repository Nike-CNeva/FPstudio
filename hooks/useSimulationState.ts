
/**
 * ОТВЕТСТВЕННОСТЬ: Управление проигрыванием симуляции и хранение оптимизированных операций.
 * ДОЛЖЕН СОДЕРЖАТЬ: optimizedOperations, simulationStep, isSimulating, таймер симуляции.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: JSX или персистентные настройки оптимизатора.
 */
import { useState, useEffect, useRef } from 'react';
import { PunchOp } from '../types';

export const useSimulationState = () => {
    const [optimizedOperations, setOptimizedOperations] = useState<PunchOp[] | null>(null);
    const [simulationStep, setSimulationStep] = useState<number>(0);
    const [isSimulating, setIsSimulating] = useState<boolean>(false);
    const [simulationSpeed, setSimulationSpeed] = useState<number>(50);
    const simulationInterval = useRef<number | null>(null);

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

    const stopSimulation = () => { 
        setIsSimulating(false); 
        setSimulationStep(0); 
    };

    const stepSimulation = (val: number) => {
        setIsSimulating(false);
        if (optimizedOperations) {
            setSimulationStep(Math.max(0, Math.min(val, optimizedOperations.length - 1)));
        }
    };

    return {
        optimizedOperations, setOptimizedOperations,
        simulationStep, setSimulationStep,
        isSimulating, setIsSimulating,
        simulationSpeed, setSimulationSpeed,
        stopSimulation, stepSimulation
    };
};
