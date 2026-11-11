/**
 * УРОВЕНЬ 1. ГЕОМЕТРИЧЕСКАЯ КОРРЕКТНОСТЬ УДАРА
 * 
 * Проверяет:
 * - Фактическую режущую геометрию инструмента (Circle, Rect, Square, Oblong, Special, Rotated).
 * - Валидность координат и угла поворота.
 * - Отсутствие вырожденных форм.
 * - Вычисление точного полигона инструмента с математической точностью 0.001 мм.
 */
import { Point, Tool, PartGeometry } from '../../../types';
import { getToolPolygon, getToolBoundingBox } from '../transform';
import { PunchValidationIssue } from './types';
import { ValidationConfig } from './config';

export interface Level1Result {
    isValid: boolean;
    poly: Point[];
    toolBbox: { minX: number; maxX: number; minY: number; maxY: number };
    issues: PunchValidationIssue[];
}

export const validateLevel1Geometry = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    geometry?: PartGeometry,
    config?: ValidationConfig
): Level1Result => {
    const issues: PunchValidationIssue[] = [];

    // 1. Проверка корректности координат и угла
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(rotation)) {
        issues.push({
            code: 'INVALID_PUNCH_COORDINATES',
            severity: 'error',
            message: `Некорректные координаты или угол пробивки: X=${x}, Y=${y}, Rot=${rotation}`,
            coordinates: { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 },
            toolId: tool.id,
            ruleId: 'L1-GEO-001'
        });
        return { isValid: false, poly: [], toolBbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, issues };
    }

    // 2. Проверка геометрии самого инструмента
    if (!tool || tool.width <= 0) {
        issues.push({
            code: 'INVALID_TOOL_GEOMETRY',
            severity: 'error',
            message: `Инструмент ${tool?.name || tool?.id || ''} имеет некорректные габариты (ширина <= 0)`,
            toolId: tool?.id,
            ruleId: 'L1-GEO-002'
        });
        return { isValid: false, poly: [], toolBbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, issues };
    }

    // 3. Расчет точного полигона режущей геометрии (с точностью 0.001 мм)
    const poly = getToolPolygon(tool, x, y, rotation);
    const toolBbox = getToolBoundingBox(tool, x, y, rotation);

    if (poly.length < 3) {
        issues.push({
            code: 'INVALID_TOOL_GEOMETRY',
            severity: 'error',
            message: `Не удалось построить режущий полигон для инструмента ${tool.name} (вершин < 3)`,
            toolId: tool.id,
            ruleId: 'L1-GEO-003'
        });
        return { isValid: false, poly, toolBbox, issues };
    }

    return {
        isValid: true,
        poly,
        toolBbox,
        issues
    };
};
