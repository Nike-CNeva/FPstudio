
/**
 * ОТВЕТСТВЕННОСТЬ: Управление персистентным состоянием (localStorage).
 * ДОЛЖЕН СОДЕРЖАТЬ: Все вызовы useLocalStorage для инструментов, деталей, настроек и т.д.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: Логику обработки (бизнес-логику) или JSX.
 */
import { useLocalStorage } from './useLocalStorage';
import { Tool, Part, ParametricScript, NestLayout, TurretLayout, MachineSettings, OptimizerSettings, TeachCycle } from '../types';
import { initialTools, initialParts, initialNests, initialTurretLayouts, initialScripts, defaultMachineSettings, defaultOptimizerSettings } from '../data/initialData';

export const useAppPersistence = () => {
    const [tools, setTools] = useLocalStorage<Tool[]>('fp_tools', initialTools);
    const [parts, setParts] = useLocalStorage<Part[]>('fp_parts', initialParts);
    const [scripts, setScripts] = useLocalStorage<ParametricScript[]>('fp_scripts', initialScripts);
    const [nests, setNests] = useLocalStorage<NestLayout[]>('fp_nests', initialNests);
    const [turretLayouts, setTurretLayouts] = useLocalStorage<TurretLayout[]>('fp_turret_layouts', initialTurretLayouts);
    const [machineSettings, setMachineSettings] = useLocalStorage<MachineSettings>('fp_machine_settings', defaultMachineSettings);
    const [optimizerSettings, setOptimizerSettings] = useLocalStorage<OptimizerSettings>('fp_optimizer_settings', defaultOptimizerSettings);
    const [teachCycles, setTeachCycles] = useLocalStorage<TeachCycle[]>('fp_teach_cycles', []);

    return {
        tools, setTools,
        parts, setParts,
        scripts, setScripts,
        nests, setNests,
        turretLayouts, setTurretLayouts,
        machineSettings, setMachineSettings,
        optimizerSettings, setOptimizerSettings,
        teachCycles, setTeachCycles
    };
};
