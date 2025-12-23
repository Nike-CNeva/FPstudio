
/**
 * ОТВЕТСТВЕННОСТЬ: Сборка трехпанельного интерфейса (Свойства - Чертеж - Инструменты).
 */
import React from 'react';
import { Sidebar } from '../Sidebar';
import { CanvasArea } from '../CanvasArea';
import { RightPanel } from '../RightPanel';
import { AppMode } from '../../types';

interface MainWorkspaceProps {
    mode: AppMode;
    // Sidebar props (proxy)
    sidebarProps: any;
    // Canvas props (proxy)
    canvasProps: any;
    // Right panel props (proxy)
    rightPanelProps: any;
    activeSheetIndex: number;
    setActiveSheetIndex: (i: number) => void;
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = (props) => {
    return (
        <>
            <Sidebar {...props.sidebarProps} />
            <CanvasArea {...props.canvasProps} />
            <RightPanel 
                {...props.rightPanelProps} 
                isNestingMode={props.mode === AppMode.Nesting}
                activeSheetIndex={props.activeSheetIndex}
                setActiveSheetIndex={props.setActiveSheetIndex}
            />
        </>
    );
};
