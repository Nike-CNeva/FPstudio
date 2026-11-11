
/**
 * ОТВЕТСТВЕННОСТЬ: Генерация ударов для LINE сегментов.
 */
import { Point, Tool, PlacedTool, ToolShape, PartGeometry, AutoPunchSettings } from '../../types';
import { isPointInsideContour, Segment, isToolGouging } from '../geometry';
import { TOLERANCE, getPointKey } from '../punchingUtils';
import { getPreferredTools } from '../punchingTools';
import { generateNibblePunches } from '../punchingGenerators';

export const processLineSegment = (
    seg: Segment, 
    geometry: PartGeometry,
    tools: Tool[], 
    settings: AutoPunchSettings,
    punches: Omit<PlacedTool, 'id'>[],
    allSegments: Segment[],
    neighbors: { start: Segment | undefined, end: Segment | undefined },
    jointVertices: Set<string>
) => {
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const { bbox } = geometry;

    const isExtreme = (p: Point) => Math.abs(p.x - bbox.minX) < TOLERANCE.GEO || Math.abs(p.x - bbox.maxX) < TOLERANCE.GEO || 
                                  Math.abs(p.y - bbox.minY) < TOLERANCE.GEO || Math.abs(p.y - bbox.maxY) < TOLERANCE.GEO;

    const getExtRange = (vertex: Point, dir: {x: number, y: number}, neighbor: Segment | undefined) => {
        if (jointVertices.has(getPointKey(vertex))) return { min: -settings.microJointLength, max: -settings.microJointLength };
        if (neighbor && neighbor.type === 'arc') return { min: settings.extension, max: settings.extension };
        const probe = { x: vertex.x + dir.x * 0.1, y: vertex.y + dir.y * 0.1 };
        if (isPointInsideContour(probe, geometry)) return { min: 0, max: 0 };
        return isExtreme(vertex) ? { min: settings.extension, max: settings.extension } : { min: settings.extension, max: Math.max(settings.extension, settings.vertexTolerance) };
    };

    const ux = dx/len; const uy = dy/len;
    const startRange = getExtRange(seg.p1, { x: -ux, y: -uy }, neighbors.start);
    const endRange = getExtRange(seg.p2, { x: ux, y: uy }, neighbors.end);
    const minReqLen = len + startRange.min + endRange.min;
    const maxAllowedLen = len + startRange.max + endRange.max;

    const singleHitCandidates = tools.filter(t => [ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape) && t.width >= (minReqLen - 0.01) && t.width <= (maxAllowedLen + 0.01));
    
    let tool: Tool | undefined;
    let isSingleHit = false;

    if (singleHitCandidates.length > 0) {
        singleHitCandidates.sort((a, b) => {
            const s = (t: Tool) => t.shape === ToolShape.Rectangle ? 10 : t.shape === ToolShape.Square ? 5 : 0;
            return s(b) - s(a) || a.width - b.width;
        });
        tool = singleHitCandidates[0];
        isSingleHit = true;
    } else {
        const candidates = getPreferredTools('line', len, 0, tools);
        if (candidates.length > 0) tool = candidates[0];
    }

    if (!tool) return;

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const perpOffset = (tool.shape === ToolShape.Circle ? tool.width : tool.height) / 2;
    const mid = { x: (seg.p1.x + seg.p2.x)/2, y: (seg.p1.y + seg.p2.y)/2 };
    const sign = isPointInsideContour({ x: mid.x - uy * perpOffset * 1.1, y: mid.y + ux * perpOffset * 1.1 }, geometry) ? -1 : 1;

    let aStartExt = startRange.min;
    if (isSingleHit) aStartExt = (settings.extension >= Math.max(startRange.min, tool.width - len - endRange.max) && settings.extension <= Math.min(startRange.max, tool.width - len - endRange.min)) ? settings.extension : Math.max(startRange.min, tool.width - len - endRange.max);
    const aEndExt = isSingleHit ? (tool.width - len - aStartExt) : endRange.min;

    const segmentPunches = generateNibblePunches(seg.p1, seg.p2, tool, { extensionStart: aStartExt, extensionEnd: aEndExt, minOverlap: settings.overlap, hitPointMode: 'offset', toolPosition: 'long' }, angle, false, angle, perpOffset * sign);

    segmentPunches.forEach((p, idx) => {
        let curX = p.x, curY = p.y;
        if (isToolGouging(tool!, curX, curY, p.rotation, geometry, geometry.bbox, seg, allSegments)) {
            if (idx === 0 && aStartExt > 0) {
                if (!isToolGouging(tool!, curX + ux * aStartExt, curY + uy * aStartExt, p.rotation, geometry, geometry.bbox, seg, allSegments)) { curX += ux * aStartExt; curY += uy * aStartExt; }
            } else if (idx === segmentPunches.length - 1 && aEndExt > 0) {
                if (!isToolGouging(tool!, curX - ux * aEndExt, curY - uy * aEndExt, p.rotation, geometry, geometry.bbox, seg, allSegments)) { curX -= ux * aEndExt; curY -= uy * aEndExt; }
            }
        }
        if (!isToolGouging(tool!, curX, curY, p.rotation, geometry, geometry.bbox, seg, allSegments)) punches.push({ ...p, x: curX, y: curY });
    });
};
