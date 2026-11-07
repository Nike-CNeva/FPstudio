import { Tool, ToolShape, PunchType } from '../types';
import { hasUsableSpecialToolGeometry } from './specialToolMatching';

export interface ToolValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validates the physical data required to safely store and use a tool.
 * Machine-specific limits are intentionally not guessed here.
 */
export const validateTool = (tool: Tool): ToolValidationResult => {
    const errors: string[] = [];
    const isFiniteNumber = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value);

    if (typeof tool.name !== 'string' || !tool.name.trim()) {
        errors.push('Укажите название инструмента.');
    }

    if (!Object.values(ToolShape).includes(tool.shape)) {
        errors.push('Выбрана неизвестная форма инструмента.');
    }

    if (!Object.values(PunchType).includes(tool.punchType)) {
        errors.push('Выбран неизвестный тип применения инструмента.');
    }

    if (tool.stationType !== undefined && !['A', 'B', 'C', 'D', 'MT'].includes(tool.stationType)) {
        errors.push('Указан неизвестный тип станции.');
    }

    if (typeof tool.isAutoIndex !== 'boolean') {
        errors.push('Параметр Auto Index должен быть включён или выключен.');
    }

    const numericParameters: [string, unknown][] = [
        ['Высота съёмника', tool.stripperHeight],
        ['Глубина пробивки', tool.punchDepth],
        ['Скорость пуансона', tool.ramSpeed],
        ['Ускорение', tool.acceleration],
        ['Приоритет нибблинга', tool.nibblingPriority],
        ['Приоритет пробивки', tool.punchPriority],
        ['Защитная зона Y', tool.yProtectionArea],
        ['Ширина зоны', tool.zoneWidth],
        ['Угол по умолчанию', tool.defaultRotation]
    ];

    numericParameters.forEach(([label, value]) => {
        if (value !== undefined && !isFiniteNumber(value)) {
            errors.push(`${label}: значение должно быть конечным числом.`);
        }
    });

    if (isFiniteNumber(tool.yProtectionArea) && tool.yProtectionArea < 0) {
        errors.push('Защитная зона Y не может быть отрицательной.');
    }

    if (isFiniteNumber(tool.zoneWidth) && tool.zoneWidth < 0) {
        errors.push('Ширина зоны не может быть отрицательной.');
    }

    if (typeof tool.operatingMode !== 'string' || !tool.operatingMode.trim()) {
        errors.push('Не указан режим работы инструмента.');
    }

    if (!isFiniteNumber(tool.width) || tool.width <= 0) {
        errors.push('Ширина должна быть конечным числом больше 0.');
    }

    if (!isFiniteNumber(tool.height) || tool.height <= 0) {
        errors.push('Высота должна быть конечным числом больше 0.');
    }

    if (!isFiniteNumber(tool.cornerRadius) || tool.cornerRadius < 0) {
        errors.push('Радиус скругления не может быть отрицательным или некорректным.');
    } else if (
        tool.shape === ToolShape.Rectangle &&
        isFiniteNumber(tool.width) &&
        isFiniteNumber(tool.height) &&
        tool.cornerRadius > Math.min(tool.width, tool.height) / 2
    ) {
        errors.push('Радиус скругления прямоугольника не может превышать половину меньшей стороны.');
    }

    if (typeof tool.toolSize !== 'string' || !tool.toolSize.trim()) {
        errors.push('Не указан размер станции инструмента.');
    }

    if (
        tool.stationNumber !== undefined &&
        (!Number.isInteger(tool.stationNumber) || tool.stationNumber < 0)
    ) {
        errors.push('Номер станции должен быть целым числом не меньше 0.');
    }

    if (tool.stationType === 'MT') {
        if (!Number.isInteger(tool.mtIndex) || (tool.mtIndex as number) < 1 || (tool.mtIndex as number) > 24) {
            errors.push('Для Multi-Tool необходимо указать слот от 1 до 24.');
        }
    }

    if (!Array.isArray(tool.dies) || tool.dies.length === 0) {
        errors.push('У инструмента должна быть хотя бы одна матрица.');
    } else {
        tool.dies.forEach((die, index) => {
            if (!die || !isFiniteNumber(die.clearance) || die.clearance < 0) {
                errors.push(`Зазор матрицы ${index + 1} должен быть конечным числом не меньше 0.`);
            }
        });
    }

    if (tool.shape === ToolShape.Special) {
        if (typeof tool.customPath !== 'string' || !tool.customPath.trim()) {
            errors.push('Для Special-инструмента необходимо загрузить DXF-контур.');
        }
        if (!hasUsableSpecialToolGeometry(tool)) {
            errors.push('DXF Special-инструмента должен содержать один замкнутый контур из поддерживаемых линий и дуг. Повторно загрузите корректный DXF.');
        }
    }

    if (!Array.isArray(tool.keyAngles) || tool.keyAngles.some(angle => !isFiniteNumber(angle))) {
        errors.push('Углы ориентации должны быть корректным списком чисел.');
    }

    if (!Number.isInteger(tool.punchCount) || tool.punchCount < 1) {
        errors.push('Количество ударов должно быть целым числом не меньше 1.');
    }

    return { valid: errors.length === 0, errors };
};
