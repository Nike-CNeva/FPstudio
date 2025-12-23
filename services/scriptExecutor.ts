
import { Tool, Part } from '../types';
import { generateId } from '../utils/helpers';
import { DrawQueue } from './script-executor/drawQueue';
import { createPartBuilder } from './script-executor/partBuilder';
import { handleScriptError } from '../utils/scriptErrorHandler';

/**
 * ВЫПОЛНЕНИЕ ПАРАМЕТРИЧЕСКОГО СКРИПТА
 * 
 * @param basePart - Прототип детали
 * @param scriptCode - Текст JS кода
 * @param tools - Доступные инструменты
 * @param targetWidth - Длина (X)
 * @param targetHeight - Ширина (Y)
 * @param params - Объект дополнительных параметров (a, b, c...)
 */
export const executeParametricScript = (
    basePart: Part, 
    scriptCode: string, 
    tools: Tool[], 
    targetWidth: number, 
    targetHeight: number,
    params: Record<string, any> = {}
): Part => {
    
    const queue = new DrawQueue();
    const PartBuilder = createPartBuilder(queue, tools);

    // Выполнение
    try {
        const generateFunc = new Function('Part', 'Length', 'Width', 'width', 'height', 'tools', 'Params', scriptCode);
        generateFunc(PartBuilder, targetWidth, targetHeight, targetWidth, targetHeight, tools, params);
    } catch (err) {
        handleScriptError(err, basePart.name);
    }

    // Обработка накопленной очереди
    const processed = queue.process();

    return {
        ...basePart,
        id: generateId(),
        name: `${basePart.name}_${targetWidth}x${targetHeight}`,
        faceWidth: targetWidth,
        faceHeight: targetHeight,
        geometry: {
            path: processed.path,
            width: processed.width,
            height: processed.height,
            entities: processed.entities,
            bbox: processed.bbox
        },
        punches: processed.punches,
        script: scriptCode
    };
};
