
/**
 * ОТВЕТСТВЕННОСТЬ: Настройки физического станка, раскладки револьвера и параметров G-кода.
 */
import { useLocalStorage } from '../useLocalStorage';
import { TurretLayout, MachineSettings, OptimizerSettings } from '../../types';
import { initialTurretLayouts, defaultMachineSettings, defaultOptimizerSettings } from '../../data/initialData';

export const useMachinePersistence = () => {
    const [turretLayouts, setTurretLayouts] = useLocalStorage<TurretLayout[]>('fp_turret_layouts', initialTurretLayouts);
    const [machineSettings, setMachineSettings] = useLocalStorage<MachineSettings>('fp_machine_settings', defaultMachineSettings);
    const [optimizerSettings, setOptimizerSettings] = useLocalStorage<OptimizerSettings>('fp_optimizer_settings', defaultOptimizerSettings);

    return {
        turretLayouts, setTurretLayouts,
        machineSettings, setMachineSettings,
        optimizerSettings, setOptimizerSettings
    };
};
