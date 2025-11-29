
import { Part, Tool, PlacedTool, Point, DxfEntity } from '../types';

/**
 * Generates a parametric JavaScript script for a part.
 * It calculates the difference between the physical DXF geometry (Flat Pattern)
 * and the user-defined Face dimensions to determine Bend Allowances/Corrections.
 */
export const generateParametricScript = (part: Part, tools: Tool[]): string => {
    const UserFaceW = part.faceWidth; // User defined Width (X) - sum of faces
    const UserFaceH = part.faceHeight; // User defined Height (Y) - sum of faces
    const { bbox, entities, width: GeomW, height: GeomH } = part.geometry;
    const profile = part.profile;

    if (!bbox || !entities) return '// Ошибка: Отсутствует геометрия для генерации скрипта.';

    // Format number: remove trailing zeros, precision 4
    const fmt = (n: number) => {
        const s = n.toFixed(4);
        return parseFloat(s).toString();
    };

    // Normalization helper (DXF Raw -> Script coords). Preserve Y-Up.
    const normalize = (p: Point): Point => ({
        x: p.x - bbox.minX,
        y: p.y - bbox.minY
    });

    // --- Correction Calculation (Bend Allowances) ---
    // Delta = Actual Flat Size (DXF) - User Finished Size
    const deltaX = GeomW - UserFaceW;
    const deltaY = GeomH - UserFaceH;

    let headerVars = "";
    let dimensionsHeader = `${fmt(UserFaceW)} x ${fmt(UserFaceH)} мм (Лицевые)`;

    const orientation = profile?.orientation || 'vertical';

    // --- PROFILE LOGIC ---

    if (profile && profile.type === 'L') {
        if (orientation === 'vertical') {
            const A = profile.dims.a; 
            dimensionsHeader = `L-Профиль: ${fmt(A)} + Var x ${fmt(UserFaceH)} мм`;

            headerVars += `// L-Profile Vertical\n`;
            headerVars += `const BendAllowanceX = ${fmt(deltaX)};\n`;
            headerVars += `const CorrectionY = ${fmt(deltaY)};\n\n`;
            
            headerVars += `// Dimensions\n`;
            headerVars += `const FlangeLeft = (typeof Params !== 'undefined' && typeof Params.a === 'number') ? Params.a : ${fmt(A)};\n`;
            headerVars += `const FlangeRight = Length - FlangeLeft;\n`;
            headerVars += `const RealWidth = FlangeLeft + FlangeRight + BendAllowanceX; // Flat Pattern Width\n`;
            headerVars += `const RealHeight = Width + CorrectionY; // Flat Pattern Height\n`;

        } else {
            const A = profile.dims.a; 
            dimensionsHeader = `L-Профиль: ${fmt(UserFaceW)} x ${fmt(A)} + Var мм`;

            headerVars += `// L-Profile Horizontal\n`;
            headerVars += `const BendAllowanceY = ${fmt(deltaY)};\n`;
            headerVars += `const CorrectionX = ${fmt(deltaX)};\n\n`;
            
            headerVars += `const FlangeTop = (typeof Params !== 'undefined' && typeof Params.a === 'number') ? Params.a : ${fmt(A)};\n`;
            headerVars += `const FlangeBottom = Width - FlangeTop;\n`;
            headerVars += `const RealWidth = Length + CorrectionX;\n`;
            headerVars += `const RealHeight = FlangeTop + FlangeBottom + BendAllowanceY;\n`;
        }

    } else if (profile && profile.type === 'U') {
        if (orientation === 'vertical') {
            const A = profile.dims.a;
            const C = profile.dims.c;
            dimensionsHeader = `U-Профиль: ${fmt(A)} + Var + ${fmt(C)} x ${fmt(UserFaceH)} мм`;

            headerVars += `// U-Profile Vertical\n`;
            headerVars += `const BendAllowanceX = ${fmt(deltaX)};\n`;
            headerVars += `const CorrectionY = ${fmt(deltaY)};\n\n`;

            headerVars += `const FlangeLeft = (typeof Params !== 'undefined' && typeof Params.a === 'number') ? Params.a : ${fmt(A)};\n`;
            headerVars += `const FlangeRight = (typeof Params !== 'undefined' && typeof Params.c === 'number') ? Params.c : ${fmt(C)};\n`;
            
            headerVars += `const WebCenter = Length - FlangeLeft - FlangeRight;\n`;
            headerVars += `const RealWidth = FlangeLeft + WebCenter + FlangeRight + BendAllowanceX;\n`;
            headerVars += `const RealHeight = Width + CorrectionY;\n`;

        } else {
            const A = profile.dims.a;
            const C = profile.dims.c;
            dimensionsHeader = `U-Профиль: ${fmt(UserFaceW)} x ${fmt(A)} + Var + ${fmt(C)} мм`;

            headerVars += `// U-Profile Horizontal\n`;
            headerVars += `const BendAllowanceY = ${fmt(deltaY)};\n`;
            headerVars += `const CorrectionX = ${fmt(deltaX)};\n\n`;

            headerVars += `const FlangeTop = (typeof Params !== 'undefined' && typeof Params.a === 'number') ? Params.a : ${fmt(A)};\n`;
            headerVars += `const FlangeBottom = (typeof Params !== 'undefined' && typeof Params.c === 'number') ? Params.c : ${fmt(C)};\n`;
            
            headerVars += `const WebCenter = Width - FlangeTop - FlangeBottom;\n`;
            headerVars += `const RealWidth = Length + CorrectionX;\n`;
            headerVars += `const RealHeight = FlangeTop + WebCenter + FlangeBottom + BendAllowanceY;\n`;
        }

    } else {
        headerVars += `// Flat Part\n`;
        headerVars += `const CorrectionX = ${fmt(deltaX)};\n`;
        headerVars += `const CorrectionY = ${fmt(deltaY)};\n`;
        headerVars += `const RealWidth = Length + CorrectionX;\n`;
        headerVars += `const RealHeight = Width + CorrectionY;\n`;
    }

    // --- Coordinate Mapping (Anchors) ---
    const anchorsX: { val: number, expr: string }[] = [
        { val: 0, expr: '0' },
        { val: GeomW, expr: 'RealWidth' }
    ];
    const anchorsY: { val: number, expr: string }[] = [
        { val: 0, expr: '0' },
        { val: GeomH, expr: 'RealHeight' }
    ];

    if (profile && profile.type === 'L') {
        if (orientation === 'vertical') {
            anchorsX.push({ val: profile.dims.a, expr: 'FlangeLeft' });
        } else {
            anchorsY.push({ val: profile.dims.a, expr: 'FlangeTop' });
        }
    } else if (profile && profile.type === 'U') {
        if (orientation === 'vertical') {
            anchorsX.push({ val: profile.dims.a, expr: 'FlangeLeft' });
            anchorsX.push({ val: GeomW - profile.dims.c, expr: '(RealWidth - FlangeRight)' });
        } else {
            anchorsY.push({ val: profile.dims.a, expr: 'FlangeTop' });
            anchorsY.push({ val: GeomH - profile.dims.c, expr: '(RealHeight - FlangeBottom)' });
        }
    }

    anchorsX.sort((a,b) => a.val - b.val);
    anchorsY.sort((a,b) => a.val - b.val);

    const mapCoordinate = (val: number, anchors: { val: number, expr: string }[]) => {
        let bestAnchor = anchors[0];
        let minDiff = Math.abs(val - anchors[0].val);
        
        for(let i=1; i<anchors.length; i++) {
            const diff = Math.abs(val - anchors[i].val);
            if(diff < minDiff) {
                minDiff = diff;
                bestAnchor = anchors[i];
            }
        }
        
        if (minDiff < 0.005) return bestAnchor.expr;
        
        const offset = val - bestAnchor.val;
        // Use ternary for cleanliness in generated code
        return offset > 0 ? `${bestAnchor.expr} + ${fmt(offset)}` : `${bestAnchor.expr} - ${fmt(Math.abs(offset))}`;
    };

    const pX = (x: number) => mapCoordinate(x, anchorsX);
    const pY = (y: number) => mapCoordinate(y, anchorsY);

    const dateStr = new Date().toLocaleDateString('ru-RU');
    const profileName = profile?.type === 'L' ? `L-профиль (${orientation})` : (profile?.type === 'U' ? `U-профиль (${orientation})` : 'Плоская');
    
    let script = `// ---------------------------------------------------
// Автоматически сгенерированный скрипт детали
// Тип: ${profileName}
// Дата: ${dateStr}
// Размеры (Ввод): ${dimensionsHeader}
// Габарит DXF: ${fmt(GeomW)}x${fmt(GeomH)}
// ---------------------------------------------------

// Переменные Length и Width - это размеры готовой детали (Лицо).
// Скрипт автоматически добавляет поправку на сгиб (Bend Allowance).

${headerVars}
// ---------------------------------------------------
// ГЕОМЕТРИЯ
// ---------------------------------------------------
`;

    // --- GEOMETRY CHAINING ALGORITHM ---
    
    type ChainNode = {
        start: Point;
        end: Point;
        entity: DxfEntity;
        visited: boolean;
        svgStart: Point; // Normalized
        svgEnd: Point;   // Normalized
    };

    // Convert entities to nodes
    const nodes: ChainNode[] = [];
    entities.forEach(e => {
        if (e.type === 'LINE') {
            nodes.push({ 
                start: e.start, end: e.end, entity: e, visited: false, 
                svgStart: normalize(e.start), svgEnd: normalize(e.end)
            });
        } else if (e.type === 'LWPOLYLINE') {
            for(let i=0; i<e.vertices.length - (e.closed ? 0 : 1); i++) {
                const p1 = e.vertices[i];
                const p2 = e.vertices[(i+1)%e.vertices.length];
                nodes.push({
                    start: p1, end: p2, entity: { type: 'LINE', start: p1, end: p2 }, visited: false,
                    svgStart: normalize(p1), svgEnd: normalize(p2)
                });
            }
        } else if (e.type === 'ARC') {
             const d2r = Math.PI / 180;
             const startRaw = {
                 x: e.center.x + e.radius * Math.cos(e.startAngle * d2r),
                 y: e.center.y + e.radius * Math.sin(e.startAngle * d2r)
             };
             const endRaw = {
                 x: e.center.x + e.radius * Math.cos(e.endAngle * d2r),
                 y: e.center.y + e.radius * Math.sin(e.endAngle * d2r)
             };
             nodes.push({
                 start: startRaw, end: endRaw, entity: e, visited: false,
                 svgStart: normalize(startRaw), svgEnd: normalize(endRaw)
             });
        } else if (e.type === 'CIRCLE') {
             const c = normalize(e.center);
             const r = e.radius;
             script += `\n\n// Круглое отверстие (Ø${fmt(r*2)})`;
             script += `\nPart.StartContour(${pX(c.x - r)}, ${pY(c.y)});`;
             script += `\nPart.ArcTo(${pX(c.x + r)}, ${pY(c.y)}, ${pX(c.x)}, ${pY(c.y)}, false);`;
             script += `\nPart.ArcTo(${pX(c.x - r)}, ${pY(c.y)}, ${pX(c.x)}, ${pY(c.y)}, false);`;
        }
    });

    const distSq = (p1: Point, p2: Point) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
    const TOLERANCE = 0.01;

    const chains: ChainNode[][] = [];

    // Build chains
    while(true) {
        const seed = nodes.find(n => !n.visited);
        if (!seed) break;

        const chain: ChainNode[] = [seed];
        seed.visited = true;
        
        let tail = seed;
        let finding = true;

        while(finding) {
            const next = nodes.find(n => !n.visited && distSq(tail.end, n.start) < TOLERANCE);
            if (next) {
                next.visited = true;
                chain.push(next);
                tail = next;
            } else {
                const nextReverse = nodes.find(n => !n.visited && distSq(tail.end, n.end) < TOLERANCE);
                if (nextReverse) {
                    nextReverse.visited = true;
                    const temp = nextReverse.start; nextReverse.start = nextReverse.end; nextReverse.end = temp;
                    const tempSvg = nextReverse.svgStart; nextReverse.svgStart = nextReverse.svgEnd; nextReverse.svgEnd = tempSvg;
                    chain.push(nextReverse);
                    tail = nextReverse;
                } else {
                    finding = false;
                }
            }
        }
        chains.push(chain);
    }

    const chainStats = chains.map(chain => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        chain.forEach(n => {
            minX = Math.min(minX, n.svgStart.x, n.svgEnd.x);
            maxX = Math.max(maxX, n.svgStart.x, n.svgEnd.x);
            minY = Math.min(minY, n.svgStart.y, n.svgEnd.y);
            maxY = Math.max(maxY, n.svgStart.y, n.svgEnd.y);
        });
        const area = (maxX - minX) * (maxY - minY);
        return { chain, area };
    });

    chainStats.sort((a, b) => b.area - a.area);

    chainStats.forEach((item, index) => {
        const isOutside = index === 0;
        script += `\n\n// ${isOutside ? 'Внешний контур' : 'Внутреннее отверстие'}`;
        
        const chain = item.chain;
        if (chain.length === 0) return;

        script += `\nPart.StartContour(${pX(chain[0].svgStart.x)}, ${pY(chain[0].svgStart.y)});`;

        chain.forEach(node => {
            const end = node.svgEnd;
            if (node.entity.type === 'LINE') {
                script += `\nPart.LineTo(${pX(end.x)}, ${pY(end.y)});`;
            } else if (node.entity.type === 'ARC') {
                const arc = node.entity as any;
                const c = normalize(arc.center);
                script += `\nPart.ArcTo(${pX(end.x)}, ${pY(end.y)}, ${pX(c.x)}, ${pY(c.y)}, false);`;
            }
        });
    });


    script += `\n\n// ---------------------------------------------------
// ИНСТРУМЕНТ
// ---------------------------------------------------
`;

    const nibbleGroups = new Map<string, PlacedTool[]>();
    const singlePunches: PlacedTool[] = [];

    part.punches.forEach(p => {
        if (p.lineId) {
            if (!nibbleGroups.has(p.lineId)) {
                nibbleGroups.set(p.lineId, []);
            }
            nibbleGroups.get(p.lineId)?.push(p);
        } else {
            singlePunches.push(p);
        }
    });

    nibbleGroups.forEach((punches) => {
        if (punches.length < 2) {
            punches.forEach(p => singlePunches.push(p));
            return;
        }

        punches.sort((a, b) => (a.x - b.x) || (a.y - b.y));

        const start = punches[0];
        const end = punches[punches.length - 1];
        const tool = tools.find(t => t.id === start.toolId);
        const toolName = tool ? tool.name : "UNKNOWN_TOOL";
        const rotation = start.rotation;

        const lineAngleRad = Math.atan2(end.y - start.y, end.x - start.x);
        const toolRotationRad = (rotation * Math.PI) / 180;
        
        const diffRad = lineAngleRad - toolRotationRad;
        
        let effectiveSize = 10; 
        if (tool) {
            if (tool.shape === 'circle') {
                effectiveSize = tool.width;
            } else {
                effectiveSize = tool.width * Math.abs(Math.cos(diffRad)) + tool.height * Math.abs(Math.sin(diffRad));
            }
        }

        const safeOverlap = 1.0; 
        const maxStep = Math.max(0.1, effectiveSize - safeOverlap);
        
        script += `\nPart.NibbleLine("${toolName}", ${pX(start.x)}, ${pY(start.y)}, ${pX(end.x)}, ${pY(end.y)}, ${rotation.toFixed(2)}, ${fmt(maxStep)});`;
    });

    singlePunches.forEach(p => {
        const tool = tools.find(t => t.id === p.toolId);
        const toolName = tool ? tool.name : "UNKNOWN_TOOL";
        script += `\nPart.Strike("${toolName}", ${pX(p.x)}, ${pY(p.y)}, ${p.rotation.toFixed(2)});`;
    });

    return script;
};
