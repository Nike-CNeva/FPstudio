
/**
 * ОТВЕТСТВЕННОСТЬ: Генерация графического представления листа.
 * Рисует границы листа, положение зажимов и контуры всех уложенных деталей с их названиями.
 */
import { NestResultSheet, Part } from "../../types";

export const generateSheetImage = async (
    sheet: NestResultSheet, 
    parts: Part[], 
    clamps: number[]
): Promise<string> => {
    const canvas = document.createElement('canvas');
    const scale = 2.0; 
    canvas.width = sheet.width * 0.2 * scale; 
    canvas.height = sheet.height * 0.2 * scale;
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawScale = 0.2 * scale;
    
    ctx.scale(drawScale, -drawScale);
    ctx.translate(0, -sheet.height);

    // Граница листа
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 / drawScale;
    ctx.strokeRect(0, 0, sheet.width, sheet.height);

    // Зажимы (Clamps)
    ctx.lineWidth = 2 / drawScale;
    ctx.strokeStyle = '#000000';
    
    clamps.forEach(x => {
        ctx.fillStyle = '#4a5568'; 
        ctx.fillRect(x - 40, -60, 80, 60); 
        ctx.strokeRect(x - 40, -60, 80, 60);
        
        ctx.fillStyle = '#2d3748'; 
        ctx.fillRect(x - 40, 0, 80, 20); 
        ctx.strokeRect(x - 40, 0, 80, 20);
        
        ctx.beginPath();
        ctx.moveTo(x, -60);
        ctx.lineTo(x, 20); 
        ctx.setLineDash([5 / drawScale, 5 / drawScale]); 
        ctx.stroke();
        ctx.setLineDash([]); 
    });

    // Детали
    sheet.placedParts.forEach(pp => {
        const part = parts.find(p => p.id === pp.partId);
        if (!part) return;

        ctx.save();
        ctx.translate(pp.x, pp.y);
        ctx.rotate(pp.rotation * Math.PI / 180);

        const path = new Path2D(part.geometry.path);
        ctx.fillStyle = '#e2e8f0'; 
        ctx.fill(path);
        ctx.strokeStyle = '#2d3748'; 
        ctx.lineWidth = 1 / drawScale;
        ctx.stroke(path);

        const minDim = Math.min(part.geometry.width, part.geometry.height);
        let fontSize = Math.max(10, minDim / 3); 
        if (fontSize > 50) fontSize = 50;

        ctx.fillStyle = '#000000';
        const centerX = part.geometry.width / 2;
        const centerY = part.geometry.height / 2;

        ctx.translate(centerX, centerY);
        ctx.scale(1, -1); 
        
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(part.name, 0, 0);

        ctx.restore();
    });

    return canvas.toDataURL('image/png');
};
