
import { ChangeEvent } from 'react';
import { AppMode, Part, Tool } from '../types';
import { parseCp } from '../services/cpParser';
import { parseDxf, dxfEntitiesToSvg } from '../services/dxfParser';
import { detectPartProfile } from '../services/geometry';
import { generateId } from '../utils/helpers';

interface UseFileImportProps {
    tools: Tool[];
    setMode: (mode: AppMode) => void;
    setActivePart: (part: Part) => void;
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const useFileImport = ({ tools, setMode, setActivePart, addToast }: UseFileImportProps) => {
    
    const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            const fileName = file.name;
            
            // Handle CP File
            if (fileName.toLowerCase().endsWith('.cp')) {
                const parsedPart = parseCp(content, fileName, tools);
                if (parsedPart) { 
                    parsedPart.profile = detectPartProfile(parsedPart.geometry); 
                    setActivePart(parsedPart); 
                    setMode(AppMode.PartEditor); 
                    addToast(`Файл ${fileName} импортирован.`, "success"); 
                    return; 
                }
            }
            
            // Handle DXF File
            try {
                const parsedEntities = parseDxf(content);
                if (parsedEntities.length > 0) {
                    const { path, width, height, bbox, normalizedEntities } = dxfEntitiesToSvg(parsedEntities);
                    const newPart: Part = { 
                        id: generateId(), 
                        name: fileName.replace(/\.(dxf|DXF)$/, ''), 
                        geometry: { path, width, height, entities: normalizedEntities, bbox }, 
                        punches: [], 
                        material: { code: 'St-3', thickness: 1.0, dieClearance: 0.2 }, 
                        nesting: { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: true, canMirror: false }, 
                        faceWidth: width, 
                        faceHeight: height 
                    };
                    newPart.profile = detectPartProfile(newPart.geometry);
                    setActivePart(newPart); 
                    setMode(AppMode.PartEditor); 
                    addToast("DXF загружен.", "success");
                } else {
                    addToast("Ошибка DXF: Нет геометрии.", "error");
                }
            } catch (error) { 
                console.error(error);
                addToast("Ошибка чтения DXF.", "error"); 
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    return { handleFileUpload };
};
