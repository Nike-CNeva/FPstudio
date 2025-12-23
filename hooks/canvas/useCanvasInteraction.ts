
/**
 * ОТВЕТСТВЕННОСТЬ: Обработка событий мыши для выделения рамкой и перемещения деталей.
 */
import { useState, useRef, MouseEvent } from 'react';
import { Point, AppMode, NestLayout, NestResultSheet, Part } from '../../types';
import { isPointInRectangle, calculateNestingSnap, ProcessedGeometry } from '../../services/geometry';

interface UseCanvasInteractionProps {
    mode: AppMode;
    activeNest: NestLayout | null;
    currentNestSheet: NestResultSheet | null | undefined;
    parts: Part[];
    processedGeometry: ProcessedGeometry | null;
    activePart: Part | null;
    teachMode: boolean;
    isDragging: boolean;
    getPointFromEvent: (e: MouseEvent<SVGSVGElement>) => Point;
    panZoomHandlers: any;
    onSelectNestPart?: (id: string | null) => void;
    onMoveNestPart?: (id: string, dx: number, dy: number) => void;
    onTeachBulkSelect?: (segs: number[], punches: string[], add: boolean) => void;
}

export const useCanvasInteraction = (props: UseCanvasInteractionProps) => {
    const [mousePos, setMousePos] = useState<Point | null>(null);
    const [selectionStart, setSelectionStart] = useState<Point | null>(null);
    const [selectionCurrent, setSelectionCurrent] = useState<Point | null>(null);
    const isSelectingRef = useRef(false);
    const [draggingNestPartId, setDraggingNestPartId] = useState<string | null>(null);
    const lastDragPos = useRef<Point | null>(null);

    const getModelPoint = (e: MouseEvent<SVGSVGElement>): Point => {
        const pt = props.getPointFromEvent(e);
        return { x: pt.x, y: -pt.y };
    };

    const onMouseDown = (event: MouseEvent<SVGSVGElement>) => {
        const pt = getModelPoint(event);

        if (props.mode === AppMode.Nesting && props.activeNest && props.currentNestSheet && props.onSelectNestPart) {
            for (let i = props.currentNestSheet.placedParts.length - 1; i >= 0; i--) {
                const pp = props.currentNestSheet.placedParts[i];
                const part = props.parts.find(p => p.id === pp.partId);
                if (part && isPointInRectangle(pt, pp.x, pp.y, part.geometry.width, part.geometry.height, pp.rotation)) {
                    props.onSelectNestPart(pp.id);
                    setDraggingNestPartId(pp.id);
                    lastDragPos.current = pt;
                    event.stopPropagation();
                    return;
                }
            }
            props.onSelectNestPart(null);
        }

        if (event.button === 0 && props.teachMode && !props.isDragging) {
             setSelectionStart(pt);
             setSelectionCurrent(pt);
             isSelectingRef.current = true;
        }
        
        props.panZoomHandlers.onMouseDown(event);
    };

    const onMouseMove = (event: MouseEvent<SVGSVGElement>) => {
        const pt = getModelPoint(event);
        setMousePos(pt);
        
        if (draggingNestPartId && lastDragPos.current && props.onMoveNestPart && props.currentNestSheet) {
            const dx = pt.x - lastDragPos.current.x;
            const dy = pt.y - lastDragPos.current.y;
            let finalDx = dx, finalDy = dy;
            
            const draggedPart = props.currentNestSheet.placedParts.find(p => p.id === draggingNestPartId);
            if (draggedPart) {
                const snapPos = calculateNestingSnap({ ...draggedPart, x: draggedPart.x + dx, y: draggedPart.y + dy }, props.currentNestSheet.placedParts, props.parts, 15);
                if (snapPos) { finalDx = snapPos.x - draggedPart.x; finalDy = snapPos.y - draggedPart.y; }
            }

            props.onMoveNestPart(draggingNestPartId, finalDx, finalDy);
            lastDragPos.current = pt;
            event.stopPropagation();
            return;
        }

        if (isSelectingRef.current && selectionStart) {
             setSelectionCurrent(pt);
             event.stopPropagation();
        } else {
             props.panZoomHandlers.onMouseMove(event);
        }
    };

    const onMouseUp = (event: MouseEvent<SVGSVGElement>) => {
        if (draggingNestPartId) { setDraggingNestPartId(null); lastDragPos.current = null; }

        if (isSelectingRef.current && selectionStart && selectionCurrent) {
            if (props.teachMode && props.processedGeometry && props.activePart && props.onTeachBulkSelect) {
                const x1 = Math.min(selectionStart.x, selectionCurrent.x), x2 = Math.max(selectionStart.x, selectionCurrent.x);
                const y1 = Math.min(selectionStart.y, selectionCurrent.y), y2 = Math.max(selectionStart.y, selectionCurrent.y);
                
                if ((x2 - x1) > 1 || (y2 - y1) > 1) {
                    const foundSegs: number[] = [], foundPunches: string[] = [];
                    props.processedGeometry.segments.forEach((seg, idx) => {
                        const cx = (seg.p1.x + seg.p2.x) / 2, cy = (seg.p1.y + seg.p2.y) / 2;
                        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) foundSegs.push(idx);
                    });
                    props.activePart.punches.forEach(p => {
                        if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) foundPunches.push(p.id);
                    });
                    props.onTeachBulkSelect(foundSegs, foundPunches, event.shiftKey || event.ctrlKey);
                }
            }
            setSelectionStart(null); setSelectionCurrent(null); isSelectingRef.current = false;
        }
        props.panZoomHandlers.onMouseUp(event);
    };

    const onMouseLeave = (event: MouseEvent<SVGSVGElement>) => {
        props.panZoomHandlers.onMouseLeave(event);
        setMousePos(null);
        if (isSelectingRef.current) { setSelectionStart(null); setSelectionCurrent(null); isSelectingRef.current = false; }
        if (draggingNestPartId) { setDraggingNestPartId(null); lastDragPos.current = null; }
    };

    return {
        mousePos,
        selectionStart,
        selectionCurrent,
        interactionHandlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave }
    };
};
