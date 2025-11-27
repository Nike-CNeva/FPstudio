

import { NestResultSheet, Part, Tool } from '../types';

/**
 * Generates G-code for a Finn-Power machine from a single sheet of a nest layout.
 */
export const generateGCode = (
    sheet: NestResultSheet, 
    parts: Part[], 
    tools: Tool[],
    nestName: string
): string => {
    let gcode = '';
    const programNumber = Math.floor(Math.random() * 8999) + 1000;

    // Header
    gcode += `%\n`;
    gcode += `O${programNumber} (${nestName} - ${sheet.sheetName})\n`;
    gcode += `G21 G90 G40 G80\n`;
    gcode += `( --- ОПРЕДЕЛЕНИЕ ИНСТРУМЕНТА --- )\n`;

    // Tool Definitions
    const usedToolIds = new Set<string>();
    sheet.placedParts.forEach(pp => {
        const part = parts.find(p => p.id === pp.partId);
        part?.punches.forEach(punch => usedToolIds.add(punch.toolId));
    });

    const toolMap = new Map<string, number>();
    let toolIndex = 1;
    usedToolIds.forEach(toolId => {
        const tool = tools.find(t => t.id === toolId);
        if (tool) {
            gcode += `T${toolIndex} M06 (${tool.name} - ${tool.shape} ${tool.width}x${tool.height})\n`;
            toolMap.set(toolId, toolIndex);
            toolIndex++;
        }
    });

    // Sheet Setup
    gcode += `( --- НАСТРОЙКА ЛИСТА --- )\n`;
    gcode += `G00 X${sheet.width} Y${sheet.height} (РАЗМЕР ЛИСТА: ${sheet.width}x${sheet.height} ${sheet.material})\n`;
    gcode += `\n`;

    // Punching Operations
    gcode += `( --- ОПЕРАЦИИ ПРОБИВКИ --- )\n`;
    sheet.placedParts.forEach(placedPart => {
        const part = parts.find(p => p.id === placedPart.partId);
        if (!part) return;

        gcode += `( ДЕТАЛЬ: ${part.name} AT X${placedPart.x.toFixed(3)} Y${placedPart.y.toFixed(3)} )\n`;

        part.punches.forEach(punch => {
            const toolT = toolMap.get(punch.toolId);
            if (toolT === undefined) return;

            const punchX = placedPart.x + punch.x;
            const punchY = placedPart.y + punch.y;

            gcode += `T${toolT}\n`;
            gcode += `G00 X${punchX.toFixed(3)} Y${punchY.toFixed(3)}\n`;
            gcode += `M07 (ЦИКЛ ПРОБИВКИ)\n`; // Simplified punch cycle command
        });
        gcode += `\n`;
    });

    // Footer
    gcode += `M02 (КОНЕЦ ПРОГРАММЫ)\n`;
    gcode += `%\n`;

    return gcode;
};
