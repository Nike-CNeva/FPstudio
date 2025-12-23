
/**
 * ОТВЕТСТВЕННОСТЬ: Персистентное хранение основных элементов производства.
 */
import { useLocalStorage } from '../useLocalStorage';
import { Tool, Part, ParametricScript, TeachCycle } from '../../types';
import { initialTools, initialParts, initialScripts } from '../../data/initialData';

export const useLibraryPersistence = () => {
    const [tools, setTools] = useLocalStorage<Tool[]>('fp_tools', initialTools);
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
