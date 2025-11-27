import { useState, useCallback } from 'react';

export interface ConfirmationState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
}

export const useConfirmation = () => {
    const [confirmationState, setConfirmationState] = useState<ConfirmationState>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
    });

    const confirm = useCallback((title: string, message: string, onAction: () => void) => {
        setConfirmationState({
            isOpen: true,
            title,
            message,
            onConfirm: () => {
                onAction();
                setConfirmationState(prev => ({ ...prev, isOpen: false }));
            }
        });
    }, []);

    const closeConfirmation = useCallback(() => {
        setConfirmationState(prev => ({ ...prev, isOpen: false }));
    }, []);

    return {
        confirmationState,
        confirm,
        closeConfirmation
    };
};