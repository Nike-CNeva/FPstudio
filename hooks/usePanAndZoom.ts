

import { useState, useCallback, useRef, MouseEvent, WheelEvent } from 'react';

export interface ViewBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const usePanAndZoom = (
    initialViewBox: ViewBox,
    options?: { onClick?: (point: { x: number; y: number }) => void }
) => {
    const [viewBox, setViewBox] = useState<ViewBox>(initialViewBox);
    const [isDragging, setIsDragging] = useState(false);
    
    const svgRef = useRef<SVGSVGElement>(null);
    const isDown = useRef(false);
    const startDragPoint = useRef({ x: 0, y: 0 });
    const lastDragPoint = useRef({ x: 0, y: 0 });


    const getPointFromEvent = useCallback((event: MouseEvent<SVGSVGElement> | WheelEvent<SVGSVGElement>) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const svg = svgRef.current;
        const CTM = svg.getScreenCTM();
        if (!CTM) return { x: 0, y: 0 };
        return {
            x: (event.clientX - CTM.e) / CTM.a,
            y: (event.clientY - CTM.f) / CTM.d
        };
    }, []);

    const onWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
        event.preventDefault();
        const point = getPointFromEvent(event);
        const scale = event.deltaY < 0 ? 0.9 : 1.1;

        setViewBox(prev => {
            const newWidth = prev.width * scale;
            const newHeight = prev.height * scale;
            const newX = point.x - (point.x - prev.x) * scale;
            const newY = point.y - (point.y - prev.y) * scale;
            return { x: newX, y: newY, width: newWidth, height: newHeight };
        });
    }, [getPointFromEvent]);

    const onMouseDown = useCallback((event: MouseEvent<SVGSVGElement>) => {
        if (event.button !== 0) return; // Only main button
        isDown.current = true;
        setIsDragging(false);
        startDragPoint.current = { x: event.clientX, y: event.clientY };
        lastDragPoint.current = { x: event.clientX, y: event.clientY };
    }, []);

    const onMouseMove = useCallback((event: MouseEvent<SVGSVGElement>) => {
        if (!isDown.current) return;
        event.preventDefault();
        
        const dx = event.clientX - startDragPoint.current.x;
        const dy = event.clientY - startDragPoint.current.y;

        if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            setIsDragging(true);
        }
        
        if (isDragging) {
            const CTM = svgRef.current?.getScreenCTM();
            if (!CTM) return;
            
            const panX = (event.clientX - lastDragPoint.current.x) / CTM.a;
            const panY = (event.clientY - lastDragPoint.current.y) / CTM.d;

            setViewBox(prev => ({ ...prev, x: prev.x - panX, y: prev.y - panY }));
            lastDragPoint.current = { x: event.clientX, y: event.clientY };
        }
    }, [isDragging]);
    
    const onMouseUp = useCallback((event: MouseEvent<SVGSVGElement>) => {
        // A click is registered if the mouse was pressed down in the SVG area
        // and released without significant dragging. This is more reliable than
        // checking the event target, ensuring clicks on part geometry trigger placement.
        if (!isDragging && isDown.current) {
            // Child elements with their own specific interactions (like placed punches) must use
            // e.stopPropagation() in their onClick handlers to prevent this generic handler from firing.
            if (options?.onClick) {
                const point = getPointFromEvent(event);
                options.onClick(point);
            }
        }
        isDown.current = false;
        setIsDragging(false);
    }, [isDragging, options, getPointFromEvent]);

    const onMouseLeave = useCallback(() => {
        isDown.current = false;
        setIsDragging(false);
    }, []);

    return {
        svgRef,
        viewBox,
        setViewBox,
        isDragging,
        getPointFromEvent,
        panZoomHandlers: {
            onWheel,
            onMouseDown,
            onMouseMove,
            onMouseUp,
            onMouseLeave,
        }
    };
};