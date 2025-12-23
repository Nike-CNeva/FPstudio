
/**
 * ОТВЕТСТВЕННОСТЬ: Управление формой свойств детали.
 * ЛОГИКА: Пересчет габаритов Length/Width на основе типов профилей (L, U) и их ориентации.
 */
import { useState, useEffect } from 'react';
import { Part, PartProfile } from '../../types';

export const usePartProperties = (part: Part, onUpdate: (updates: Partial<Part>) => void) => {
    const [profileType, setProfileType] = useState<PartProfile['type']>(part.profile?.type || 'flat');
    const [orientation, setOrientation] = useState<PartProfile['orientation']>(part.profile?.orientation || 'vertical');
    const [dims, setDims] = useState(part.profile?.dims || { a: part.faceWidth, b: 0, c: 0 });

    useEffect(() => {
        setProfileType(part.profile?.type || 'flat');
        setOrientation(part.profile?.orientation || 'vertical');
        setDims(part.profile?.dims || { a: part.faceWidth, b: 0, c: 0 });
    }, [part.id, part.profile]);

    const handleDimChange = (key: keyof PartProfile['dims'], val: number) => {
        const newDims = { ...dims, [key]: val };
        setDims(newDims);
        
        let totalW = part.faceWidth;
        let totalH = part.faceHeight;

        if (orientation === 'vertical') {
            if (profileType === 'L') totalW = newDims.a + newDims.b;
            else if (profileType === 'U') totalW = newDims.a + newDims.b + newDims.c;
            else totalW = newDims.a;
        } else {
            if (profileType === 'L') totalH = newDims.a + newDims.b;
            else if (profileType === 'U') totalH = newDims.a + newDims.b + newDims.c;
        }

        onUpdate({ 
            profile: { type: profileType, orientation: orientation, dims: newDims },
            faceWidth: totalW,
            faceHeight: totalH
        });
    };

    const getLabel = (key: 'a'|'b'|'c') => {
        if (orientation === 'vertical') {
            if (profileType === 'L') return key === 'a' ? 'Ширина левая (A)' : 'Ширина правая (B)';
            if (profileType === 'U') return key === 'a' ? 'Ширина левая (A)' : key === 'b' ? 'Центральная ширина (B)' : 'Ширина правая (C)';
        } else {
            if (profileType === 'L') return key === 'a' ? 'Высота верхняя (A)' : 'Высота нижняя (B)';
            if (profileType === 'U') return key === 'a' ? 'Высота верхняя (A)' : key === 'b' ? 'Центральная высота (B)' : 'Высота нижняя (C)';
        }
        return key.toUpperCase();
    };

    return {
        profileType,
        orientation,
        dims,
        handleDimChange,
        getLabel
    };
};
