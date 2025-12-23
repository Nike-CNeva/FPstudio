
/**
 * ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (HELPERS)
 * Ответственность: Генерация ID, форматирование строк и логика именования.
 * Не содержит: Логику пробивки или геометрии.
 */
import { PunchType, PartProfile } from '../types';

/**
 * Генерирует уникальный строковый ID.
 */
export const generateId = (): string => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Возвращает текстовое описание типа пробивки.
 */
export const getPunchTypeName = (punchType: PunchType): string => {
    switch (punchType) {
        case PunchType.General: return 'Общий';
        case PunchType.Contour: return 'Контурный';
        case PunchType.Starting: return 'Стартовый';
        case PunchType.Finishing: return 'Финишный';
        default: return 'Неизвестный';
    }
};

/**
 * Удаляет суффиксы размеров из имени детали.
 * Пример: "Box_100x200" -> "Box"
 */
export const getPartBaseName = (currentName: string): string => {
    return currentName.replace(/_(\d+x?)+$/, '');
};

/**
 * Генерирует стандартизированное имя детали на основе профиля.
 * Формат: BaseName_Размеры
 */
export const generatePartNameFromProfile = (
    baseName: string, 
    profile: PartProfile | undefined, 
    width: number, 
    height: number
): string => {
    let hTop = 0, hCenter = 0, hBottom = 0;
    let wLeft = 0, wCenter = 0, wRight = 0;

    const type = profile?.type || 'flat';
    const orientation = profile?.orientation || 'vertical';
    const dims = profile?.dims || { a: 0, b: 0, c: 0 };

    if (type === 'L') {
        if (orientation === 'vertical') {
            wLeft = dims.a; wRight = dims.b; hCenter = height;
        } else {
            hTop = dims.a; hBottom = dims.b; wCenter = width;
        }
    } else if (type === 'U') {
        if (orientation === 'vertical') {
            wLeft = dims.a; wCenter = dims.b; wRight = dims.c; hCenter = height;
        } else {
            hTop = dims.a; hCenter = dims.b; hBottom = dims.c; wCenter = width;
        }
    } else {
        hCenter = height; wCenter = width;
    }

    const values = [wLeft, wCenter, wRight, hTop, hCenter, hBottom];
    const dimStr = values.filter(v => v > 0).map(v => Math.round(v)).join('x');
    const finalSuffix = dimStr || `${Math.round(width)}x${Math.round(height)}`;

    return `${baseName}_${finalSuffix}`;
};
