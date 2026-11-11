
/**
 * ОТВЕТСТВЕННОСТЬ: Генерация ударов для ARC сегментов.
 */
import { Tool, PlacedTool, ToolShape, PartGeometry, AutoPunchSettings } from '../../types';
import { isPointInsideContour, Segment, isToolGouging } from '../geometry';
import { denormalizePoint, calculateScallopStep, getHitKey, getPointKey } from '../punchingUtils';
import { getPreferredTools } from '../punchingTools';

export const processArcSegment = (
    seg: Segment,
    geometry: PartGeometry,
    tools: Tool[],
    settings: AutoPunchSettings,
    jointVertices: Set<string>,
    punches: Omit<PlacedTool, 'id'>[],
    placedSingleHits: Set<string>,
    allSegments: Segment[]
) => {
    const r = seg.radius || 0;
    const center = seg.center || {x:0,y:0};
    if (r <= 0) return;

    const ang1 = Math.atan2(seg.p1.y - center.y, seg.p1.x - center.x);
    let ang2 = Math.atan2(seg.p2.y - center.y, seg.p2.x - center.x);
    let diff = ang2 - ang1;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    
    const isProbeInMaterial = isPointInsideContour(denormalizePoint({ x: center.x + (r + 0.1) * Math.cos(ang1 + diff / 2), y: center.y + (r + 0.1) * Math.sin(ang1 + diff / 2) }, geometry.bbox), geometry);
    
    const exactTools = getPreferredTools('circle', r * 2, 0, tools, settings.toleranceRound);
    if (exactTools.length > 0 && Math.abs(exactTools[0].width - r * 2) <= settings.toleranceRound) {
        const k = getHitKey(center.x, center.y);
        if (!placedSingleHits.has(k)) { punches.push({ toolId: exactTools[0].id, x: center.x, y: center.y, rotation: 0 }); placedSingleHits.add(k); }
        return; 
    }

    let nibbleCandidates = tools.filter(t => t.shape === ToolShape.Circle && (!isProbeInMaterial || (t.width / 2) < (r - 0.1))).sort((a,b) => b.width - a.width);
    if (nibbleCandidates.length === 0) return; 
    
    const tool = nibbleCandidates[0];
    const punchR = isProbeInMaterial ? (r - tool.width/2) : (r + tool.width/2);
    if (punchR <= 0) return; 

    let aDiff = Math.abs(diff);
    let aAng1 = ang1;
    const isClosed = Math.abs(diff) > (2 * Math.PI - 0.01);
    
    if (!isClosed) {
        const mStart = jointVertices.has(getPointKey(seg.p1)) ? (settings.microJointLength / r) : (settings.vertexTolerance / r);
        const mEnd = jointVertices.has(getPointKey(seg.p2)) ? (settings.microJointLength / r) : (settings.vertexTolerance / r);
        if (aDiff <= (mStart + mEnd)) return;
        aAng1 += (diff > 0 ? 1 : -1) * mStart;
        aDiff -= (mStart + mEnd);
    }

    const step = calculateScallopStep(tool.width/2, settings.scallopHeight) / punchR;
    const steps = Math.ceil(aDiff / step);
    const rStep = (diff > 0 ? aDiff : -aDiff) / steps;

    for(let i=0; i <= (isClosed ? steps - 1 : steps); i++) {
        const a = aAng1 + i * rStep;
        let px = center.x + punchR * Math.cos(a), py = center.y + punchR * Math.sin(a);
        if (!isToolGouging(tool, px, py, 0, geometry, geometry.bbox, seg, allSegments)) punches.push({ toolId: tool.id, x: px, y: py, rotation: 0 });
    }
};
