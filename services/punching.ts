
import { PartGeometry, PlacedTool, Tool, Point, NibbleSettings, DestructSettings, AutoPunchSettings, TurretLayout, ToolShape, TeachCycle, Part } from '../types';
import { generateId } from '../utils/helpers';
import { isPointInsideContour, getGeometryFromEntities } from './geometry';
import { findTeachCycleMatches } from './teachLogic';

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

// Helper: Normalize point from DXF coordinates to Canvas coordinates (SVG Y-Down)
// FIX: Removed Y-inversion. Now maps strictly by offset.
const normalizePoint = (p: Point, height: number, bbox: { minX: number, minY: number }) => ({
    x: p.x - bbox.minX,
    y: p.y - bbox.minY
});

/**
 * Denormalize point from SVG coordinates back to Raw DXF coordinates for geometric checks.
 * FIX: Removed Y-inversion. Now maps strictly by offset.
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
    punchOffset: number // Perpendicular offset from the line
): Omit<PlacedTool, 'id'>[] => {
    const punches: Omit<PlacedTool, 'id'>[] = [];
    const lineGroupId = `manual_nibble_${generateId()}`;
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return [];
    
    const ux = dx / length;
    const uy = dy / length;
    
    // Normal vector to the line
    const nx = -uy;
    const ny = ux;

    // Manual nibble always uses explicit extension settings
    const extensionStart = settings.extensionStart;
    const extensionEnd = settings.extensionEnd;
    
    const effectiveLength = length + extensionStart + extensionEnd;

    // Determine tool dimensions in the rotated frame
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
    
    // Calculate start center position with extension and offset
    const halfProj = toolLength / 2;
    // Adjust start for extension
    const startX = p1.x - ux * extensionStart;
    const startY = p1.y - uy * extensionStart;

    // Apply offset perpendicular to the line direction
    const firstCenterX = startX + ux * halfProj + nx * punchOffset;
    const firstCenterY = startY + uy * halfProj + ny * punchOffset;
    
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

    // 2. Teach Cycles Application
    // We apply Teach Cycles FIRST. Any geometry segment (line/arc) that is matched by a cycle
    // is added to `coveredIndices` and will be EXCLUDED from the standard auto-punching loop below.
    if (settings.useTeachCycles && teachCycles && teachCycles.length > 0) {
        const matches = findTeachCycleMatches(processed, teachCycles);
        matches.matches.forEach(p => punches.push(p));
        matches.coveredSegmentIndices.forEach(i => coveredIndices.add(i));
    }

    // 3. Filter Tools
    let availableTools = tools;
    if (settings.toolSourceType === 'turret' && settings.turretLayoutId) {
        const layout = turretLayouts.find(l => l.id === settings.turretLayoutId);
        if (layout) {
            availableTools = layout.toolsSnapshot.filter(t => !!t.stationNumber);
        }
    }

    // 4. Iterate Segments (Standard Auto-Punch)
    // Iterate explicitly to handle exclusion cleanly
    for (let idx = 0; idx < processed.segments.length; idx++) {
        const seg = processed.segments[idx];

        // EXCLUSION LOGIC: If segment was handled by Teach Cycle, skip it entirely.
        if (coveredIndices.has(idx)) {
            continue;
        }

        if (seg.type === 'line') {
            const candidates = getPreferredTools('line', 0, availableTools);
            if (candidates.length === 0) continue;
            const tool = candidates[0];

            const dx = seg.p2.x - seg.p1.x;
            const dy = seg.p2.y - seg.p1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            // Determine Offset for Outside
            // Probe + and - normal
            const perpOffset = (tool.shape === ToolShape.Circle ? tool.width : tool.height) / 2;
            
            // Normalized vector
            const ux = dx/len; const uy = dy/len;
            const nx = -uy; const ny = ux;
            
            const midX = (seg.p1.x + seg.p2.x)/2;
            const midY = (seg.p1.y + seg.p2.y)/2;
            
            const testP = { x: midX + nx * perpOffset * 1.1, y: midY + ny * perpOffset * 1.1 };
            const rawTestP = denormalizePoint(testP, geometry.height, geometry.bbox);
            
            // If Probe is Inside Material -> we want the OTHER side (-1)
            // If Probe is Outside Material -> we want THIS side (+1)
            const isInside = isPointInsideContour(rawTestP, geometry);
            const sign = isInside ? -1 : 1;
            
            const segmentPunches = generateNibblePunches(
                seg.p1, 
                seg.p2, 
                tool, 
                {
                    extensionStart: settings.extension,
                    extensionEnd: settings.extension,
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
            const candidates = getPreferredTools('circle', 0, availableTools);
            if (candidates.length === 0) continue;
            const tool = candidates[0];
            const r = seg.radius || 0;
            const center = seg.center || {x:0,y:0};
            
            if (r <= 0) continue;

            // Arc Nibbling
            const ang1 = Math.atan2(seg.p1.y - center.y, seg.p1.x - center.x);
            let ang2 = Math.atan2(seg.p2.y - center.y, seg.p2.x - center.x);
            
            // Determine probe direction based on mid-point of chord/arc
            let diff = ang2 - ang1;
            // Normalize angular difference
            if (diff < -Math.PI) diff += 2 * Math.PI;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            
            const midAng = ang1 + diff / 2;
            
            const probeR = r + 0.1; // Just outside R
            const probeX = center.x + probeR * Math.cos(midAng);
            const probeY = center.y + probeR * Math.sin(midAng);
            
            const rawProbe = denormalizePoint({x: probeX, y: probeY}, geometry.height, geometry.bbox);
            const isProbeInMaterial = isPointInsideContour(rawProbe, geometry);
            
            // If "outside" (R+) is in material -> We must punch "inside" (R-) -> Hole
            // If "outside" (R+) is NOT in material -> We punch "outside" (R+) -> Contour
            const punchRadius = isProbeInMaterial ? (r - tool.width/2) : (r + tool.width/2);
            
            if (punchRadius <= 0) continue; // Tool too big for hole

            const stepLen = calculateScallopStep(tool.width/2, settings.scallopHeight);
            const angularStep = stepLen / punchRadius;
            
            const steps = Math.ceil(Math.abs(diff) / angularStep);
            const realStep = diff / steps;
            
            for(let i=0; i<=steps; i++) {
                const a = ang1 + i * realStep;
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
