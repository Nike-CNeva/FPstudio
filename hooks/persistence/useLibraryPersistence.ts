
/**
 * ОТВЕТСТВЕННОСТЬ: Персистентное хранение основных элементов производства.
 */
import { useEffect } from 'react';
import { useLocalStorage } from '../useLocalStorage';
import { Tool, Part, ParametricScript, TeachCycle } from '../../types';
import { initialTools, initialParts, initialScripts, migrateLegacyTriangleTool } from '../../data/initialData';

export const useLibraryPersistence = () => {
    const [storedTools, setTools] = useLocalStorage<Tool[]>('fp_tools', initialTools);
    const tools = storedTools.map(migrateLegacyTriangleTool);

    useEffect(() => {
        if (tools.some((tool, index) => tool !== storedTools[index])) {
            setTools(tools);
        }
    }, [storedTools]);
    const [parts, setParts] = useLocalStorage<Part[]>('fp_parts', initialParts);
    const [scripts, setScripts] = useLocalStorage<ParametricScript[]>('fp_scripts', initialScripts);
    const [teachCycles, setTeachCycles] = useLocalStorage<TeachCycle[]>('fp_teach_cycles', []);

    return {
        tools, setTools,
        parts, setParts,
        scripts, setScripts,
        teachCycles, setTeachCycles
    };
};
