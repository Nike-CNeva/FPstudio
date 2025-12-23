
/**
 * ОТВЕТСТВЕННОСТЬ: Персистентное хранение результатов и настроек раскроя (Nesting).
 */
import { useLocalStorage } from '../useLocalStorage';
import { NestLayout } from '../../types';
import { initialNests } from '../../data/initialData';

export const useNestingPersistence = () => {
    const [nests, setNests] = useLocalStorage<NestLayout[]>('fp_nests', initialNests);

    return {
        nests, setNests
    };
};
