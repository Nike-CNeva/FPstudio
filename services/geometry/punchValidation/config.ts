/**
 * СЕНТРАЛИЗОВАННЫЕ ТЕХНОЛОГИЧЕСКИЕ ПАРАМЕТРЫ И ДОПУСКИ (FPstudio)
 */

export interface ValidationConfig {
    /** Вычислительная точность геометрических операций в мм (0.001 мм) */
    precision: number;
    /** Допустимый предел зарезания внутрь готовой детали в мм (по умолчанию 0.05 мм) */
    maxInwardGougeTolerance: number;
    /** Минимальное обязательное удлинение/выход пуансона за открытый внешний угол в мм (по умолчанию 1.0 мм) */
    minOpenCornerProtrusion: number;
    /** Минимальная ширина отхода/стружки в мм во избежание образования клиновидной стружки (по умолчанию 0.8 мм) */
    minSlugWidth: number;
    /** Минимально допустимая остаточная ширина перемычки между соседними контурами/отверстиями в мм (по умолчанию 1.0 мм) */
    minWebThickness: number;
    /** Максимально допустимый вылет за границу отхода листа в мм (по умолчанию 30.0 мм) */
    maxAllowedOverhang: number;
    /** Флаг активной проверки отсекаемых угловых отходов */
    checkLooseSlugs: boolean;
    /** Флаг активной проверки зарезания внутрь детали */
    checkInwardGouge: boolean;
    /** Флаг активной проверки вылета за габарит */
    checkOverhang: boolean;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
    precision: 0.001,
    maxInwardGougeTolerance: 0.05,
    minOpenCornerProtrusion: 1.0,
    minSlugWidth: 0.8,
    minWebThickness: 1.0,
    maxAllowedOverhang: 30.0,
    checkLooseSlugs: true,
    checkInwardGouge: true,
    checkOverhang: true
};

/**
 * Рассчитывает технологические параметры с учетом толщины материала (в мм).
 */
export const getDynamicConfig = (materialThickness?: number, customConfig?: Partial<ValidationConfig>): ValidationConfig => {
    const base = { ...DEFAULT_VALIDATION_CONFIG, ...customConfig };
    if (materialThickness && materialThickness > 0) {
        // Минимальная ширина стружки и перемычек увеличивается с ростом толщины листа (s * 0.5, мин 0.8 мм)
        base.minSlugWidth = Math.max(0.8, materialThickness * 0.5);
        base.minWebThickness = Math.max(1.0, materialThickness * 0.6);
    }
    return base;
};
