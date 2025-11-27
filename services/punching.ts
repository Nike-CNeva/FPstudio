
import { PartGeometry, PlacedTool, Tool, Point, NibbleSettings, DestructSettings, AutoPunchSettings, TurretLayout, ToolShape, DxfEntity, TeachCycle } from '../types';
import { generateId } from '../utils/helpers';
import { isPointInsideContour, ProcessedGeometry } from './geometry';
import { findTeachCycleMatches } from './teachLogic';

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

// Helper: Normalize point from DXF coordinates to Canvas coordinates (SVG Y-Down)
const normalizePoint = (p: Point, height: number, bbox: { minX: number, minY: number }) => ({
    x: p.x - bbox.minX,
    y: height - (p.y - bbox.minY)
});

/**
 * Denormalize point from SVG coordinates back to Raw DXF coordinates for geometric checks.
 */
const denormalizePoint = (p: Point, height: number, bbox: { minX: number, minY: number }) => ({
    x: p.x + bbox.minX,
    y: bbox.minY + (height - p.y)
});

/**
 * Calculates optimal step size for nibbling an arc to maintain a maximum scallop height.
 */
const calculateScallopStep = (toolRadius: number, scallopHeight: number): number => {
    const R = toolRadius;
    const h = scallopHeight;
    
    if (h <= 0) return R; 
    
    const term = 2 * R * h - h * h;
    if (term <= 0) return R * 0.5; 
    
    return 2 * Math.sqrt(term);
};

/**
 * Checks if a tool placement intrudes into the part material.
 * Returns true if the tool cuts into material (Bad).
 * Returns false if the tool is in waste/empty space (Good).
 */
const isToolIntruding = (
    tool: Tool,
    x: number, // Center X (Normalized)
    y: number, // Center Y (Normalized)
    rotation: number,
    partGeometry: PartGeometry
): boolean => {
    const { height, bbox } = partGeometry;
    const rad = degreesToRadians(rotation);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Epsilon to prevent false positives on tangent boundaries.
    // We check points slightly INSIDE the tool boundary.
    // If these points are inside material, the tool is definitely intruding.
    const EPSILON = 0.05; 
    
    const checkPoint = (localX: number, localY: number): boolean => {
        // Rotate and translate to Normalized World
        const wx = x + (localX * cos - localY * sin);
        const wy = y + (localX * sin + localY * cos);
        
        // Denormalize to Raw DXF coords for geometry check
        const rawP = denormalizePoint({ x: wx, y: wy }, height, bbox);
        
        // isPointInsideContour returns TRUE if point is in Material
        return isPointInsideContour(rawP, partGeometry);
    };

    if (tool.shape === ToolShape.Circle) {
        // For Circle: Check Center and 4 Cardinal points at Radius - Epsilon
        if (checkPoint(0, 0)) return true;
        const r = (tool.width / 2) - EPSILON;
        // Check cardinal points relative to circle center (rotation doesn't strictly matter for circle, but good for consistency)
        if (checkPoint(r, 0)) return true;
        if (checkPoint(-r, 0)) return true;
        if (checkPoint(0, r)) return true;
        if (checkPoint(0, -r)) return true;

    } else if (tool.shape === ToolShape.Oblong) {
        // For Oblong: Check Center, Tips of caps, and Side midpoints
        const checkW = Math.max(0, (tool.width / 2) - EPSILON);
        const checkH = Math.max(0, (tool.height / 2) - EPSILON);

        if (checkPoint(checkW, 0)) return true;
        if (checkPoint(-checkW, 0)) return true;
        if (checkPoint(0, checkH)) return true;
        if (checkPoint(0, -checkH)) return true;
        if (checkPoint(0, 0)) return true;

    } else {
        // For Rect/Square: Check Center and 4 Corners
        const checkW = Math.max(0, (tool.width / 2) - EPSILON);
        const checkH = Math.max(0, (tool.height / 2) - EPSILON);

        if (checkPoint(checkW, checkH)) return true;
        if (checkPoint(checkW, -checkH)) return true;
        if (checkPoint(-checkW, checkH)) return true;
        if (checkPoint(-checkW, -checkH)) return true;
        if (checkPoint(0, 0)) return true;
    }

    return false;
};

/**
 * Advanced Tool Selection - Returns prioritized list of candidates
 */
