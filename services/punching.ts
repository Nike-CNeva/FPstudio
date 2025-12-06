
import { PartGeometry, PlacedTool, Tool, Point, NibbleSettings, DestructSettings, AutoPunchSettings, TurretLayout, ToolShape, TeachCycle, Part } from '../types';
import { generateId } from '../utils/helpers';
import { isPointInsideContour, getGeometryFromEntities, findClosedLoops, getOuterLoopIndices, Segment } from './geometry';
import { findTeachCycleMatches } from './teachLogic';

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

/**
 * Denormalize point from SVG coordinates back to Raw DXF coordinates for geometric checks.
 * Maps strictly by offset.
 */
const denormalizePoint = (p: Point, height: number, bbox: { minX: number, minY: number }) => ({
    x: p.x + bbox.minX,
    y: p.y + bbox.minY
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
 * Advanced Tool Selection - Returns prioritized list of candidates.
 * For Lines: Prioritizes tools that fit within the dimension to allow for micro-joints.
 */
const getPreferredTools = (
    type: 'line' | 'circle' | 'rect' | 'oblong',
    dim1: number, // Length/Diameter/Width
    dim2: number, // Height (if rect/oblong)
    tools: Tool[],
    tolerance: number = 0.2
): Tool[] => {
    let candidates = [...tools];

    if (type === 'line') {
        // Filter for straight edge tools
        candidates = candidates.filter(t => [ToolShape.Rectangle, ToolShape.Square, ToolShape.Oblong].includes(t.shape));
        
        candidates.sort((a, b) => {
            // 1. Shape Priority (Rect > Square > Oblong)
            const scoreShape = (t: Tool) => {
                if (t.shape === ToolShape.Rectangle) return 3;
                if (t.shape === ToolShape.Square) return 2;
                return 1;
            };
            const sA = scoreShape(a);
            const sB = scoreShape(b);
            if (sA !== sB) return sB - sA;

            // 2. Size Fitness vs Dimension
            const lenA = Math.max(a.width, a.height);
            const lenB = Math.max(b.width, b.height);

            if (dim1 > 0) {
                const fitsA = lenA <= (dim1 + tolerance);
                const fitsB = lenB <= (dim1 + tolerance);

                if (fitsA && !fitsB) return -1;
                if (!fitsA && fitsB) return 1;

                if (fitsA && fitsB) {
                    const isExactA = Math.abs(lenA - dim1) <= tolerance;
                    const isExactB = Math.abs(lenB - dim1) <= tolerance;
                    if (isExactA && !isExactB) return -1;
                    if (!isExactA && isExactB) return 1;
                    return lenB - lenA; 
                } else {
                    return lenA - lenB;
                }
            }
            return lenB - lenA;
        });
    } else if (type === 'circle') {
        candidates = candidates.filter(t => t.shape === ToolShape.Circle);
        if (dim1 > 0) {
            candidates = candidates.filter(t => Math.abs(t.width - dim1) <= tolerance);
        }
        candidates.sort((a, b) => Math.abs(a.width - dim1) - Math.abs(b.width - dim1)); // Best match first
    } else if (type === 'rect' || type === 'oblong') {
        const targetShape = type === 'rect' ? [ToolShape.Rectangle, ToolShape.Square] : [ToolShape.Oblong];
        candidates = candidates.filter(t => targetShape.includes(t.shape));
        
        // Exact match check (considering 90deg rotation)
        candidates = candidates.filter(t => {
            const matchNormal = Math.abs(t.width - dim1) <= tolerance && Math.abs(t.height - dim2) <= tolerance;
            const matchRotated = Math.abs(t.height - dim1) <= tolerance && Math.abs(t.width - dim2) <= tolerance;
            return matchNormal || matchRotated;
        });
        
        // Prioritize by fit closeness
        candidates.sort((a, b) => {
            const diffA = Math.min(Math.abs(a.width - dim1) + Math.abs(a.height - dim2), Math.abs(a.height - dim1) + Math.abs(a.width - dim2));
            const diffB = Math.min(Math.abs(b.width - dim1) + Math.abs(b.height - dim2), Math.abs(b.height - dim1) + Math.abs(b.width - dim2));
            return diffA - diffB;
        });
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
    const lineGroupId = `nibble_${generateId()}`;
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return [];
    
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;

    const extensionStart = settings.extensionStart;
    const extensionEnd = settings.extensionEnd;
    
    // Effective punching length
    const effectiveLength = length + extensionStart + extensionEnd;

    // If negative extensions (micro-joints) consume the whole line, skip
    if (effectiveLength <= 0.1) return [];

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
    const halfProj = toolLength / 2;
    
    // Start position calculations
    // Start is at P1 adjusted by extensionStart
    // If extensionStart is negative (micro-joint), we start INSIDE the line.
    const startX = p1.x - ux * extensionStart;
    const startY = p1.y - uy * extensionStart;

    const firstCenterX = startX + ux * halfProj + nx * punchOffset;
    const firstCenterY = startY + uy * halfProj + ny * punchOffset;
    
    let actualHits = 1;
    let adjustedStep = 0;
    let startDist = 0;

    const travelLength = effectiveLength - toolLength;

    if (travelLength <= 0) {
        // If tool fits once or overlaps bounds slightly, center it in effective area
        startDist = (effectiveLength / 2) - halfProj;
        actualHits = 1;
    } else {
        actualHits = Math.ceil(travelLength / step) + 1;
        adjustedStep = travelLength / (actualHits - 1);
    }

    for(let i=0; i<actualHits; i++) {
        const dist = startDist + i * adjustedStep;
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

/**
 * Pre-scans geometry for recognizable shapes (Rectangles, Oblongs, Circles) 
 * that match available tools exactly.
 */
const detectAndPunchShapes = (
    geometry: PartGeometry,
    processed: any,
    tools: Tool[],
    settings: AutoPunchSettings,
    coveredIndices: Set<number>
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const entities = geometry.entities || [];
    const bbox = geometry.bbox;

    // Normalization helper (same as in geometry.ts)
    const normalize = (p: Point) => ({ x: p.x - bbox.minX, y: p.y - bbox.minY });

    entities.forEach((entity) => {
        if (entity.type === 'CIRCLE') {
            const d = entity.radius * 2;
            const matches = getPreferredTools('circle', d, 0, tools, settings.toleranceRound);
            if (matches.length > 0) {
                const center = normalize(entity.center);
                punches.push({ toolId: matches[0].id, x: center.x, y: center.y, rotation: 0 });
                processed.segments.forEach((seg: any, idx: number) => {
                    if (seg.originalEntity === entity) coveredIndices.add(idx);
                });
            }
        } else if (entity.type === 'LWPOLYLINE' && entity.closed) {
            const v = entity.vertices;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            v.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });
            const w = maxX - minX;
            const h = maxY - minY;
            const center = normalize({ x: (minX + maxX)/2, y: (minY + maxY)/2 });

            const isAxisAligned = v.every(p => (Math.abs(p.x - minX) < 0.01 || Math.abs(p.x - maxX) < 0.01) && (Math.abs(p.y - minY) < 0.01 || Math.abs(p.y - maxY) < 0.01));

            if (isAxisAligned) {
                const rectMatches = getPreferredTools('rect', w, h, tools, settings.toleranceRectLength);
                if (rectMatches.length > 0) {
                    const tool = rectMatches[0];
                    let rot = 0;
                    if (Math.abs(tool.width - h) < 0.1 && Math.abs(tool.height - w) < 0.1) rot = 90;
                    punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: rot });
                    processed.segments.forEach((seg: any, idx: number) => { if (seg.originalEntity === entity) coveredIndices.add(idx); });
                    return;
                }
            }

            const oblongMatches = getPreferredTools('oblong', w, h, tools, settings.toleranceRound); 
            if (oblongMatches.length > 0) {
                const tool = oblongMatches[0];
                let rot = 0;
                if (Math.abs(tool.width - h) < 0.1 && Math.abs(tool.height - w) < 0.1) rot = 90;
                punches.push({ toolId: tool.id, x: center.x, y: center.y, rotation: rot });
                processed.segments.forEach((seg: any, idx: number) => { if (seg.originalEntity === entity) coveredIndices.add(idx); });
                return;
            }
        }
    });

    return punches;
};

const detectLoopTools = (
    processed: any,
    tools: Tool[],
    settings: AutoPunchSettings,
    coveredIndices: Set<number>
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const loops = findClosedLoops(processed.segments);

    loops.forEach(loop => {
        if (loop.segmentIndices.some(idx => coveredIndices.has(idx))) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        loop.vertices.forEach(v => {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        });

        loop.segmentIndices.forEach(idx => {
            const seg = processed.segments[idx];
            if (seg.type === 'arc' && seg.center && seg.radius) {
                const cx = seg.center.x; const cy = seg.center.y; const r = seg.radius;
                const check = (ax: number, ay: number) => {
                    if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
                    if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
                }
                check(cx - r, cy); check(cx + r, cy);
                check(cx, cy - r); check(cx, cy + r);
            }
        });

        const w = maxX - minX;
        const h = maxY - minY;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const oblongMatches = getPreferredTools('oblong', w, h, tools, settings.toleranceRound);
        if (oblongMatches.length > 0) {
            const tool = oblongMatches[0];
            let rot = 0;
            const match0 = Math.abs(tool.width - w) < settings.toleranceRound && Math.abs(tool.height - h) < settings.toleranceRound;
            const match90 = Math.abs(tool.width - h) < settings.toleranceRound && Math.abs(tool.height - w) < settings.toleranceRound;

            if (match0 || match90) {
                if (match90) rot = 90;
                punches.push({ toolId: tool.id, x: cx, y: cy, rotation: rot });
                loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                return; 
            }
        }

        const rectMatches = getPreferredTools('rect', w, h, tools, settings.toleranceRectLength);
        if (rectMatches.length > 0) {
            const tool = rectMatches[0];
            let rot = 0;
            const match0 = Math.abs(tool.width - w) < settings.toleranceRectLength && Math.abs(tool.height - h) < settings.toleranceRectWidth;
            const match90 = Math.abs(tool.width - h) < settings.toleranceRectLength && Math.abs(tool.height - w) < settings.toleranceRectWidth;

            if (match0 || match90) {
                if (match90) rot = 90;
                punches.push({ toolId: tool.id, x: cx, y: cy, rotation: rot });
                loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                return;
            }
        }

        if (Math.abs(w - h) < 0.1) {
            const circleMatches = getPreferredTools('circle', w, 0, tools, settings.toleranceRound);
            if (circleMatches.length > 0) {
                const tool = circleMatches[0];
                if (Math.abs(tool.width - w) < settings.toleranceRound) {
                    punches.push({ toolId: tool.id, x: cx, y: cy, rotation: 0 });
                    loop.segmentIndices.forEach(idx => coveredIndices.add(idx));
                    return;
                }
            }
        }
    });

    return punches;
};

export const generateContourPunches = (
    geometry: PartGeometry,
    tools: Tool[],
    settings: AutoPunchSettings,
    turretLayouts: TurretLayout[],
    teachCycles: TeachCycle[]
): Omit<PlacedTool, 'id'>[] => {
    // 1. Process Geometry
    const processed = getGeometryFromEntities({ geometry } as Part); 
    if (!processed) return [];

    const punches: Omit<PlacedTool, 'id'>[] = [];
    const coveredIndices = new Set<number>();
    const placedSingleHits = new Set<string>();
    const getHitKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const getPointKey = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

    // 2. Identify Outer Contour Indices
    const outerLoopIndices = getOuterLoopIndices(processed.segments);

    // 3. Topology-Aware Micro-Joints Classification
    const jointVertices = new Set<string>();

    if (settings.microJointsEnabled && outerLoopIndices.size > 0) {
        // Build Vertex Adjacency for Outer Loop
        const vertexMap = new Map<string, number[]>();
        outerLoopIndices.forEach(idx => {
            const s = processed.segments[idx];
            const k1 = getPointKey(s.p1);
            const k2 = getPointKey(s.p2);
            if(!vertexMap.has(k1)) vertexMap.set(k1, []);
            if(!vertexMap.has(k2)) vertexMap.set(k2, []);
            vertexMap.get(k1)!.push(idx);
            vertexMap.get(k2)!.push(idx);
        });

        const { minX, minY, maxX, maxY } = processed.bbox;
        const TOL = 1.0;
        const isLimit = (seg: Segment) => {
            const onMinX = Math.abs(seg.p1.x - minX) < TOL && Math.abs(seg.p2.x - minX) < TOL;
            const onMaxX = Math.abs(seg.p1.x - maxX) < TOL && Math.abs(seg.p2.x - maxX) < TOL;
            const onMinY = Math.abs(seg.p1.y - minY) < TOL && Math.abs(seg.p2.y - minY) < TOL;
            const onMaxY = Math.abs(seg.p1.y - maxY) < TOL && Math.abs(seg.p2.y - maxY) < TOL;
            return onMinX || onMaxX || onMinY || onMaxY;
        };

        // Evaluate each vertex
        vertexMap.forEach((segIndices, pointKey) => {
            if (segIndices.length !== 2) return;

            const s1 = processed.segments[segIndices[0]];
            const s2 = processed.segments[segIndices[1]];

            const s1Limit = isLimit(s1);
            const s2Limit = isLimit(s2);

            // A vertex is a "Cutout Vertex" if it transitions from Limit to Non-Limit (or vice-versa)
            const isCutout = s1Limit !== s2Limit;

            // Simple logic: Flag potential joint vertices.
            // Actual application is filtered in Step 7 by segment orientation.
            if (s1Limit || s2Limit || isCutout) {
                jointVertices.add(pointKey);
            }
        });
    }

    // 4. Teach Cycles
    if (settings.useTeachCycles && teachCycles && teachCycles.length > 0) {
        const matches = findTeachCycleMatches(processed, teachCycles);
        matches.matches.forEach(p => punches.push(p));
        matches.coveredSegmentIndices.forEach(i => coveredIndices.add(i));
    }

    // 5. Filter Tools
    let availableTools = tools;
    if (settings.toolSourceType === 'turret' && settings.turretLayoutId) {
        const layout = turretLayouts.find(l => l.id === settings.turretLayoutId);
        if (layout) {
            availableTools = layout.toolsSnapshot.filter(t => !!t.stationNumber);
        }
    }

    // 6. Detect Shapes & Loops
    const shapePunches = detectAndPunchShapes(geometry, processed, availableTools, settings, coveredIndices);
    punches.push(...shapePunches);
    const loopPunches = detectLoopTools(processed, availableTools, settings, coveredIndices);
    punches.push(...loopPunches);

    // 7. Process Remaining Segments
    for (let idx = 0; idx < processed.segments.length; idx++) {
        if (coveredIndices.has(idx)) continue;
        const seg = processed.segments[idx];

        // --- Joint Logic Application ---
        let extStart = settings.extension;
        let extEnd = settings.extension;

        // Only apply joints to outer loop segments
        if (outerLoopIndices.has(idx)) {
            const { minX, minY, maxX, maxY } = processed.bbox;
            const TOL = 1.0;
            const isHorz = Math.abs(seg.p1.y - seg.p2.y) < TOL;
            const isVert = Math.abs(seg.p1.x - seg.p2.x) < TOL;
            
            // Check if segment is on boundary (Limit Segment)
            const onLeft = Math.abs(seg.p1.x - minX) < TOL && Math.abs(seg.p2.x - minX) < TOL;
            const onRight = Math.abs(seg.p1.x - maxX) < TOL && Math.abs(seg.p2.x - maxX) < TOL;
            const onTop = Math.abs(seg.p1.y - maxY) < TOL && Math.abs(seg.p2.y - maxY) < TOL;
            const onBottom = Math.abs(seg.p1.y - minY) < TOL && Math.abs(seg.p2.y - minY) < TOL;
            const isLimitSeg = onLeft || onRight || onTop || onBottom;

            let allowJoint = false;
            
            if (settings.microJointType === 'all') {
                // In 'All' mode, joints only on Limit lines.
                // This prevents joints on internal notches ("cutouts in corners")
                allowJoint = isLimitSeg; 
            } else if (settings.microJointType === 'vertical') {
                // Vertical Only: Must be Limit Segment AND Vertical
                allowJoint = isLimitSeg && isVert;
            } else if (settings.microJointType === 'horizontal') {
                // Horizontal Only: Must be Limit Segment AND Horizontal
                allowJoint = isLimitSeg && isHorz;
            }

            if (allowJoint) {
                // If allowed, check if vertices are flagged
                if (jointVertices.has(getPointKey(seg.p1))) extStart = -settings.microJointLength;
                if (jointVertices.has(getPointKey(seg.p2))) extEnd = -settings.microJointLength;
            }
        }

        if (seg.type === 'line') {
            const dx = seg.p2.x - seg.p1.x;
            const dy = seg.p2.y - seg.p1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            
            const candidates = getPreferredTools('line', len, 0, availableTools);
            if (candidates.length === 0) continue;
            const tool = candidates[0];

            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            const perpOffset = (tool.shape === ToolShape.Circle ? tool.width : tool.height) / 2;
            const ux = dx/len; const uy = dy/len;
            const nx = -uy; const ny = ux;
            
            const midX = (seg.p1.x + seg.p2.x)/2;
            const midY = (seg.p1.y + seg.p2.y)/2;
            
            const testP = { x: midX + nx * perpOffset * 1.1, y: midY + ny * perpOffset * 1.1 };
            const rawTestP = denormalizePoint(testP, geometry.height, geometry.bbox);
            
            const isInside = isPointInsideContour(rawTestP, geometry);
            const sign = isInside ? -1 : 1;
            
            const segmentPunches = generateNibblePunches(
                seg.p1, 
                seg.p2, 
                tool, 
                {
                    extensionStart: extStart,
                    extensionEnd: extEnd,
                    minOverlap: settings.overlap,
                    hitPointMode: 'offset',
                    toolPosition: 'long'
                },
                angle,
                false,
                angle, 
                perpOffset * sign
            );
            punches.push(...segmentPunches);

        } else if (seg.type === 'arc') {
            const r = seg.radius || 0;
            const center = seg.center || {x:0,y:0};
            if (r <= 0) continue;

            const diam = r * 2;
            const ang1 = Math.atan2(seg.p1.y - center.y, seg.p1.x - center.x);
            let ang2 = Math.atan2(seg.p2.y - center.y, seg.p2.x - center.x);
            
            let diff = ang2 - ang1;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            
            const midAng = ang1 + diff / 2;
            const probeR = r + 0.1;
            const probeX = center.x + probeR * Math.cos(midAng);
            const probeY = center.y + probeR * Math.sin(midAng);
            const rawProbe = denormalizePoint({x: probeX, y: probeY}, geometry.height, geometry.bbox);
            const isProbeInMaterial = isPointInsideContour(rawProbe, geometry);
            
            // Single Hit Check
            const exactTools = getPreferredTools('circle', diam, 0, availableTools, settings.toleranceRound);
            if (exactTools.length > 0) {
                const bestTool = exactTools[0];
                if (Math.abs(bestTool.width - diam) <= settings.toleranceRound) {
                    const k = getHitKey(center.x, center.y);
                    if (!placedSingleHits.has(k)) {
                        punches.push({
                            toolId: bestTool.id,
                            x: center.x,
                            y: center.y,
                            rotation: 0
                        });
                        placedSingleHits.add(k);
                    }
                    continue; 
                }
            }

            // Nibble
            let nibbleCandidates = availableTools.filter(t => t.shape === ToolShape.Circle);
            if (isProbeInMaterial) {
                nibbleCandidates = nibbleCandidates.filter(t => (t.width / 2) < (r - 0.1));
            }
            nibbleCandidates.sort((a,b) => b.width - a.width);
            
            if (nibbleCandidates.length === 0) continue; 
            
            const tool = nibbleCandidates[0];
            const punchRadius = isProbeInMaterial ? (r - tool.width/2) : (r + tool.width/2);
            
            if (punchRadius <= 0) continue; 

            // Arc Joint Logic (Angular Retraction)
            let activeDiff = Math.abs(diff);
            let activeAng1 = ang1;
            const isClosedCircle = Math.abs(diff) > (2 * Math.PI - 0.01);
            
            if (!isClosedCircle && outerLoopIndices.has(idx)) {
                let reduceStart = 0;
                let reduceEnd = 0;
                
                // Simplified joint check for arcs: only apply if joint is requested.
                // Arcs are rarely perfectly vertical/horizontal limits in the same way lines are,
                // but if they connect to joint vertices, we might want retraction.
                // For safety, we apply retraction if vertex is flagged, assuming user intent.
                // (Refining arc orientation is complex and usually handled by line logic for rectangular parts).
                
                const marginDist = settings.vertexTolerance;
                const marginAngle = marginDist / r; 

                if (jointVertices.has(getPointKey(seg.p1))) {
                    reduceStart = settings.microJointLength / r;
                } else {
                    reduceStart = marginAngle; 
                }

                if (jointVertices.has(getPointKey(seg.p2))) {
                    reduceEnd = settings.microJointLength / r;
                } else {
                    reduceEnd = marginAngle;
                }

                if (activeDiff <= (reduceStart + reduceEnd)) {
                    continue; 
                }
                
                const direction = diff > 0 ? 1 : -1;
                activeAng1 += direction * reduceStart;
                activeDiff -= (reduceStart + reduceEnd);
            }

            const stepLen = calculateScallopStep(tool.width/2, settings.scallopHeight);
            const angularStep = stepLen / punchRadius;
            
            const steps = Math.ceil(activeDiff / angularStep);
            const realStep = (diff > 0 ? activeDiff : -activeDiff) / steps;
            
            const adjustedSteps = isClosedCircle ? steps : steps;

            for(let i=0; i<=adjustedSteps; i++) {
                if (isClosedCircle && i === adjustedSteps) continue;
                const a = activeAng1 + i * realStep;
                punches.push({
                    toolId: tool.id,
                    x: center.x + punchRadius * Math.cos(a),
                    y: center.y + punchRadius * Math.sin(a),
                    rotation: 0
                });
            }
        }
    }

    return punches;
};
