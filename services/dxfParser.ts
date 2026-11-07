
import { DxfEntity, Point } from '../types';

/**
 * Parses a simplified DXF file content.
 * Handles LWPOLYLINE, CIRCLE, ARC and LINE entities.
 * Robust against whitespace and case sensitivity.
 */
export const parseDxf = (dxfContent: string): DxfEntity[] => {
  const lines = dxfContent.split(/\r?\n/);
  const entities: DxfEntity[] = [];
  let currentEntity: DxfEntity | null = null;
  let lastLwPolylineX: number | null = null; // State for LWPOLYLINE vertices
  let lastLwPolylineVertexIndex: number | null = null;

  const pushCurrentEntity = () => {
    if (currentEntity) {
      entities.push(currentEntity);
      currentEntity = null;
    }
    lastLwPolylineX = null; // Reset state for new entity
    lastLwPolylineVertexIndex = null;
  };

  // Correctly iterate by pairs of code and value
  for (let i = 0; i < lines.length - 1; i += 2) {
    const codeStr = lines[i].trim();
    if (codeStr === '') {
        // Skip blank lines, but adjust index to not get out of sync
        i -=1; 
        continue;
    };
    
    const value = lines[i + 1].trim().toUpperCase(); // Normalize value to uppercase
    
    const code = parseInt(codeStr, 10);
    if (isNaN(code)) continue;

    if (code === 0) {
      pushCurrentEntity(); // A group code 0 indicates the start of a new entity.
      
      switch(value) {
        case 'LWPOLYLINE':
          currentEntity = { type: 'LWPOLYLINE', vertices: [], closed: false };
          break;
        case 'CIRCLE':
          currentEntity = { type: 'CIRCLE', center: { x: 0, y: 0 }, radius: 0 };
          break;
        case 'ARC':
           currentEntity = { type: 'ARC', center: { x: 0, y: 0 }, radius: 0, startAngle: 0, endAngle: 0 };
           break;
        case 'LINE':
          currentEntity = { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
          break;
        case 'ENDSEC':
            currentEntity = null;
            break;
        default:
          currentEntity = null; // Ignore other entity types
          break;
      }
    }
    
    if (currentEntity) {
        // Parse values based on entity type
        // Note: parseFloat handles the uppercase string fine if it's numeric
        const floatVal = parseFloat(value);

        switch (currentEntity.type) {
            case 'LWPOLYLINE':
                 if (code === 10) { // X coordinate
                    lastLwPolylineX = floatVal;
                    lastLwPolylineVertexIndex = null;
                 } else if (code === 20 && lastLwPolylineX !== null) { // Y coordinate
                    currentEntity.vertices.push({ x: lastLwPolylineX, y: floatVal });
                    lastLwPolylineVertexIndex = currentEntity.vertices.length - 1;
                    lastLwPolylineX = null;
                 } else if (code === 42 && lastLwPolylineVertexIndex !== null) {
                    // Bulge belongs to the segment starting at the preceding vertex.
                    currentEntity.bulges = currentEntity.bulges || [];
                    currentEntity.bulges[lastLwPolylineVertexIndex] = floatVal;
                 } else if (code === 70) {
                    // Bit code 1 = closed
                    currentEntity.closed = (parseInt(value, 10) & 1) === 1;
                 }
                break;
            case 'CIRCLE':
            case 'ARC':
                 switch(code) {
                    case 10: currentEntity.center.x = floatVal; break;
                    case 20: currentEntity.center.y = floatVal; break;
                    case 40: currentEntity.radius = floatVal; break;
                    case 50: if(currentEntity.type === 'ARC') currentEntity.startAngle = floatVal; break;
                    case 51: if(currentEntity.type === 'ARC') currentEntity.endAngle = floatVal; break;
                 }
                 break;
            case 'LINE':
                switch(code) {
                    case 10: currentEntity.start.x = floatVal; break;
                    case 20: currentEntity.start.y = floatVal; break;
                    case 11: currentEntity.end.x = floatVal; break;
                    case 21: currentEntity.end.y = floatVal; break;
                }
                break;
        }
    }
  }

  pushCurrentEntity(); // Push the very last entity
  
  return entities;
};

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

const getBulgeArc = (start: Point, end: Point, bulge: number) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chord = Math.hypot(dx, dy);
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9 || chord < 1e-9) return null;

    const sweepRadians = 4 * Math.atan(bulge);
    const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const centerOffset = chord * (1 - bulge * bulge) / (4 * bulge);
    const center = {
        x: midpoint.x - (dy / chord) * centerOffset,
        y: midpoint.y + (dx / chord) * centerOffset
    };

    return {
        center,
        radius,
        startAngle: Math.atan2(start.y - center.y, start.x - center.x) * 180 / Math.PI,
        sweepDegrees: sweepRadians * 180 / Math.PI
    };
};

