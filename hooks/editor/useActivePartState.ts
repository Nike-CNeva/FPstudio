
/**
 * ОТВЕТСТВЕННОСТЬ: Хранение объекта активной детали и расчет её топологии.
 */
import { useState, useMemo } from 'react';
import { Part } from '../../types';
import { getGeometryFromEntities } from '../../services/geometry';

export const useActivePartState = () => {
    const [activePart, setActivePart] = useState<Part | null>(null);

    const activePartProcessedGeometry = useMemo(() => 
        activePart ? getGeometryFromEntities(activePart) : null, 
        [activePart]
    );

    return {
        activePart,
        setActivePart,
        activePartProcessedGeometry
    };
};
