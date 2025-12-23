
/**
 * ОТВЕТСТВЕННОСТЬ: Состояние модальных окон и система уведомлений (тостов).
 * ДОЛЖЕН СОДЕРЖАТЬ: Состояния видимости модалок, текст G-кода, массив тостов.
 * НЕ ДОЛЖЕН СОДЕРЖАТЬ: Бизнес-логику генерации контента.
 */
import { useState } from 'react';
import { ToastMessage } from '../types';
import { generateId } from '../utils/helpers';

export const useUIState = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [showGCodeModal, setShowGCodeModal] = useState(false);
    const [showOptimizerModal, setShowOptimizerModal] = useState(false);
    const [showAutoPunchSettingsModal, setShowAutoPunchSettingsModal] = useState(false);
    const [showTeachSaveModal, setShowTeachSaveModal] = useState(false);
    const [isGeneratingGCode, setIsGeneratingGCode] = useState(false);
    const [generatedGCode, setGeneratedGCode] = useState('');

    const addToast = (message: string, type: ToastMessage['type']) => {
        setToasts(prev => [...prev, { id: generateId(), message, type }]);
    };
    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return {
        toasts, addToast, removeToast,
        showGCodeModal, setShowGCodeModal,
        showOptimizerModal, setShowOptimizerModal,
        showAutoPunchSettingsModal, setShowAutoPunchSettingsModal,
        showTeachSaveModal, setShowTeachSaveModal,
        isGeneratingGCode, setIsGeneratingGCode,
        generatedGCode, setGeneratedGCode
    };
};
