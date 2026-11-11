/**
 * ЕДИНЫЙ КООРДИНАТОР ПРОВЕРКИ ТЕХНОЛОГИЧЕСКОЙ КОРРЕКТНОСТИ ПРОБИВКИ (FPstudio)
 * 
 * Объединяет все 4 уровня проверок:
 * Уровень 1: Геометрическая корректность удара
 * Уровень 2: Сохранность готовой детали (и правило открытого угла >= 1.0 мм)
 * Уровень 3: Безопасность отходов, отсекаемых углов и перемычек
 * Уровень 4: Технологические ограничения станций и последовательности
 */
import { Tool, PartGeometry, AutoPunchSettings, TurretLayout } from '../../../types';
import { Segment } from '../topology';
import { PunchIntegrityResult, PunchValidationIssue } from './types';
import { getDynamicConfig, ValidationConfig } from './config';
import { validateLevel1Geometry } from './level1Geometry';
import { validateLevel2PartPreservation } from './level2PartPreservation';
import { validateLevel3SlugsAndWebs } from './level3SlugsAndWebs';
import { validateLevel4ToolStation, validatePunchSequence } from './level4TechSequence';

export * from './types';
export * from './config';
export { validateLevel1Geometry } from './level1Geometry';
export { validateLevel2PartPreservation } from './level2PartPreservation';
export { validateLevel3SlugsAndWebs } from './level3SlugsAndWebs';
export { validateLevel4ToolStation, validatePunchSequence } from './level4TechSequence';

/**
 * Главная централизованная функция валидации одиночного удара инструмента.
 */
export const validateToolPunchIntegrity = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    geometry: PartGeometry,
    bbox: PartGeometry['bbox'],
    currentSegment: Segment,
    allSegments?: Segment[],
    settings?: Partial<AutoPunchSettings>,
    turretLayout?: TurretLayout
): PunchIntegrityResult => {
    const config = getDynamicConfig((settings as any)?.materialThickness ?? 1.5, {
        maxInwardGougeTolerance: settings?.maxInwardGougeTolerance ?? tool.maxInwardGouge ?? 0.05,
        minSlugWidth: settings?.minSlugWidth ?? tool.minSlugWidth ?? 0.8,
        maxAllowedOverhang: settings?.maxAllowedOverhang ?? tool.maxOverhang ?? 30.0,
        checkInwardGouge: settings?.checkInwardGouge ?? true,
        checkOverhang: settings?.checkOverhang ?? true,
        checkLooseSlugs: settings?.checkLooseSlugs ?? (tool.preventLooseSlugs ?? true)
    });

    const issues: PunchValidationIssue[] = [];

    // Уровень 1. Геометрический контроль режущей части
    const l1Res = validateLevel1Geometry(tool, x, y, rotation, geometry, config);
    issues.push(...l1Res.issues);

    if (!l1Res.isValid) {
        const errorIssue = issues.find(i => i.severity === 'error');
        return {
            isValid: false,
            hasInwardGouge: false,
            maxInwardDepth: 0,
            hasExcessiveOverhang: false,
            maxOverhangDistance: 0,
            hasLooseSlugs: false,
            reason: errorIssue?.message || 'Ошибка геометрии инструмента',
            issues
        };
    }

    // Уровень 2. Контроль сохранности готовой детали и правила открытого угла
    const l2Res = validateLevel2PartPreservation(tool, x, y, rotation, l1Res.poly, geometry, currentSegment, allSegments, config);
    issues.push(...l2Res.issues);

    // Уровень 3. Контроль свободных отходов, отсечения углов и перемычек
    const l3Res = validateLevel3SlugsAndWebs(tool, x, y, rotation, l1Res.poly, geometry, currentSegment, allSegments, config);
    issues.push(...l3Res.issues);

    // Уровень 4. Контроль станции револьверной головки
    const l4Res = validateLevel4ToolStation(tool, rotation, turretLayout, config);
    issues.push(...l4Res.issues);

    const errorIssues = issues.filter(i => i.severity === 'error');
    const isValid = errorIssues.length === 0;

    const primaryReason = errorIssues.length > 0 ? errorIssues[0].message : undefined;

    return {
        isValid,
        hasInwardGouge: l2Res.hasInwardGouge,
        maxInwardDepth: l2Res.maxInwardDepth,
        hasExcessiveOverhang: l2Res.hasExcessiveOverhang,
        maxOverhangDistance: l2Res.maxOverhangDistance,
        hasLooseSlugs: l3Res.hasLooseSlugs,
        reason: primaryReason,
        issues
    };
};

/**
 * Обратная совместимость с вызовом checkInwardGouge.
 */
export const checkInwardGouge = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    geometry: PartGeometry,
    bbox: PartGeometry['bbox'],
    currentSegment: Segment,
    allSegments?: Segment[],
    tolerance: number = 0.05
): { hasGouge: boolean; maxDepth: number } => {
    const res = validateToolPunchIntegrity(tool, x, y, rotation, geometry, bbox, currentSegment, allSegments, { maxInwardGougeTolerance: tolerance });
    return { hasGouge: res.hasInwardGouge, maxDepth: res.maxInwardDepth };
};

/**
 * Обратная совместимость с вызовом checkToolOverhang.
 */
export const checkToolOverhang = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    bbox: PartGeometry['bbox'],
    maxAllowedOverhang?: number
): { hasExcessiveOverhang: boolean; maxOverhang: number } => {
    const dummySeg = { id: 'dummy', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, contourType: 'inner' } as any;
    const dummyGeom = { bbox, entities: [] } as any;
    const res = validateToolPunchIntegrity(tool, x, y, rotation, dummyGeom, bbox, dummySeg, undefined, { maxAllowedOverhang, checkOverhang: true });
    return { hasExcessiveOverhang: res.hasExcessiveOverhang, maxOverhang: res.maxOverhangDistance };
};

/**
 * Обратная совместимость с вызовом checkLooseSlugsAndCavities.
 */
export const checkLooseSlugsAndCavities = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    geometry: PartGeometry,
    bbox: PartGeometry['bbox'],
    currentSegment: Segment,
    allSegments?: Segment[],
    minSlugWidthLimit?: number
): { hasLooseSlugs: boolean; reason?: string } => {
    const res = validateToolPunchIntegrity(tool, x, y, rotation, geometry, bbox, currentSegment, allSegments, { minSlugWidth: minSlugWidthLimit });
    return { hasLooseSlugs: res.hasLooseSlugs, reason: res.reason };
};

/**
 * Обратная совместимость с вызовом isToolGouging.
 */
export const isToolGouging = (
    tool: Tool,
    x: number,
    y: number,
    rotation: number,
    geometry: PartGeometry,
    bbox: PartGeometry['bbox'],
    currentSegment: Segment,
    allSegments?: Segment[]
): boolean => {
    const result = validateToolPunchIntegrity(tool, x, y, rotation, geometry, bbox, currentSegment, allSegments);
    return !result.isValid;
};
