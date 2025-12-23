
/**
 * СЕРВИС ХРАНЕНИЯ (Агрегатор)
 * Объединяет тематические хуки персистентности.
 * Сохраняет интерфейс для useAppLogic без необходимости его переписывания.
 */
import { useLibraryPersistence } from './persistence/useLibraryPersistence';
import { useNestingPersistence } from './persistence/useNestingPersistence';
import { useMachinePersistence } from './persistence/useMachinePersistence';

export const useAppPersistence = () => {
    const library = useLibraryPersistence();
    const nesting = useNestingPersistence();
    const machine = useMachinePersistence();

    return {
        // Library
        tools: library.tools,
        setTools: library.setTools,
        parts: library.parts,
        setParts: library.setParts,
        scripts: library.scripts,
        setScripts: library.setScripts,
        teachCycles: library.teachCycles,
        setTeachCycles: library.setTeachCycles,

        // Nesting
        nests: nesting.nests,
        setNests: nesting.setNests,

        // Machine & Post-processor
        turretLayouts: machine.turretLayouts,
        setTurretLayouts: machine.setTurretLayouts,
        machineSettings: machine.machineSettings,
        setMachineSettings: machine.setMachineSettings,
        optimizerSettings: machine.optimizerSettings,
        setOptimizerSettings: machine.setOptimizerSettings
    };
};
