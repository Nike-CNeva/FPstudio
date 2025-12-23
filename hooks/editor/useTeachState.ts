
/**
 * ОТВЕТСТВЕННОСТЬ: Режим записи циклов и выделение геометрии/ударов.
 */
import { useState } from 'react';

export const useTeachState = () => {
    const [teachMode, setTeachMode] = useState(false);
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
    const [selectedTeachPunchIds, setSelectedTeachPunchIds] = useState<string[]>([]);

    return {
        teachMode, setTeachMode,
        selectedSegmentIds, setSelectedSegmentIds,
        selectedTeachPunchIds, setSelectedTeachPunchIds
    };
};
