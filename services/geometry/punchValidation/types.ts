/**
 * СИСТЕМА ПРОВЕРКИ ТЕХНОЛОГИЧЕСКОЙ КОРРЕКТНОСТИ ПРОБИВКИ (FPstudio)
 * Модуль типов и контракта результатов.
 */
import { Point, Tool, PartGeometry, AutoPunchSettings } from '../../../types';
import { Segment } from '../topology';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationCode =
    // Level 1 Codes
    | 'INVALID_TOOL_GEOMETRY'
    | 'INVALID_PUNCH_COORDINATES'
    | 'UNSUPPORTED_SPECIAL_TOOL'
    // Level 2 Codes
    | 'INWARD_GOUGE'
    | 'PART_BODY_DAMAGED'
    | 'OPEN_CORNER_UNDER_PROTRUSION'
    | 'EXCESSIVE_UNAUTHORIZED_OVERHANG'
    // Level 3 Codes
    | 'LOOSE_CORNER_SLUG'
    | 'THIN_SLIVER'
    | 'UNATTACHED_ISLAND'
    | 'THIN_WEB_BREACH'
    // Level 4 Codes
    | 'TURRET_STATION_MISMATCH'
    | 'UNSUPPORTED_TOOL_ROTATION'
    | 'NIBBLE_OVERLAP_INCOMPLETE'
    | 'SEQUENCE_SLUG_ACCUMULATION';

export interface PunchValidationIssue {
    code: ValidationCode;
    severity: ValidationSeverity;
    message: string;
    coordinates?: Point;
    affectedGeometry?: string;
    toolId?: string;
    operationId?: string;
    ruleId: string;
}

export interface PunchIntegrityResult {
    isValid: boolean;
    hasInwardGouge: boolean;
    maxInwardDepth: number;
    hasExcessiveOverhang: boolean;
    maxOverhangDistance: number;
    hasLooseSlugs: boolean;
    reason?: string;
    issues: PunchValidationIssue[];
}
