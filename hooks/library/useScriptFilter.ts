
/**
 * ОТВЕТСТВЕННОСТЬ: Логика поиска по названию скрипта.
 */
import { useState, useMemo } from 'react';
import { ParametricScript } from '../../types';

export const useScriptFilter = (scripts: ParametricScript[]) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredScripts = useMemo(() => {
        return scripts.filter(s => 
            s.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [scripts, searchQuery]);

    return { searchQuery, setSearchQuery, filteredScripts };
};
