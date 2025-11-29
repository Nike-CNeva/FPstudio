
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

  const pushCurrentEntity = () => {
    if (currentEntity) {
      entities.push(currentEntity);
      currentEntity = null;
    }
    lastLwPolylineX = null; // Reset state for new entity
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
                 } else if (code === 20 && lastLwPolylineX !== null) { // Y coordinate
                    currentEntity.vertices.push({ x: lastLwPolylineX, y: floatVal });
                    lastLwPolylineX = null;
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

/**
 * Converts an array of parsed DXF entities into a single SVG path string.
 * Coordinates are normalized to (0,0) at Bottom-Left (Y-Up Cartesian).
 */
export const dxfEntitiesToSvg = (entities: DxfEntity[]): { path: string, width: number, height: number, bbox: { minX: number, minY: number, maxX: number, maxY: number } } => {
    if (entities.length === 0) {
        return { path: '', width: 0, height: 0, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    entities.forEach(entity => {
        switch(entity.type) {
            case 'LWPOLYLINE':
                entity.vertices.forEach(v => {
                    minX = Math.min(minX, v.x);
                    minY = Math.min(minY, v.y);
                    maxX = Math.max(maxX, v.x);
                    maxY = Math.max(maxY, v.y);
                });
                break;
            case 'LINE':
                minX = Math.min(minX, entity.start.x, entity.end.x);
                minY = Math.min(minY, entity.start.y, entity.end.y);
                maxX = Math.max(maxX, entity.start.x, entity.end.x);
                maxY = Math.max(maxY, entity.start.y, entity.end.y);
                break;
            case 'CIRCLE':
                minX = Math.min(minX, entity.center.x - entity.radius);
                minY = Math.min(minY, entity.center.y - entity.radius);
                maxX = Math.max(maxX, entity.center.x + entity.radius);
                maxY = Math.max(maxY, entity.center.y + entity.radius);
                break;
            case 'ARC':
                const center = entity.center;
                const r = entity.radius;
                const startAngle = entity.startAngle;
                let endAngle = entity.endAngle;

                if (endAngle < startAngle) {
                    endAngle += 360;
                }
                
                const points = [];
                points.push({
                    x: center.x + r * Math.cos(degreesToRadians(startAngle)),
                    y: center.y + r * Math.sin(degreesToRadians(startAngle))
                });
                points.push({
                    x: center.x + r * Math.cos(degreesToRadians(endAngle)),
                    y: center.y + r * Math.sin(degreesToRadians(endAngle))
                });
                
                // Add cardinal points if within arc sweep
                for (let deg = 0; deg <= 360; deg += 90) {
                     if (deg > startAngle && deg < endAngle) {
                         points.push({ x: center.x + r * Math.cos(degreesToRadians(deg)), y: center.y + r * Math.sin(degreesToRadians(deg))});
                     }
                }

                points.forEach(p => {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                });
                break;
        }
    });
    
    // Exact bounds
    const bbox = { minX, minY, maxX, maxY };
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Normalize logic: Shift so (minX, minY) -> (0, 0). Preserve Y-Up.
    const normalize = (p: Point) => ({
        x: p.x - bbox.minX,
        y: p.y - bbox.minY
    });

    const pathDataParts: string[] = [];

    entities.forEach(entity => {
        switch(entity.type) {
            case 'LWPOLYLINE':
                const normalizedVertices = entity.vertices.map(normalize);
                const pathData = normalizedVertices
                    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${v.x.toFixed(3)} ${v.y.toFixed(3)}`)
                    .join(' ');
                pathDataParts.push(pathData + (entity.closed ? ' Z' : ''));
                break;
            case 'LINE':
                const start = normalize(entity.start);
                const end = normalize(entity.end);
                pathDataParts.push(`M ${start.x.toFixed(3)} ${start.y.toFixed(3)} L ${end.x.toFixed(3)} ${end.y.toFixed(3)}`);
                break;
            case 'CIRCLE':
                const c = normalize(entity.center);
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

                const startPointRaw = {
                    x: arcCenter.x + arcRadius * Math.cos(startRad),
                    y: arcCenter.y + arcRadius * Math.sin(startRad)
                };
                const endPointRaw = {
                    x: arcCenter.x + arcRadius * Math.cos(endRad),
                    y: arcCenter.y + arcRadius * Math.sin(endRad)
                };

                const startPoint = normalize(startPointRaw);
                const endPoint = normalize(endPointRaw);
                
                let angleSpan = endAngle - startAngle;
                if (angleSpan < 0) angleSpan += 360;
                
                const largeArcFlag = angleSpan > 180 ? 1 : 0;
                const sweepFlag = 1; // Standard Cartesian Counter-Clockwise
                
                pathDataParts.push(`M ${startPoint.x.toFixed(3)} ${startPoint.y.toFixed(3)} A ${arcRadius.toFixed(3)} ${arcRadius.toFixed(3)} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x.toFixed(3)} ${endPoint.y.toFixed(3)}`);
                break;
        }
    });
    
    const finalPath = pathDataParts.join(' ');
    return { path: finalPath, width, height, bbox };
};