const getPreferredTools = (
    type: 'line' | 'circle',
    dimension: number, // Length for line, Diameter for circle
    tools: Tool[]
): Tool[] => {
    let candidates = [...tools];

    if (type === 'line') {
        // Filter for straight edge tools
        candidates = candidates.filter(t => [ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape));
        
        candidates.sort((a, b) => {
            // Priority 1: Shape (Rect/Square > Oblong)
            // Rectangles and Squares provide cleaner edges for lines than Oblongs
            const isRectA = a.shape === ToolShape.Rectangle || a.shape === ToolShape.Square;
            const isRectB = b.shape === ToolShape.Rectangle || b.shape === ToolShape.Square;
            
            if (isRectA && !isRectB) return -1; // A comes first
            if (!isRectA && isRectB) return 1;  // B comes first

            // Priority 2: Size (Largest Dimension Descending)
            const maxDimA = Math.max(a.width, a.height);
            const maxDimB = Math.max(b.width, b.height);
            
            // Prefer larger tools for efficiency
            return maxDimB - maxDimA;
        });
    } else {
        // Circles
        candidates = candidates.filter(t => t.shape === ToolShape.Circle);
        // Sort: Diameter Descending
        candidates.sort((a, b) => b.width - a.width);
    }
    
    return candidates;
};

export const generateNibblePunches = (
    p1: Point,
    p2: Point,
    tool: Tool,
    settings: NibbleSettings,
    angle: number,
    wasNormalized: boolean,
    punchOrientation: number,
    punchOffset: number
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const lineGroupId = `manual_nibble_${generateId()}`;
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return [];
    
    const ux = dx / length;
    const uy = dy / length;
    
    // Manual nibble always uses explicit extension settings
    const extensionStart = settings.extensionStart;
    const extensionEnd = settings.extensionEnd;
    
    const effectiveLength = length + extensionStart + extensionEnd;

    const toolRad = degreesToRadians(punchOrientation);
    const lineRad = degreesToRadians(angle);
    const relativeAngle = Math.abs(lineRad - toolRad);
    
    let toolLength = 0;
    if (tool.shape === ToolShape.Circle) {
        toolLength = tool.width;
    } else {
        toolLength = tool.width * Math.abs(Math.cos(relativeAngle)) + tool.height * Math.abs(Math.sin(relativeAngle));
    }
    
    const step = Math.max(0.1, toolLength - settings.minOverlap);
    
    const offsetRad = lineRad + Math.PI / 2;
    const ox = Math.cos(offsetRad) * punchOffset;
    const oy = Math.sin(offsetRad) * punchOffset;
    
    const halfProj = toolLength / 2;
    // Adjust start for extension
    const startX = p1.x - ux * extensionStart;
    const startY = p1.y - uy * extensionStart;

    const firstCenterX = startX + ux * halfProj + ox;
    const firstCenterY = startY + uy * halfProj + oy;
    
    const travelLength = Math.max(0, effectiveLength - toolLength);
    const actualHits = travelLength > 0 ? Math.ceil(travelLength / step) + 1 : 1;
    const adjustedStep = actualHits > 1 ? travelLength / (actualHits - 1) : 0;

    for(let i=0; i<actualHits; i++) {
        const dist = i * adjustedStep;
        const px = firstCenterX + ux * dist;
        const py = firstCenterY + uy * dist;
        
        punches.push({
            toolId: tool.id,
            x: px,
            y: py,
            rotation: punchOrientation,
            lineId: lineGroupId
        });
    }
    
    return punches;
};

export const generateDestructPunches = (
    p1: Point,
    p2: Point,
    tool: Tool,
    settings: DestructSettings
): Omit<PlacedTool, 'id'>[] => {
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const groupID = `destruct_${generateId()}`;
    
    const toolW = tool.width;
    const toolH = tool.height;
    
    const stepX = Math.max(0.1, toolW - settings.overlap);
    const stepY = Math.max(0.1, toolH - settings.overlap);
    
    const travelX = Math.max(0, width - toolW);
    const travelY = Math.max(0, height - toolH);
    
    const countX = travelX > 0 ? Math.ceil(travelX / stepX) + 1 : 1;
    const countY = travelY > 0 ? Math.ceil(travelY / stepY) + 1 : 1;
    
    const adjStepX = countX > 1 ? travelX / (countX - 1) : 0;
    const adjStepY = countY > 1 ? travelY / (countY - 1) : 0;
    
    const startCenterX = minX + toolW / 2;
    const startCenterY = minY + toolH / 2;

    for(let r=0; r<countY; r++) {
        for(let c=0; c<countX; c++) {
            punches.push({
                toolId: tool.id,
                x: startCenterX + c * adjStepX,
                y: startCenterY + r * adjStepY,
                rotation: 0,
                lineId: groupID
            });
        }
    }
    
    return punches;
};

