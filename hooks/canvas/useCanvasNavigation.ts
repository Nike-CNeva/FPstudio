
/**
 * ОТВЕТСТВЕННОСТЬ: Кнопки навигации (Zoom In, Zoom Out, Fit).
 * Расчет целевых ViewBox на основе геометрии деталей или листов.
 */
import { AppMode, Part, NestLayout, NestResultSheet } from '../../types';
import { ViewBox } from '../usePanAndZoom';

interface UseCanvasNavigationProps {
    mode: AppMode;
    activePart: Part | null;
    activeNest: NestLayout | null;
    currentNestSheet: NestResultSheet | null | undefined;
    setViewBox: (v: ViewBox | ((prev: ViewBox) => ViewBox)) => void;
}

export const useCanvasNavigation = ({
    mode, activePart, activeNest, currentNestSheet, setViewBox
}: UseCanvasNavigationProps) => {

    const handleZoomIn = () => {
        setViewBox(prev => ({
            x: prev.x + prev.width * 0.1, 
            y: prev.y + prev.height * 0.1,
            width: prev.width * 0.8, 
            height: prev.height * 0.8
        }));
    };

    const handleZoomOut = () => {
        setViewBox(prev => ({
            x: prev.x - prev.width * 0.1, 
            y: prev.y - prev.height * 0.1,
            width: prev.width * 1.2, 
            height: prev.height * 1.2
        }));
    };

    const handleFit = () => {
        if (mode === AppMode.PartEditor && activePart) {
             setViewBox({
                x: -5,
                y: -activePart.geometry.height - 5,
                width: activePart.geometry.width + 10,
                height: activePart.geometry.height + 10
            });
        } else if (mode === AppMode.Nesting && activeNest) {
             let width = 2500;
             let height = 1250;
             if (currentNestSheet) {
                 width = currentNestSheet.width;
                 height = currentNestSheet.height;
             } else {
                 const stock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0];
                 if(stock) { width = stock.width; height = stock.height; }
             }
             setViewBox({ x: -50, y: -height - 50, width: width + 100, height: height + 100 });
        }
    };

    return { handleZoomIn, handleZoomOut, handleFit };
};
