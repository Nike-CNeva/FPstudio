
/**
 * ОТВЕТСТВЕННОСТЬ: Преобразование объектов приложения в формат строк jspdf-autotable.
 */
import { NestResultSheet, Part, Tool, ScheduledPart } from "../../types";

export const getSheetTableData = (sheet: NestResultSheet, clamps: number[]) => {
    const clampStr = clamps.map((c, i) => `Z${i+1}: ${c}`).join('  |  ');
    return [
        ['Размер', `${sheet.width} x ${sheet.height} мм`, clampStr],
        ['Материал', `${sheet.material}  s=${sheet.thickness} мм`, ''],
        ['Количество', `${sheet.quantity} шт.`, `Использование: ${sheet.usedArea.toFixed(1)}%`]
    ];
};

export const getPartsTableData = (sheet: NestResultSheet, parts: Part[], scheduledParts: ScheduledPart[]) => {
    const partsOnSheet = new Map<string, number>();
    sheet.placedParts.forEach(pp => {
        partsOnSheet.set(pp.partId, (partsOnSheet.get(pp.partId) || 0) + 1);
    });
    
    return Array.from(partsOnSheet.entries()).map(([partId, countOnSheet]) => {
        const part = parts.find(p => p.id === partId);
        const scheduled = scheduledParts.find(sp => sp.partId === partId);
        const totalQty = scheduled ? scheduled.quantity : 0;
        let dims = `${part?.geometry.width.toFixed(1)}x${part?.geometry.height.toFixed(1)}`;
        if (part?.profile && part.profile.type !== 'flat') {
             dims += ` (${part.profile.type})`;
        }
        return [part?.name || 'Unknown', dims, countOnSheet, totalQty];
    });
};

export const getToolingTableData = (sheet: NestResultSheet, parts: Part[], tools: Tool[]) => {
    const toolHits = new Map<string, number>();
    sheet.placedParts.forEach(pp => {
        const part = parts.find(p => p.id === pp.partId);
        part?.punches.forEach(punch => {
            toolHits.set(punch.toolId, (toolHits.get(punch.toolId) || 0) + 1);
        });
    });

    const rows = Array.from(toolHits.entries()).map(([toolId, hits]) => {
        const tool = tools.find(t => t.id === toolId);
        return {
            station: tool?.stationNumber || 0,
            mt: tool?.mtIndex || 0,
            name: tool?.name || toolId,
            die: tool?.dies[0]?.clearance || 0,
            hits: hits,
            angle: tool?.defaultRotation || 0
        };
    }).sort((a, b) => a.station - b.station || a.mt - b.mt);

    return rows.map(t => {
        let code = t.station > 0 ? (t.mt > 0 ? 20 + t.mt : t.station) : 'Auto';
        const stationDisplay = typeof code === 'number' ? `T${code}` : code;
        return [stationDisplay, t.name, `${t.angle}°`, `${t.die}`, t.hits];
    });
};

export const getProductionDetailsData = (sheet: NestResultSheet, parts: Part[], scheduledParts: ScheduledPart[], allSheets: NestResultSheet[]) => {
    const uniquePartIdsOnSheet = Array.from(new Set(sheet.placedParts.map(pp => pp.partId)));
    
    return uniquePartIdsOnSheet.map(partId => {
        const part = parts.find(p => p.id === partId);
        const scheduled = scheduledParts.find(sp => sp.partId === partId);
        const qtyOnThisLayout = sheet.placedParts.filter(pp => pp.partId === partId).length;
        
        const otherLocations: string[] = [];
        allSheets.forEach((s, idx) => {
            if (s.id === sheet.id) return;
            const countOnOther = s.placedParts.filter(pp => pp.partId === partId).length;
            if (countOnOther > 0) {
                otherLocations.push(`${s.sheetName || `Sheet ${idx + 1}`} (x${s.quantity}): ${countOnOther * s.quantity} шт.`);
            }
        });

        return [
            part?.name || 'Unknown',
            scheduled?.quantity || 0,
            `${qtyOnThisLayout} шт.`,
            `x ${sheet.quantity}`,
            `${qtyOnThisLayout * sheet.quantity} шт.`,
            otherLocations.length > 0 ? otherLocations.join('\n') : "Только этот лист"
        ];
    });
};