// --- Auto Punching Internal Types ---

interface ProcessSegment {
    type: 'LINE' | 'ARC' | 'CIRCLE';
    p1: Point;
    p2: Point; // For Circle, p1=p2=center, or arbitrary start/end
    originalEntity: any;
    radius?: number; // Helper for matching
    center?: Point;  // Helper for matching
}

// Helper to check neighbor coverage
const getProjectedCoverage = (
    vertex: Point,
    lineVector: Point, // Normalized vector pointing INTO the line
    neighborPunches: Omit<PlacedTool, 'id'>[],
    allTools: Tool[]
): number => {
    let maxCover = 0;

    for (const punch of neighborPunches) {
        const tool = allTools.find(t => t.id === punch.toolId);
        if (!tool) continue;

        const dx = punch.x - vertex.x;
        const dy = punch.y - vertex.y;
        const projection = dx * lineVector.x + dy * lineVector.y;
        
        const toolHalfSize = Math.max(tool.width, tool.height) / 2;
        const coverage = projection + toolHalfSize;
        
        if (coverage > maxCover) maxCover = coverage;
    }
    return maxCover;
};

/**
 * Generates punches for contouring.
 */
export const generateContourPunches = (
    partGeometry: PartGeometry, 
    allTools: Tool[], 
    settings: AutoPunchSettings,
    turretLayouts: TurretLayout[] | undefined,
    teachCycles: TeachCycle[] = []
): Omit<PlacedTool, 'id'>[] => {
    const { 
        toolSourceType,
        turretLayoutId,
        overlap, 
        extension,
        scallopHeight, 
        vertexTolerance,
        microJointsEnabled, 
        microJointLength, 
        microJointType,
        useTeachCycles
    } = settings;

    const punches: Omit<PlacedTool, 'id'>[] = [];

    // 1. Filter Tools
    let availableTools: Tool[] = [];
    if (toolSourceType === 'turret' && turretLayoutId && turretLayouts) {
        const layout = turretLayouts.find(l => l.id === turretLayoutId);
        if (layout) {
            availableTools = layout.toolsSnapshot.filter(t => t.stationNumber && t.stationNumber > 0);
        }
    } else {
        availableTools = allTools;
    }
    if (!availableTools || availableTools.length === 0) {
        return [];
    }

    const { height, bbox, entities } = partGeometry;

    // 2. Pre-process geometry into normalized segments
    const segments: ProcessSegment[] = [];

    entities.forEach(entity => {
        if (entity.type === 'LINE') {
            segments.push({
                type: 'LINE',
                p1: normalizePoint(entity.start, height, bbox),
                p2: normalizePoint(entity.end, height, bbox),
                originalEntity: entity
            });
        } else if (entity.type === 'LWPOLYLINE') {
            const verts = entity.vertices.map(v => normalizePoint(v, height, bbox));
            for (let i = 0; i < verts.length - 1; i++) {
                segments.push({ type: 'LINE', p1: verts[i], p2: verts[i+1], originalEntity: entity });
            }
            if (entity.closed) {
                segments.push({ type: 'LINE', p1: verts[verts.length-1], p2: verts[0], originalEntity: entity });
            }
        } else if (entity.type === 'ARC') {
             const d2r = Math.PI / 180;
             const startX = entity.center.x + entity.radius * Math.cos(entity.startAngle * d2r);
             const startY = entity.center.y + entity.radius * Math.sin(entity.startAngle * d2r);
             const endX = entity.center.x + entity.radius * Math.cos(entity.endAngle * d2r);
             const endY = entity.center.y + entity.radius * Math.sin(entity.endAngle * d2r);
             const center = normalizePoint(entity.center, height, bbox);

             segments.push({
                 type: 'ARC',
                 p1: normalizePoint({x: startX, y: startY}, height, bbox),
                 p2: normalizePoint({x: endX, y: endY}, height, bbox),
                 radius: entity.radius,
                 center: center,
                 originalEntity: entity
             });
        } else if (entity.type === 'CIRCLE') {
             const center = normalizePoint(entity.center, height, bbox);
             segments.push({
                 type: 'CIRCLE',
                 p1: center,
                 p2: center,
                 radius: entity.radius,
                 center: center,
                 originalEntity: entity
             });
        }
    });

    // 3. Calculate Geometry Bounds
    let geoMinX = Infinity, geoMaxX = -Infinity, geoMinY = Infinity, geoMaxY = -Infinity;
    
    if (segments.length > 0) {
        segments.forEach(seg => {
            const check = (p: Point) => {
                if (p.x < geoMinX) geoMinX = p.x;
                if (p.x > geoMaxX) geoMaxX = p.x;
                if (p.y < geoMinY) geoMinY = p.y;
                if (p.y > geoMaxY) geoMaxY = p.y;
            };
            check(seg.p1);
            check(seg.p2);
        });
    } else {
        return [];
    }

    // TRACKING STATE to avoid double punching
    const processedSegmentIndices = new Set<number>();
    const punchedHoleCenters = new Set<string>();
    const segmentPunchesMap = new Map<number, Omit<PlacedTool, 'id'>[]>();

    const recordPunch = (segIndex: number, newPunches: Omit<PlacedTool, 'id'>[]) => {
        punches.push(...newPunches);
        processedSegmentIndices.add(segIndex);
        if (!segmentPunchesMap.has(segIndex)) {
            segmentPunchesMap.set(segIndex, []);
        }
        segmentPunchesMap.get(segIndex)!.push(...newPunches);
    };

    // --- PHASE 0: TEACH CYCLES ---
    if (useTeachCycles && teachCycles.length > 0) {
        // Construct a temporary geometry object that matches the structure expected by findTeachCycleMatches
        const tempGeo: any = { segments: segments }; 
        const { matches, coveredSegmentIndices } = findTeachCycleMatches(tempGeo as ProcessedGeometry, teachCycles);
        
        // Add punches
        punches.push(...matches);
        
        // Mark segments as processed
        coveredSegmentIndices.forEach(idx => processedSegmentIndices.add(idx));
    }

    const TOL = 0.5; // Tolerance for checking if a segment is on the edge
    const MATCH_TOL = 0.1; // Tolerance for coordinate matching

    // 4. Identify Joint Vertices
    const jointVertices = new Set<string>();
    
    if (microJointsEnabled) {
        segments.forEach(seg => {
            if (seg.type !== 'LINE') return; 

            const onTop = Math.abs(seg.p1.y - geoMinY) < TOL && Math.abs(seg.p2.y - geoMinY) < TOL;
            const onBottom = Math.abs(seg.p1.y - geoMaxY) < TOL && Math.abs(seg.p2.y - geoMaxY) < TOL;
            const onLeft = Math.abs(seg.p1.x - geoMinX) < TOL && Math.abs(seg.p2.x - geoMinX) < TOL;
            const onRight = Math.abs(seg.p1.x - geoMaxX) < TOL && Math.abs(seg.p2.x - geoMaxX) < TOL;

            let shouldJoint = false;
            if (microJointType === 'all') {
                if (onTop || onBottom || onLeft || onRight) shouldJoint = true;
            } else if (microJointType === 'horizontal') {
                if (onTop || onBottom) shouldJoint = true;
            } else if (microJointType === 'vertical') {
                if (onLeft || onRight) shouldJoint = true;
            }

            if (shouldJoint) {
                jointVertices.add(`${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}`);
                jointVertices.add(`${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}`);
            }
        });
    }

    const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
    const tolSq = MATCH_TOL * MATCH_TOL;

    // 5. Generate Punches - PASS 1 (Standard)
    for (let i = 0; i < segments.length; i++) {
        if (processedSegmentIndices.has(i)) continue;

        const seg = segments[i];
        const lineGroupId = `auto_${generateId()}`;

        // --- LINE HANDLING ---
        if (seg.type === 'LINE') {
            const dx = seg.p2.x - seg.p1.x;
            const dy = seg.p2.y - seg.p1.y;
            const length = Math.sqrt(dx*dx + dy*dy);
            if (length <= 0.1) continue;

            const ux = dx / length;
            const uy = dy / length;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            const p1Key = `${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}`;
            const p2Key = `${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}`;
            const startIsJoint = jointVertices.has(p1Key);
            const endIsJoint = jointVertices.has(p2Key);

            // Determine Required Extensions based on Topology
            const probeDist = 0.5;
            
            // Check Start (P1)
            const probeP1 = { x: seg.p1.x - ux * probeDist, y: seg.p1.y - uy * probeDist };
            const isP1Blocked = isPointInsideContour(denormalizePoint(probeP1, height, bbox), partGeometry);
            
            // Check End (P2)
            const probeP2 = { x: seg.p2.x + ux * probeDist, y: seg.p2.y + uy * probeDist };
            const isP2Blocked = isPointInsideContour(denormalizePoint(probeP2, height, bbox), partGeometry);

            // Calculate Required Extensions
            let reqExt1 = 0;
            if (startIsJoint) reqExt1 = -microJointLength;
            else if (isP1Blocked) reqExt1 = 0;
            else reqExt1 = extension;

            let reqExt2 = 0;
            if (endIsJoint) reqExt2 = -microJointLength;
            else if (isP2Blocked) reqExt2 = 0;
            else reqExt2 = extension;

            // Target Punch Dimensions
            const targetLength = length + reqExt1 + reqExt2;

            if (targetLength <= 0) continue;

            // Offset calculation (Inside/Outside)
            const nx = -uy;
            const ny = ux;
            
            const midX = (seg.p1.x + seg.p2.x) / 2;
            const midY = (seg.p1.y + seg.p2.y) / 2;
            
            const sideProbeP = { x: midX + nx * probeDist, y: midY + ny * probeDist };
            const rawSideProbeP = denormalizePoint(sideProbeP, height, bbox);
            
            const isMaterialSide = isPointInsideContour(rawSideProbeP, partGeometry);
            const punchNx = isMaterialSide ? -nx : nx;
            const punchNy = isMaterialSide ? -ny : ny;

            const candidateTools = getPreferredTools('line', length, availableTools);
            
            for (const tool of candidateTools) {
                let toolRotation = angle;
                let toolWidthAlongLine = tool.width;
                let toolHeightNormal = tool.height;

                // Adjust tool dimension if it fits better rotated 90deg
                if (tool.width < tool.height) {
                    toolRotation += 90;
                    toolWidthAlongLine = tool.height;
                    toolHeightNormal = tool.width;
                }

                const offsetDist = toolHeightNormal / 2;
                const offsetX = punchNx * offsetDist;
                const offsetY = punchNy * offsetDist;

                // --- CASE A: SINGLE HIT (Includes Slot Logic) ---
                if (tool.shape === ToolShape.Oblong) {
                     // Special Slot logic for Oblongs
                     const major = Math.max(tool.width, tool.height);
                     const minor = Math.min(tool.width, tool.height);
                     const straightLen = major - minor;
                     
                     // Strict slot match
                     if (Math.abs(length - straightLen) <= 0.5) { // Fixed small tolerance for slot identification
                         const cx = midX + offsetX;
                         const cy = midY + offsetY;
                         if (!isToolIntruding(tool, cx, cy, toolRotation, partGeometry)) {
                             recordPunch(i, [{ toolId: tool.id, x: cx, y: cy, rotation: toolRotation, lineId: lineGroupId }]);
                             
                             // Clean up connected arcs logic (omitted for brevity, assume standard slot handling)
                             const radiusToFind = minor / 2;
                             const matchTolSq = MATCH_TOL * MATCH_TOL;
                             for (let j = 0; j < segments.length; j++) {
                                 if (i === j || processedSegmentIndices.has(j)) continue;
                                 const other = segments[j];
                                 if (other.type !== 'ARC') continue;
                                 if (Math.abs((other.radius || 0) - radiusToFind) > 0.5) continue;
                                 const d1 = distSq(other.p1, seg.p1), d2 = distSq(other.p2, seg.p1);
                                 const d3 = distSq(other.p1, seg.p2), d4 = distSq(other.p2, seg.p2);
                                 if (d1 < matchTolSq || d2 < matchTolSq || d3 < matchTolSq || d4 < matchTolSq) processedSegmentIndices.add(j);
                             }
                             break;
                         }
                     }
                     continue; 
                }
                
                // --- SINGLE HIT LOGIC (RECT/SQUARE) ---
                let allowableExtra1 = 0;
                let allowableExtra2 = 0;
                
                // Only Open ends allow over-travel. Joints and Blocked corners are strict.
                if (!startIsJoint && !isP1Blocked) allowableExtra1 = vertexTolerance;
                if (!endIsJoint && !isP2Blocked) allowableExtra2 = vertexTolerance;
                
                const minReqLength = targetLength;
                const maxAllowedLength = targetLength + allowableExtra1 + allowableExtra2;

                // Allow tiny epsilon for float comparison errors on "falling short"
                if (toolWidthAlongLine >= (minReqLength - 0.01) && toolWidthAlongLine <= maxAllowedLength) {
                    const distToTargetCenter = (-reqExt1 + length + reqExt2) / 2;
                    let finalDistFromP1 = distToTargetCenter;
                    const toolHalf = toolWidthAlongLine / 2;
                    
                    // If Start is strict (allowableExtra1 == 0), we cannot go left of (-reqExt1)
                    if (allowableExtra1 === 0) {
                        const minCenter = -reqExt1 + toolHalf;
                        if (finalDistFromP1 < minCenter) finalDistFromP1 = minCenter;
                    }
                    
                    // If End is strict (allowableExtra2 == 0), we cannot go right of (Length + reqExt2)
                    if (allowableExtra2 === 0) {
                        const maxCenter = length + reqExt2 - toolHalf;
                        if (finalDistFromP1 > maxCenter) finalDistFromP1 = maxCenter;
                    }

                    // Apply Final Position
                    const cx = seg.p1.x + ux * finalDistFromP1 + offsetX;
                    const cy = seg.p1.y + uy * finalDistFromP1 + offsetY;
                    
                    if (!isToolIntruding(tool, cx, cy, toolRotation, partGeometry)) {
                        recordPunch(i, [{
                            toolId: tool.id,
                            x: cx,
                            y: cy,
                            rotation: toolRotation,
                            lineId: lineGroupId
                        }]);
                        break;
                    }
                }

                // --- NIBBLING ---
                // Only if single hit failed
                
                // Nibbling start/end logic derived from required extensions
                const nibbleStart = -reqExt1; 
                const nibbleEnd = length + reqExt2;
                
                const toolHalfLen = toolWidthAlongLine / 2;
                const firstCenterPos = nibbleStart + toolHalfLen;
                const lastCenterPos = nibbleEnd - toolHalfLen;
                const centerDistance = lastCenterPos - firstCenterPos;

                if (centerDistance >= 0) {
                    const step = Math.max(0.5, toolWidthAlongLine - overlap);
                    const numHits = Math.ceil(centerDistance / step) + 1;
                    const adjustedStep = numHits > 1 ? centerDistance / (numHits - 1) : 0;
                    
                    const baseX = seg.p1.x + offsetX;
                    const baseY = seg.p1.y + offsetY;
                    
                    let validNibble = true;
                    const tempPunches = [];

                    for (let k = 0; k < numHits; k++) {
                        const distFromStart = firstCenterPos + (k * adjustedStep);
                        const px = baseX + ux * distFromStart;
                        const py = baseY + uy * distFromStart;

                        if (k === 0 || k === numHits - 1) {
                            if (isToolIntruding(tool, px, py, toolRotation, partGeometry)) {
                                validNibble = false;
                                break;
                            }
                        }
                        
                        tempPunches.push({ toolId: tool.id, x: px, y: py, rotation: toolRotation, lineId: lineGroupId });
                    }
                    
                    if (validNibble) {
                        recordPunch(i, tempPunches);
                        break; 
                    }
                }
            }
        }

        // --- ARC HANDLING ---
        else if (seg.type === 'ARC' || seg.type === 'CIRCLE') {
            const entity = seg.originalEntity;
            const center = normalizePoint(entity.center, height, bbox);
            const r = entity.radius;
            let startAngle = 0;
            let endAngle = 360;
            
            if (seg.type === 'ARC') {
                startAngle = entity.startAngle;
                endAngle = entity.endAngle;
                if (endAngle < startAngle) endAngle += 360;
            }

            const candidateTools = getPreferredTools('circle', r * 2, availableTools);
            if (candidateTools.length === 0) continue;

            const p1Key = `${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)}`;
            const p2Key = `${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)}`;
            const startIsJoint = jointVertices.has(p1Key);
            const endIsJoint = jointVertices.has(p2Key);

            for (const tool of candidateTools) {
                const toolRadius = tool.width / 2;
                const diameter = tool.width;

                // Strategy 1: Exact Match (Single Hit Center)
                if (Math.abs(diameter - (r * 2)) <= 0.5) {
                    const centerKey = `${center.x.toFixed(3)},${center.y.toFixed(3)}`;
                    if (punchedHoleCenters.has(centerKey)) break;

                    if (seg.type === 'CIRCLE' || (!startIsJoint && !endIsJoint)) {
                         if (!isToolIntruding(tool, center.x, center.y, 0, partGeometry)) {
                             const p = [{ toolId: tool.id, x: center.x, y: center.y, rotation: 0, lineId: lineGroupId }];
                             recordPunch(i, p);
                             punchedHoleCenters.add(centerKey);
                             
                             // Cleanup siblings
                             const radiusTol = 0.5;
                             const matchTolSq = MATCH_TOL * MATCH_TOL;
                             for (let j = 0; j < segments.length; j++) {
                                if (i === j || processedSegmentIndices.has(j)) continue;
                                const other = segments[j];
                                if (other.type !== 'ARC' && other.type !== 'CIRCLE') continue;
                                if (Math.abs((other.radius || 0) - r) > radiusTol) continue;
                                if (other.center && distSq(other.center, center) < matchTolSq) processedSegmentIndices.add(j);
                             }
                             break; 
                         }
                    }
                }

                // Strategy 2: Nibbling
                const testR = r + 0.5; 
                const midAngleRad = degreesToRadians((startAngle + endAngle) / 2);
                const testP = { 
                    x: center.x + testR * Math.cos(midAngleRad), 
                    y: center.y + testR * Math.sin(midAngleRad) 
                }; 
                const rawTestP = denormalizePoint(testP, height, bbox);
                
                const outsideIsMaterial = isPointInsideContour(rawTestP, partGeometry);
                
                let pathRadius = 0;
                if (outsideIsMaterial) {
                    pathRadius = r - toolRadius;
                } else {
                    pathRadius = r + toolRadius;
                }

                if (pathRadius <= 0) continue;

                const chordStep = calculateScallopStep(toolRadius, scallopHeight);
                const circumference = 2 * Math.PI * pathRadius;
                const angleStepDeg = (chordStep / circumference) * 360;

                let sweep = endAngle - startAngle;
                let currentStartAngle = startAngle;

                if (startIsJoint) {
                    const jointAngle = (microJointLength / circumference) * 360;
                    currentStartAngle += jointAngle;
                    sweep -= jointAngle;
                }
                if (endIsJoint) {
                    const jointAngle = (microJointLength / circumference) * 360;
                    sweep -= jointAngle;
                }

                if (sweep <= 0) continue;

                const numHits = Math.ceil(sweep / angleStepDeg);
                const actualAngleStep = sweep / numHits;
                
                let validArcNibble = true;
                const tempPunches = [];

                for (let k = 0; k <= numHits; k++) {
                    if (seg.type === 'CIRCLE' && !startIsJoint && !endIsJoint && k === numHits) continue;

                    const currentAngle = currentStartAngle + k * actualAngleStep;
                    const rad = degreesToRadians(currentAngle);
                    
                    const px = center.x + pathRadius * Math.cos(rad);
                    const py = center.y + pathRadius * Math.sin(rad);

                    if (isToolIntruding(tool, px, py, currentAngle, partGeometry)) {
                        validArcNibble = false;
                        break;
                    }
                    tempPunches.push({ toolId: tool.id, x: px, y: py, rotation: currentAngle, lineId: lineGroupId });
                }
                
                if (validArcNibble) {
                    recordPunch(i, tempPunches);
                    break;
                }
            }
        }
    }

    // 6. Generate Punches - PASS 2 (Lines that failed Pass 1)
    // Relax end conditions if corners are covered by neighbors
    for (let i = 0; i < segments.length; i++) {
        if (processedSegmentIndices.has(i)) continue; // Already done

        const seg = segments[i];
        if (seg.type !== 'LINE') continue;

        const dx = seg.p2.x - seg.p1.x;
        const dy = seg.p2.y - seg.p1.y;
        const length = Math.sqrt(dx*dx + dy*dy);
        const ux = dx / length;
        const uy = dy / length;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const lineGroupId = `auto_pass2_${generateId()}`;

        // Find neighbors
        let prevPunches: Omit<PlacedTool, 'id'>[] = [];
        let nextPunches: Omit<PlacedTool, 'id'>[] = [];

        for (let j = 0; j < segments.length; j++) {
            if (i === j) continue;
            const other = segments[j];
            const otherPunches = segmentPunchesMap.get(j) || [];
            if (otherPunches.length === 0) continue;

            if (distSq(other.p2, seg.p1) < tolSq || distSq(other.p1, seg.p1) < tolSq) {
                prevPunches = otherPunches;
            }
            if (distSq(other.p1, seg.p2) < tolSq || distSq(other.p2, seg.p2) < tolSq) {
                nextPunches = otherPunches;
            }
        }

        const startCoverage = getProjectedCoverage(seg.p1, {x: ux, y: uy}, prevPunches, availableTools);
        const endCoverage = getProjectedCoverage(seg.p2, {x: -ux, y: -uy}, nextPunches, availableTools);

        const startRelax = startCoverage > overlap ? startCoverage - overlap : 0;
        const endRelax = endCoverage > overlap ? endCoverage - overlap : 0;

        if (startRelax === 0 && endRelax === 0) continue;

        const reqLen = length - startRelax - endRelax;
        
        if (reqLen <= 0) continue;

        const probeDist = 0.5;
        const nx = -uy;
        const ny = ux;
        const midX = (seg.p1.x + seg.p2.x) / 2;
        const midY = (seg.p1.y + seg.p2.y) / 2;
        const sideProbeP = { x: midX + nx * probeDist, y: midY + ny * probeDist };
        const rawSideProbeP = denormalizePoint(sideProbeP, height, bbox);
        const isMaterialSide = isPointInsideContour(rawSideProbeP, partGeometry);
        const punchNx = isMaterialSide ? -nx : nx;
        const punchNy = isMaterialSide ? -ny : ny;

        const candidateTools = getPreferredTools('line', reqLen, availableTools);

        for (const tool of candidateTools) {
            let toolRotation = angle;
            let toolWidthAlongLine = tool.width;
            let toolHeightNormal = tool.height;

            if (tool.width < tool.height) {
                toolRotation += 90;
                toolWidthAlongLine = tool.height;
                toolHeightNormal = tool.width;
            }
            
            const offsetDist = toolHeightNormal / 2;
            const offsetX = punchNx * offsetDist;
            const offsetY = punchNy * offsetDist;

            // Strategy 2A: Single Hit (Gap Filling)
            if (toolWidthAlongLine >= (reqLen - 0.5)) {
                const gapCenterDist = (startRelax + (length - endRelax)) / 2;
                const cx = seg.p1.x + ux * gapCenterDist + offsetX;
                const cy = seg.p1.y + uy * gapCenterDist + offsetY;

                if (!isToolIntruding(tool, cx, cy, toolRotation, partGeometry)) {
                    recordPunch(i, [{
                        toolId: tool.id,
                        x: cx,
                        y: cy,
                        rotation: toolRotation,
                        lineId: lineGroupId
                    }]);
                    break;
                }
            } 
            // Strategy 2B: Nibbling (Gap Filling)
            else if (toolWidthAlongLine < reqLen) {
                const gapStart = startRelax;
                const gapEnd = length - endRelax;
                
                const toolHalf = toolWidthAlongLine / 2;
                const firstCenterPos = gapStart + toolHalf;
                const lastCenterPos = gapEnd - toolHalf;
                const centerDistance = lastCenterPos - firstCenterPos;

                if (centerDistance >= 0) {
                     const step = Math.max(0.5, toolWidthAlongLine - overlap);
                     const numHits = Math.ceil(centerDistance / step) + 1;
                     const adjustedStep = numHits > 1 ? centerDistance / (numHits - 1) : 0;
                     
                     const baseX = seg.p1.x + offsetX;
                     const baseY = seg.p1.y + offsetY;
                     
                     let validNibble = true;
                     const tempPunches = [];

                     for (let k = 0; k < numHits; k++) {
                         const distFromStart = firstCenterPos + (k * adjustedStep);
                         const px = baseX + ux * distFromStart;
                         const py = baseY + uy * distFromStart;
                         
                         if (isToolIntruding(tool, px, py, toolRotation, partGeometry)) {
                             validNibble = false;
                             break;
                         }
                         tempPunches.push({ toolId: tool.id, x: px, y: py, rotation: toolRotation, lineId: lineGroupId });
                     }

                     if (validNibble) {
                         recordPunch(i, tempPunches);
                         break; 
                     }
                }
            }
        }
    }

    return punches;
};
