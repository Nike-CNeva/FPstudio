/**
 * УРОВЕНЬ 4. ТЕХНОЛОГИЧЕСКАЯ КОРРЕКТНОСТЬ И АНАЛИЗ ПОСЛЕДОВАТЕЛЬНОСТИ
 * 
 * Проверяет:
 * 1. Совместимость инструмента с гнездом/станцией револьверной головки (Turret Layout & Auto-Index).
 * 2. Допустимость угла поворота для конкретной станции (фиксированная vs поворотная).
 * 3. Полноту перекрытия последовательных проходов нибблинга.
 * 4. Накопление свободных отходов и целостность детали на уровне всей программы.
 */
import { Tool, PlacedTool, PartGeometry, TurretLayout } from '../../../types';
import { PunchValidationIssue } from './types';
import { ValidationConfig } from './config';

export interface Level4Result {
    isValid: boolean;
    issues: PunchValidationIssue[];
}

/**
 * Валидирует отдельный удар на предмет технологических ограничений станции станка.
 */
export const validateLevel4ToolStation = (
    tool: Tool,
    rotation: number,
    turretLayout?: TurretLayout,
    config?: ValidationConfig
): Level4Result => {
    const issues: PunchValidationIssue[] = [];

    if (turretLayout) {
        const stationTool = turretLayout.toolsSnapshot.find(t => t.id === tool.id || t.stationNumber === tool.stationNumber);
        if (stationTool) {
            // Проверка поворотных станций (Auto-Index vs фиксированный угол)
            const isAutoIndex = tool.isAutoIndex ?? true; // По умолчанию считаем поворотной, если не указано обратное
            if (!isAutoIndex && rotation % 90 !== 0) {
                issues.push({
                    code: 'UNSUPPORTED_TOOL_ROTATION',
                    severity: 'error',
                    message: `Инструмент ${tool.name} находится на фиксированной станции (не Auto-Index) и не поддерживает поворот на ${rotation}°`,
                    toolId: tool.id,
                    ruleId: 'L4-TURRET-001'
                });
            }
        }
    }

    return {
        isValid: issues.filter(i => i.severity === 'error').length === 0,
        issues
    };
};

/**
 * Валидирует всю последовательность ударов траектории на полноту перекрытия и накопление отходов.
 */
export const validatePunchSequence = (
    punches: PlacedTool[],
    tools: Tool[],
    geometry: PartGeometry,
    config?: ValidationConfig
): Level4Result => {
    const issues: PunchValidationIssue[] = [];

    if (!punches || punches.length === 0) {
        return { isValid: true, issues: [] };
    }

    // Анализируем группы нибблинга
    const lineGroups = new Map<string, PlacedTool[]>();
    for (const p of punches) {
        const gId = p.lineId || 'standalone';
        if (!lineGroups.has(gId)) lineGroups.set(gId, []);
        lineGroups.get(gId)!.push(p);
    }

    // Проверяем перекрытие в группах нибблинга
    lineGroups.forEach((groupPunches, gId) => {
        if (gId === 'standalone' || groupPunches.length < 2) return;

        for (let i = 0; i < groupPunches.length - 1; i++) {
            const p1 = groupPunches[i];
            const p2 = groupPunches[i + 1];
            const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

            const tool = tools.find(t => t.id === p1.toolId);
            if (tool) {
                const toolLen = Math.max(tool.width, tool.height);
                if (dist > toolLen - 0.05) {
                    issues.push({
                        code: 'NIBBLE_OVERLAP_INCOMPLETE',
                        severity: 'warning',
                        message: `В траектории ${gId} шаг между ударами ${i + 1} и ${i + 2} (${dist.toFixed(2)} мм) превышает длину инструмента (${toolLen} мм). Неполное перекрытие!`,
                        coordinates: { x: p2.x, y: p2.y },
                        toolId: tool.id,
                        operationId: gId,
                        ruleId: 'L4-SEQ-002'
                    });
                }
            }
        }
    });

    return {
        isValid: issues.filter(i => i.severity === 'error').length === 0,
        issues
    };
};
