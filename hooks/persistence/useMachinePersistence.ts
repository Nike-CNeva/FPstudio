
/**
 * ОТВЕТСТВЕННОСТЬ: Настройки физического станка, раскладки револьвера и параметров G-кода.
 */
import { useEffect, useMemo } from 'react';
import { useLocalStorage } from '../useLocalStorage';
import { TurretLayout, MachineSettings, OptimizerSettings } from '../../types';
import { initialTurretLayouts, defaultMachineSettings, defaultOptimizerSettings, migrateLegacyTriangleTool } from '../../data/initialData';

export const useMachinePersistence = () => {
    const [storedTurretLayouts, setTurretLayouts] = useLocalStorage<TurretLayout[]>('fp_turret_layouts', initialTurretLayouts);
    const turretLayouts = useMemo(() => storedTurretLayouts.map(layout => ({
        ...layout,
        toolsSnapshot: layout.toolsSnapshot.map(migrateLegacyTriangleTool)
    })), [storedTurretLayouts]);

    useEffect(() => {
        const hasMigration = turretLayouts.some((layout, index) =>
            layout.toolsSnapshot.some((tool, toolIndex) => tool !== storedTurretLayouts[index]?.toolsSnapshot[toolIndex])
        );
        if (hasMigration) setTurretLayouts(turretLayouts);
    }, [storedTurretLayouts]);
    const [machineSettings, setMachineSettings] = useLocalStorage<MachineSettings>('fp_machine_settings', defaultMachineSettings);
    const [optimizerSettings, setOptimizerSettings] = useLocalStorage<OptimizerSettings>('fp_optimizer_settings', defaultOptimizerSettings);

    return {
        turretLayouts, setTurretLayouts,
        machineSettings, setMachineSettings,
        optimizerSettings, setOptimizerSettings
    };
};
