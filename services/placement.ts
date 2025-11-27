import { Point, Tool, ToolShape, PlacementSide } from '../types';
import { SnapTarget } from './geometry';

/**
 * Extracts vertices from a tool's path definition or generates them for standard shapes.
 * Vertices are centered around (0,0).
 */
const getToolVertices = (tool: Tool): Point[] => {
    const w = tool.width;
    const h = tool.height;
    
    if (tool.shape === ToolShape.Special && tool.customPath) {
        // Parse SVG path "M x y L x y ..."
        // customPath is typically in 0..W, 0..H coordinates based on ToolDisplay logic (translated by -w/2, -h/2)
        // We will parse it and apply the center shift (-w/2, -h/2).
        
        const vertices: Point[] = [];
        const commands: string[] = tool.customPath.match(/([a-zA-Z])([^a-zA-Z]*)/g) || [];
        const shiftX = -w / 2;
        const shiftY = -h / 2;
        
        let startX = 0;
        let startY = 0;

        commands.forEach(cmd => {
            const type = cmd[0].toUpperCase();
            const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat);
            
            if (type === 'M') {
                const x = args[0] + shiftX;
                const y = args[1] + shiftY;
                vertices.push({x, y});
                startX = x;
                startY = y;
            } else if (type === 'L') {
                const x = args[0] + shiftX;
                const y = args[1] + shiftY;
                vertices.push({x, y});
            } else if (type === 'A') {
                // A rx ry rot large sweep x y
                // We approximate Arc by its endpoint for placement logic
                // (Assuming user aligns to chords/tangents defined by endpoints)
                const x = args[5] + shiftX;
                const y = args[6] + shiftY;
                vertices.push({x, y});
            } else if (type === 'Z') {
                 // Close path: usually connects back to M.
                 // We don't explicitly need to push start point again unless logic requires closed loop segments
            }
        });
        
        return vertices;
    } 
    
    // Standard Shapes (Rect/Square/Oblong as Box)
    // Vertices order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
    // This winding ensures the first segment (TL -> TR) has angle 0 (Horizontal, dx>0)
    // and corresponds to the Top Edge (y = -h/2).
    // This matches the winding of typical DXF-imported special tools, ensuring 
    // consistent "Active Face" detection and Inside/Outside placement logic.
    return [
        { x: -w/2, y: -h/2 },
        { x: w/2, y: -h/2 },
        { x: w/2, y: h/2 },
        { x: -w/2, y: h/2 }
    ];
};

/**
 * Calculates the final position and rotation for a tool to align with a contour edge.
 * Supports arbitrary tool shapes by analyzing the active face in the rotated frame.
 */
