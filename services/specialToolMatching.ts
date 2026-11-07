import { Part, Point, Tool } from '../types';
import { findClosedLoops, getGeometryFromEntities, Segment } from './geometry';
import { TOLERANCE } from './punchingUtils';

interface OrderedContourSegment {
    segment: Segment;
    from: Point;
    to: Point;
}

export interface SpecialToolMatch {
    x: number;
    y: number;
    rotation: number;
    error: number;
}

const pointKey = (point: Point): string => `${point.x.toFixed(3)},${point.y.toFixed(3)}`;

const orderClosedContour = (segments: Segment[], indices: number[]): OrderedContourSegment[] | null => {
    if (indices.length < 3) return null;

    const adjacency = new Map<string, number[]>();
    indices.forEach(index => {
        const segment = segments[index];
        if (!segment) return;
        [pointKey(segment.p1), pointKey(segment.p2)].forEach(key => {
            if (!adjacency.has(key)) adjacency.set(key, []);
            adjacency.get(key)!.push(index);
        });
    });

    // A single simple closed contour has exactly two incident edges at each vertex.
    if (Array.from(adjacency.values()).some(edges => edges.length !== 2)) return null;

    const firstIndex = indices[0];
    const first = segments[firstIndex];
    if (!first) return null;

    const ordered: OrderedContourSegment[] = [{ segment: first, from: first.p1, to: first.p2 }];
    const visited = new Set<number>([firstIndex]);
    const startKey = pointKey(first.p1);
    let currentKey = pointKey(first.p2);

    while (currentKey !== startKey && ordered.length <= indices.length) {
        const next = (adjacency.get(currentKey) || []).find(index => !visited.has(index));
        if (next === undefined) return null;

        const segment = segments[next];
        const forward = pointKey(segment.p1) === currentKey;
        const from = forward ? segment.p1 : segment.p2;
        const to = forward ? segment.p2 : segment.p1;

        ordered.push({ segment, from, to });
        visited.add(next);
        currentKey = pointKey(to);
    }

    if (currentKey !== startKey || visited.size !== indices.length) return null;
    return ordered;
};

const reverseContour = (contour: OrderedContourSegment[]): OrderedContourSegment[] =>
    [...contour].reverse().map(item => ({
        segment: item.segment,
        from: item.to,
        to: item.from
    }));

const arcSweep = (segment: Segment): number | null => {
    const entity = segment.originalEntity;
    if (entity?.type === 'CIRCLE') return 90;
    if (entity?.type !== 'ARC') return null;
    let sweep = entity.endAngle - entity.startAngle;
    if (sweep < 0) sweep += 360;
    return sweep;
};

const rotatePoint = (point: Point, radians: number): Point => ({
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
});

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const matchOrderedContours = (
    toolContour: OrderedContourSegment[],
    targetContour: OrderedContourSegment[],
    tool: Tool,
    tolerance: number
): SpecialToolMatch | null => {
    const count = toolContour.length;
    if (count !== targetContour.length || count === 0) return null;

    let best: SpecialToolMatch | null = null;
    const toolFirst = toolContour[0];

    for (let offset = 0; offset < count; offset++) {
        const targetFirst = targetContour[offset];
        const toolVector = {
            x: toolFirst.to.x - toolFirst.from.x,
            y: toolFirst.to.y - toolFirst.from.y
        };
        const targetVector = {
            x: targetFirst.to.x - targetFirst.from.x,
            y: targetFirst.to.y - targetFirst.from.y
        };
        const radians = Math.atan2(targetVector.y, targetVector.x) - Math.atan2(toolVector.y, toolVector.x);
        const rotatedStart = rotatePoint(toolFirst.from, radians);
        const translation = {
            x: targetFirst.from.x - rotatedStart.x,
            y: targetFirst.from.y - rotatedStart.y
        };
        const transform = (point: Point): Point => {
            const rotated = rotatePoint(point, radians);
            return { x: rotated.x + translation.x, y: rotated.y + translation.y };
        };

        let totalError = 0;
        let valid = true;

        for (let i = 0; i < count; i++) {
            const source = toolContour[i];
            const target = targetContour[(offset + i) % count];

            if (source.segment.type !== target.segment.type) {
                valid = false;
                break;
            }

            const startError = distance(transform(source.from), target.from);
            const endError = distance(transform(source.to), target.to);
            totalError += startError + endError;

            if (startError > tolerance || endError > tolerance) {
                valid = false;
                break;
            }

            if (source.segment.type === 'arc') {
                if (!source.segment.center || !target.segment.center ||
                    source.segment.radius === undefined || target.segment.radius === undefined) {
                    valid = false;
                    break;
                }

                const centerError = distance(transform(source.segment.center), target.segment.center);
                const radiusError = Math.abs(source.segment.radius - target.segment.radius);
                const sourceSweep = arcSweep(source.segment);
                const targetSweep = arcSweep(target.segment);

                if (centerError > tolerance || radiusError > tolerance ||
                    sourceSweep === null || targetSweep === null ||
                    Math.abs(sourceSweep - targetSweep) > 0.1) {
                    valid = false;
                    break;
                }
                totalError += centerError + radiusError;
            }
        }

        if (valid && (!best || totalError < best.error)) {
            const toolCenter = transform({ x: tool.width / 2, y: tool.height / 2 });
            best = {
                x: toolCenter.x,
                y: toolCenter.y,
                rotation: (radians * 180 / Math.PI + 360) % 360,
                error: totalError
            };
        }
    }

    return best;
};

const getToolContour = (tool: Tool): OrderedContourSegment[] | null => {
    if (!tool.customGeometry?.length || !Number.isFinite(tool.width) || !Number.isFinite(tool.height)) {
        return null;
    }

    const toolGeometry = getGeometryFromEntities({
        geometry: {
            entities: tool.customGeometry,
            width: tool.width,
            height: tool.height,
            bbox: { minX: 0, minY: 0, maxX: tool.width, maxY: tool.height }
        }
    } as Part);

    if (!toolGeometry) return null;

    const toolLoops = findClosedLoops(toolGeometry.segments);
    // Reject open, disconnected, or multi-contour tool definitions rather than guessing.
    if (toolLoops.length !== 1 || toolLoops[0].segmentIndices.length !== toolGeometry.segments.length) {
        return null;
    }

    return orderClosedContour(toolGeometry.segments, toolLoops[0].segmentIndices);
};

export const hasUsableSpecialToolGeometry = (tool: Tool): boolean =>
    getToolContour(tool) !== null;

/**
 * Finds an exact rigid (rotation + translation, no scaling or mirroring) match
 * between a Special tool's stored DXF contour and one closed part contour.
 */
export const matchSpecialToolContour = (
    tool: Tool,
    targetSegments: Segment[],
    targetSegmentIndices: number[],
    tolerance: number = TOLERANCE.MATCH
): SpecialToolMatch | null => {
    const toolContour = getToolContour(tool);
    const targetContour = orderClosedContour(targetSegments, targetSegmentIndices);
    if (!toolContour || !targetContour) return null;

    const forwardMatch = matchOrderedContours(toolContour, targetContour, tool, tolerance);
    if (forwardMatch) return forwardMatch;

    return matchOrderedContours(toolContour, reverseContour(targetContour), tool, tolerance);
};
