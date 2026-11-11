
/**
 * ОТВЕТСТВЕННОСТЬ: Оркестрация процесса автоматической расстановки инструмента по контуру.
 */
import { Part, Tool, AutoPunchSettings, TurretLayout, TeachCycle, PlacedTool, Point } from '../../types';
import { getGeometryFromEntities, getOuterLoopIndices } from '../geometry';
import { findTeachCycleMatches } from '../teachLogic';
import { TOLERANCE, getPointKey } from '../punchingUtils';
import { generateId } from '../../utils/helpers';
import { detectAndPunchShapes, detectLoopTools } from '../punchingGenerators';
import { getVectorFromVertex } from './contourUtils';
import { processLineSegment } from './contourLineHandler';
import { processArcSegment } from './contourArcHandler';

export const generateContourPunches = (
    geometry: any, // PartGeometry
    tools: Tool[],
    settings: AutoPunchSettings,
    turretLayouts: TurretLayout[],
    teachCycles: TeachCycle[]
): Omit<PlacedTool, 'id'>[] => {
    const processed = getGeometryFromEntities({ geometry } as Part); 
    if (!processed) return [];

    const punches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    const placedSingleHits = new Set<string>();
    const vertexMap = new Map<string, { point: Point, segmentIndices: number[] }>();

    processed.segments.forEach((seg, idx) => {
        [seg.p1, seg.p2].forEach(p => {
            const k = getPointKey(p);
            if (!vertexMap.has(k)) vertexMap.set(k, { point: p, segmentIndices: [] });
            vertexMap.get(k)!.segmentIndices.push(idx);
        });
    });

    const jointVertices = new Set<string>();
    if (settings.microJointsEnabled) {
        const outerIndices = getOuterLoopIndices(processed.segments);
        const { minX, minY, maxX, maxY } = processed.bbox;
        const cornerTargets = [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: minY }, { x: minX, y: minY }];
        
        cornerTargets.forEach(target => {
            let bestScore = -Infinity, bestKey = null;
            vertexMap.forEach((data, key) => {
                let angleBonus = 0;
                if (data.segmentIndices.length === 2) {
                    const v1 = getVectorFromVertex(processed.segments[data.segmentIndices[0]], data.point);
                    const v2 = getVectorFromVertex(processed.segments[data.segmentIndices[1]], data.point);
                    const dot = v1.x * v2.x + v1.y * v2.y;
                    const ang = Math.acos(Math.max(-1, Math.min(1, dot / (Math.sqrt(v1.x**2+v1.y**2) * Math.sqrt(v2.x**2+v2.y**2))))) * 180 / Math.PI;
                    if (Math.abs(ang - 90) < 5) angleBonus = 1000;
                }
                const score = angleBonus - Math.sqrt((data.point.x - target.x)**2 + (data.point.y - target.y)**2) * 0.5;
                if (score > bestScore) { bestScore = score; bestKey = key; }
            });
            if (bestKey) jointVertices.add(bestKey);
        });
    }

    if (settings.useTeachCycles && teachCycles.length > 0) {
        const matches = findTeachCycleMatches(processed, teachCycles);
        matches.matches.forEach(p => punches.push(p));
        matches.coveredSegmentIndices.forEach(i => coveredIndices.add(i));
    }

    let availableTools = tools;
    if (settings.toolSourceType === 'turret' && settings.turretLayoutId) {
        const layout = turretLayouts.find(l => l.id === settings.turretLayoutId);
        if (layout) availableTools = layout.toolsSnapshot.filter(t => !!t.stationNumber);
    }

    punches.push(...detectAndPunchShapes(geometry, processed, availableTools, settings, coveredIndices));
    punches.push(...detectLoopTools(processed, availableTools, settings, coveredIndices));

    processed.segments.forEach((seg, idx) => {
        if (coveredIndices.has(idx)) return;
        if (seg.type === 'line') {
            const n1 = vertexMap.get(getPointKey(seg.p1))?.segmentIndices.find(i => i !== idx);
            const n2 = vertexMap.get(getPointKey(seg.p2))?.segmentIndices.find(i => i !== idx);
            processLineSegment(seg, geometry, availableTools, settings, punches, processed.segments, { start: n1 !== undefined ? processed.segments[n1] : undefined, end: n2 !== undefined ? processed.segments[n2] : undefined }, jointVertices);
        } else if (seg.type === 'arc') {
            processArcSegment(seg, geometry, availableTools, settings, jointVertices, punches, placedSingleHits, processed.segments);
        }
    });

    return punches;
};