/**
 * Converts an array of parsed DXF entities into a single SVG path string.
 * Coordinates are normalized to (0,0) at Bottom-Left (Y-Up Cartesian).
 * RETURNS: Normalized Entities as well, for consistent storage in Part.
 */
export const dxfEntitiesToSvg = (entities: DxfEntity[]): { 
    path: string, 
    width: number, 
    height: number, 
    bbox: { minX: number, minY: number, maxX: number, maxY: number },
    normalizedEntities: DxfEntity[] 
} => {
    if (entities.length === 0) {
        return { path: '', width: 0, height: 0, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, normalizedEntities: [] };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // 1. Calculate Bounding Box of RAW entities
    const updateBounds = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    entities.forEach(entity => {
        switch(entity.type) {
            case 'LWPOLYLINE': {
                entity.vertices.forEach(v => updateBounds(v.x, v.y));
                const edgeCount = entity.closed ? entity.vertices.length : Math.max(0, entity.vertices.length - 1);
                for (let i = 0; i < edgeCount; i++) {
                    const start = entity.vertices[i];
                    const end = entity.vertices[(i + 1) % entity.vertices.length];
                    const arc = getBulgeArc(start, end, entity.bulges?.[i] || 0);
                    if (!arc) continue;

                    for (const cardinal of [0, 90, 180, 270]) {
                        const normalize = (angle: number) => ((angle % 360) + 360) % 360;
                        const progress = arc.sweepDegrees >= 0
                            ? normalize(cardinal - arc.startAngle)
                            : normalize(arc.startAngle - cardinal);
                        if (progress <= Math.abs(arc.sweepDegrees) + 1e-8) {
                            const rad = degreesToRadians(cardinal);
                            updateBounds(
                                arc.center.x + arc.radius * Math.cos(rad),
                                arc.center.y + arc.radius * Math.sin(rad)
                            );
                        }
                    }
                }
                break;
            }
            case 'LINE':
                updateBounds(entity.start.x, entity.start.y);
                updateBounds(entity.end.x, entity.end.y);
                break;
            case 'CIRCLE':
                updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
                updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
                break;
            case 'ARC':
                // Simplified bbox for Arc (using center + radius points)
                // A precise bbox for arc is complex, we stick to cardinal points + start/end for safety
                // Or simply checking start/end and circle bounds if contained.
                // For simplicity in this context, we check start, end, and if quadrants are included.
                const startRad = degreesToRadians(entity.startAngle);
                const endRad = degreesToRadians(entity.endAngle);
                updateBounds(entity.center.x + entity.radius * Math.cos(startRad), entity.center.y + entity.radius * Math.sin(startRad));
                updateBounds(entity.center.x + entity.radius * Math.cos(endRad), entity.center.y + entity.radius * Math.sin(endRad));
                
                // Check cardinal points
                for (let deg = 0; deg <= 360; deg += 90) {
                     // Check if deg is within start-end range
                     // Normalize angles to 0-360 for comparison
                     let s = entity.startAngle;
                     let e = entity.endAngle;
                     if(e < s) e += 360;
                     let d = deg;
                     if(d < s) d += 360;
                     
                     if (d >= s && d <= e) {
                         const rRad = degreesToRadians(deg);
                         updateBounds(entity.center.x + entity.radius * Math.cos(rRad), entity.center.y + entity.radius * Math.sin(rRad));
                     }
                }
                break;
        }
    });
    
    // 2. Exact bounds
    const width = maxX - minX;
    const height = maxY - minY;
    
    // 3. Create Normalized Entities (Deep Copy with shift)
    const normalizedEntities: DxfEntity[] = JSON.parse(JSON.stringify(entities));
    
    const normalizePoint = (p: Point) => {
        p.x -= minX;
        p.y -= minY;
    };

    normalizedEntities.forEach(entity => {
        switch(entity.type) {
            case 'LWPOLYLINE':
                entity.vertices.forEach(normalizePoint);
                break;
            case 'LINE':
                normalizePoint(entity.start);
                normalizePoint(entity.end);
                break;
            case 'CIRCLE':
            case 'ARC':
                normalizePoint(entity.center);
                break;
        }
    });

    // 4. Generate SVG Path from NORMALIZED entities
    const pathDataParts: string[] = [];

    normalizedEntities.forEach(entity => {
        switch(entity.type) {
            case 'LWPOLYLINE': {
                if (entity.vertices.length === 0) break;
                let pathData = `M ${entity.vertices[0].x.toFixed(3)} ${entity.vertices[0].y.toFixed(3)}`;
                const edgeCount = entity.closed ? entity.vertices.length : Math.max(0, entity.vertices.length - 1);

                for (let i = 0; i < edgeCount; i++) {
                    const start = entity.vertices[i];
                    const end = entity.vertices[(i + 1) % entity.vertices.length];
                    const bulge = entity.bulges?.[i] || 0;
                    const arc = getBulgeArc(start, end, bulge);

                    if (!arc) {
                        pathData += ` L ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
                    } else {
                        const largeArcFlag = Math.abs(arc.sweepDegrees) > 180 ? 1 : 0;
                        const sweepFlag = arc.sweepDegrees >= 0 ? 1 : 0;
                        pathData += ` A ${arc.radius.toFixed(3)} ${arc.radius.toFixed(3)} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
                    }
                }

                pathDataParts.push(pathData + (entity.closed ? ' Z' : ''));
                break;
            }
            case 'LINE':
                pathDataParts.push(`M ${entity.start.x.toFixed(3)} ${entity.start.y.toFixed(3)} L ${entity.end.x.toFixed(3)} ${entity.end.y.toFixed(3)}`);
                break;
            case 'CIRCLE':
                const c = entity.center;
                const r = entity.radius;
                // Draw two arcs to form a circle
                pathDataParts.push(`M ${(c.x - r).toFixed(3)} ${c.y.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 1 0 ${(c.x + r).toFixed(3)} ${c.y.toFixed(3)}`);
                pathDataParts.push(`M ${(c.x + r).toFixed(3)} ${c.y.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 1 0 ${(c.x - r).toFixed(3)} ${c.y.toFixed(3)}`);
                break;
            case 'ARC':
                const arcCenter = entity.center;
                const arcRadius = entity.radius;
                const startAngle = entity.startAngle;
                const endAngle = entity.endAngle;

                const startRad = degreesToRadians(startAngle);
                const endRad = degreesToRadians(endAngle);

                const startPoint = {
                    x: arcCenter.x + arcRadius * Math.cos(startRad),
                    y: arcCenter.y + arcRadius * Math.sin(startRad)
                };
                const endPoint = {
                    x: arcCenter.x + arcRadius * Math.cos(endRad),
                    y: arcCenter.y + arcRadius * Math.sin(endRad)
                };
                
                let angleSpan = endAngle - startAngle;
                if (angleSpan < 0) angleSpan += 360;
                
                const largeArcFlag = angleSpan > 180 ? 1 : 0;
                const sweepFlag = 1; // Standard Cartesian Counter-Clockwise
                
                pathDataParts.push(`M ${startPoint.x.toFixed(3)} ${startPoint.y.toFixed(3)} A ${arcRadius.toFixed(3)} ${arcRadius.toFixed(3)} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x.toFixed(3)} ${endPoint.y.toFixed(3)}`);
                break;
        }
    });
    
    const finalPath = pathDataParts.join(' ');
    
    // Return Normalized BBox (0,0, W, H)
    const normalizedBbox = { minX: 0, minY: 0, maxX: width, maxY: height };

    return { 
        path: finalPath, 
        width, 
        height, 
        bbox: normalizedBbox,
        normalizedEntities 
    };
};