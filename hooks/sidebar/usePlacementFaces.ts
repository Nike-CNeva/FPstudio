
/**
 * ОТВЕТСТВЕННОСТЬ: Анализ ToolShape (включая Special DXF) для генерации списка "лицевых" граней.
 */
import { useState, useCallback } from 'react';
import { Tool, ToolShape } from '../../types';

export interface ToolFace {
    path: string; 
    angle: number; 
    p1: {x: number, y: number};
    p2: {x: number, y: number};
}

export const usePlacementFaces = (selectedTool: Tool | undefined, setPunchOrientation: (v: number) => void) => {
    const [activeFaceIndex, setActiveFaceIndex] = useState(0);

    const getToolFaces = useCallback((tool: Tool): ToolFace[] => {
        const w = tool.width;
        const h = tool.height;
        const halfW = w / 2;
        const halfH = h / 2;
        
        if (tool.shape === ToolShape.Special && tool.customPath) {
            const faces: ToolFace[] = [];
            const commands: string[] = tool.customPath.match(/([a-zA-Z])([^a-zA-Z]*)/g) || [];
            let cx = 0, cy = 0, startX = 0, startY = 0;
            const shiftX = -halfW, shiftY = -halfH;

            commands.forEach((cmdStr) => {
                const type = cmdStr[0].toUpperCase();
                const args = cmdStr.slice(1).trim().split(/[\s,]+/).map(parseFloat);
                if (type === 'M') {
                    cx = args[0] + shiftX; cy = args[1] + shiftY;
                    startX = cx; startY = cy;
                } else if (type === 'L' || type === 'A') {
                    const nx = (type === 'L' ? args[0] : args[5]) + shiftX;
                    const ny = (type === 'L' ? args[1] : args[6]) + shiftY;
                    faces.push({
                        path: `M ${cx} ${cy} ${type === 'A' ? `A ${args[0]} ${args[1]} ${args[2]} ${args[3]} ${args[4]}` : 'L'} ${nx} ${ny}`,
                        angle: Math.atan2(ny - cy, nx - cx) * 180 / Math.PI,
                        p1: {x: cx, y: cy}, p2: {x: nx, y: ny}
                    });
                    cx = nx; cy = ny;
                } else if (type === 'Z') {
                     if (Math.abs(cx - startX) > 0.001 || Math.abs(cy - startY) > 0.001) {
                        faces.push({
                            path: `M ${cx} ${cy} L ${startX} ${startY}`,
                            angle: Math.atan2(startY - cy, startX - cx) * 180 / Math.PI,
                            p1: {x: cx, y: cy}, p2: {x: startX, y: startY}
                        });
                     }
                }
            });
            return faces;
        }

        return [
            { path: `M ${-halfW} ${halfH} L ${halfW} ${halfH}`, angle: 0, p1: {x: -halfW, y: halfH}, p2: {x: halfW, y: halfH} },
            { path: `M ${-halfW} ${-halfH} L ${-halfW} ${halfH}`, angle: 90, p1: {x: -halfW, y: -halfH}, p2: {x: -halfW, y: halfH} },
            { path: `M ${halfW} ${-halfH} L ${-halfW} ${-halfH}`, angle: 180, p1: {x: halfW, y: -halfH}, p2: {x: -halfW, y: -halfH} },
            { path: `M ${halfW} ${halfH} L ${halfW} ${-halfH}`, angle: 270, p1: {x: halfW, y: halfH}, p2: {x: halfW, y: -halfH} }
        ];
    }, []);

    const faces = selectedTool ? getToolFaces(selectedTool) : [];

    const handleCycleFace = () => {
        if (faces.length === 0) return;
        const nextIndex = (activeFaceIndex + 1) % faces.length;
        setActiveFaceIndex(nextIndex);
        let rotation = (-faces[nextIndex].angle % 360);
        if (rotation < 0) rotation += 360;
        setPunchOrientation(rotation);
    };

    return {
        faces,
        activeFaceIndex,
        handleCycleFace
    };
};