export const calculateEdgePlacement = (
    snapPoint: Point,
    snapAngle: number,
    tool: Tool,
    toolOrientation: number,
    offset: number = 0,
    snapTarget: SnapTarget,
    wasNormalized: boolean,
    placementSide: PlacementSide = PlacementSide.Outside
): { x: number, y: number, rotation: number } => {
    
    // 1. Calculate Final World Rotation
    // The tool is rotated by `toolOrientation` to align its active face to "Horizontal (0 deg)".
    // Then it is rotated by `snapAngle` to align that face with the contour.
    const finalRotation = snapAngle + toolOrientation;

    // 2. Get Tool Geometry
    const vertices = getToolVertices(tool);
    if (vertices.length === 0) return { x: snapPoint.x, y: snapPoint.y, rotation: finalRotation };

    // 3. Rotate vertices by `toolOrientation` to find the Active Face.
    // In this local rotated frame, the Active Face is the one with angle ~0 degrees (Horizontal, Left->Right).
    const rad = (toolOrientation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotatedVertices = vertices.map(v => ({
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos
    }));

    // 4. Identify Active Face (Segment with Angle ~ 0)
    // We look for a segment (v[i] -> v[i+1]) where deltaY ~ 0 and deltaX > 0.
    let bestFaceY = 0;
    let bestFaceMinX = 0;
    let bestFaceMaxX = 0;
    let foundFace = false;

    // Treat vertices as a closed loop
    const count = rotatedVertices.length;
    for (let i = 0; i < count; i++) {
        const p1 = rotatedVertices[i];
        const p2 = rotatedVertices[(i + 1) % count];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        
        // Check for horizontal, positive X direction (Angle 0)
        // Tolerance for float errors
        if (Math.abs(dy) < 0.001 && dx > 0) {
            // Found a candidate face. 
            bestFaceY = p1.y; // p1.y should be approx p2.y
            bestFaceMinX = p1.x;
            bestFaceMaxX = p2.x;
            foundFace = true;
            break; 
        }
    }

    if (!foundFace) {
        // Fallback strategy: Find the vertex with Max Y (Bottom-most in SVG) -> Should match Top Face?
        // If we switched winding, Top Face is at y = -h/2 (Min Y).
        // Angle 0 face should be detected above.
        // If not found, rely on finding Min Y for Top Edge (consistent with new winding).
        let minY = Infinity;
        rotatedVertices.forEach(v => {
            if (v.y < minY) minY = v.y;
        });
        
        bestFaceY = minY;
        
        // Find extent at this Y
        const faceVerts = rotatedVertices.filter(v => Math.abs(v.y - minY) < 0.001);
        if (faceVerts.length >= 1) {
             const xs = faceVerts.map(v => v.x);
             bestFaceMinX = Math.min(...xs);
             bestFaceMaxX = Math.max(...xs);
        } else {
            bestFaceMinX = 0;
            bestFaceMaxX = 0;
        }
    }

    // 5. Determine Local Contact Point on the Active Face
    let localContactX = 0;
    switch(snapTarget) {
        case 'start': 
            localContactX = bestFaceMinX; 
            break;
        case 'end': 
            localContactX = bestFaceMaxX; 
            break;
        case 'middle':
        default:
            localContactX = (bestFaceMinX + bestFaceMaxX) / 2;
            break;
    }
    const localContactY = bestFaceY;

    // 6. Transform Local Contact Vector to World Space
    // The vector `v_R = (localContactX, localContactY)` is in the frame rotated by `toolOrientation`.
    // We need to align this frame with the contour `snapAngle`.
    // The transform from "Angle 0 Frame" to "World Contour Frame" is rotation by `snapAngle`.
    
    const snapRad = (snapAngle * Math.PI) / 180;
    const snapCos = Math.cos(snapRad);
    const snapSin = Math.sin(snapRad);

    const worldContactVectorX = localContactX * snapCos - localContactY * snapSin;
    const worldContactVectorY = localContactX * snapSin + localContactY * snapCos;

    // 7. Calculate Tool Center
    // If PlacementSide is Inside, we flip the center relative to the contact point.
    // Outside (-1): Moves center AWAY from the Active Face Vector.
    // Inside (1): Moves center TOWARDS the Active Face Vector.
    
    const sign = placementSide === PlacementSide.Inside ? 1 : -1;

    const centerX = snapPoint.x + sign * worldContactVectorX;
    const centerY = snapPoint.y + sign * worldContactVectorY;

    // 8. Apply Parallel Offset
    // Offset is parallel to the contour tangent.
    const parOffsetX = offset * snapCos;
    const parOffsetY = offset * snapSin;

    const finalX = centerX + parOffsetX;
    const finalY = centerY + parOffsetY;

    // 9. Adjust Rotation for Inside Placement
    // We rotate the tool 180 degrees so the active face (physically) aligns with the line 
    // from the inside (opposite side).
    let outputRotation = finalRotation;
    if (placementSide === PlacementSide.Inside) {
        outputRotation += 180;
    }
    
    // Normalize
    outputRotation = outputRotation % 360;
    if (outputRotation < 0) outputRotation += 360;

    return {
        x: finalX,
        y: finalY,
        rotation: outputRotation
    };
};