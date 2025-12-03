import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { NestResultSheet, Part, Tool, ScheduledPart } from "../types";

// Helper to convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

const generateSheetImage = async (
    sheet: NestResultSheet, 
    parts: Part[], 
    clamps: number[]
): Promise<string> => {
    const canvas = document.createElement('canvas');
    // Set resolution (scale up for better quality in PDF)
    const scale = 2.0; 
    canvas.width = sheet.width * 0.2 * scale; // Thumbnail size
    canvas.height = sheet.height * 0.2 * scale;
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    // Fill Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Setup Coordinate System for Drawing
    // Canvas 0,0 is Top-Left. 
    // We want to fit the sheet into the canvas.
    // Sheet size: width x height. Canvas size: width*0.2 x height*0.2
    // Scale factor = 0.2 * scale
    const drawScale = 0.2 * scale;
    
    // Invert Y axis for CAD coordinates (0,0 bottom-left -> 0,H top-left in canvas)
    ctx.scale(drawScale, -drawScale);
    ctx.translate(0, -sheet.height);

    // Draw Sheet Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 / drawScale;
    ctx.strokeRect(0, 0, sheet.width, sheet.height);

    // Draw Clamps (Y=0, extending downwards physically)
    // High visibility style
    ctx.lineWidth = 2 / drawScale;
    ctx.strokeStyle = '#000000';
    
    clamps.forEach(x => {
        // 1. Clamp Body (Outside Sheet)
        ctx.fillStyle = '#4a5568'; // Dark Gray
        ctx.fillRect(x - 40, -60, 80, 60); 
        ctx.strokeRect(x - 40, -60, 80, 60);
        
        // 2. Clamp Jaw (Inside Sheet / Overlap)
        // Draw this on top to clearly show where it holds
        ctx.fillStyle = '#2d3748'; // Very Dark Gray / Almost Black
        ctx.fillRect(x - 40, 0, 80, 20); // 20mm bite
        ctx.strokeRect(x - 40, 0, 80, 20);
        
        // Center line indicator
        ctx.beginPath();
        ctx.moveTo(x, -60);
        ctx.lineTo(x, 20); 
        ctx.setLineDash([5 / drawScale, 5 / drawScale]); // Dashed line for center
        ctx.stroke();
        ctx.setLineDash([]); // Reset
    });

    // Draw Parts
    sheet.placedParts.forEach(pp => {
        const part = parts.find(p => p.id === pp.partId);
        if (!part) return;

        ctx.save();
        ctx.translate(pp.x, pp.y);
        ctx.rotate(pp.rotation * Math.PI / 180);

        // 1. Draw Geometry
        const path = new Path2D(part.geometry.path);
        ctx.fillStyle = '#e2e8f0'; // Slate-200
        ctx.fill(path);
        ctx.strokeStyle = '#2d3748'; // Slate-800
        ctx.lineWidth = 1 / drawScale;
        ctx.stroke(path);

        // 2. Draw Text (Part Name) in Center
        // Calculate font size based on part size relative to sheet
        const minDim = Math.min(part.geometry.width, part.geometry.height);
        
        // Heuristic: Font size roughly 1/3 of smallest dim, but clamped
        // Note: The context is scaled by `drawScale` (approx 0.4). 
        // A size of 20 here means 20 units in world space (mm).
        let fontSize = Math.max(10, minDim / 3); 
        if (fontSize > 50) fontSize = 50; // Cap max size

        ctx.fillStyle = '#000000';
        // We use a standard sans-serif font.
        // Important: `ctx.scale` flips Y. Text renders upside down.
        // We must translate to center, flip Y, then draw.
        
        const centerX = part.geometry.width / 2;
        const centerY = part.geometry.height / 2;

        ctx.translate(centerX, centerY);
        ctx.scale(1, -1); // Flip Y back for text
        
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(part.name, 0, 0);

        ctx.restore();
    });

    return canvas.toDataURL('image/png');
};

export const generatePdfReport = async (
    sheet: NestResultSheet,
    parts: Part[],
    tools: Tool[],
    ncFilename: string,
    clamps: number[],
    scheduledParts: ScheduledPart[],
    allSheets: NestResultSheet[] = []
) => {
    const doc = new jsPDF();
    
    // --- LOAD FONTS FOR CYRILLIC SUPPORT (REGULAR + BOLD) ---
    try {
        const fontBaseUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/";
        const regularUrl = `${fontBaseUrl}Roboto-Regular.ttf`;
        const boldUrl = `${fontBaseUrl}Roboto-Medium.ttf`; // Using Medium for Bold to be safe and clear

        const [resRegular, resBold] = await Promise.all([
            fetch(regularUrl),
            fetch(boldUrl)
        ]);

        if (resRegular.ok && resBold.ok) {
            const bufRegular = await resRegular.arrayBuffer();
            const bufBold = await resBold.arrayBuffer();
            
            doc.addFileToVFS("Roboto-Regular.ttf", arrayBufferToBase64(bufRegular));
            doc.addFileToVFS("Roboto-Bold.ttf", arrayBufferToBase64(bufBold));
            
            doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
            doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
            
            doc.setFont("Roboto", "normal"); 
        } else {
            console.warn("Failed to fetch fonts");
        }
    } catch (e) {
        console.error("Error loading fonts:", e);
    }
    
    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 10; // Tight margins

    // Helper to safely call autoTable regardless of import structure
    const runAutoTable = (options: any) => {
        const fn = (autoTable as any).default || autoTable;
        if (typeof fn === 'function') {
            fn(doc, options);
        } else if ((doc as any).autoTable) {
            (doc as any).autoTable(options);
        }
    };

    // 1. Prepare Data for Tables first to estimate height
    // Sheet Info Data
    const clampStr = clamps.map((c, i) => `Z${i+1}: ${c}`).join('  |  ');
    const sheetBody = [
        ['Размер', `${sheet.width} x ${sheet.height} мм`, clampStr],
        ['Материал', `${sheet.material}  s=${sheet.thickness} мм`, ''],
        ['Количество', `${sheet.quantity} шт.`, `Использование: ${sheet.usedArea.toFixed(1)}%`]
    ];

    // Parts Data
    const partsOnSheet = new Map<string, number>();
    sheet.placedParts.forEach(pp => {
        partsOnSheet.set(pp.partId, (partsOnSheet.get(pp.partId) || 0) + 1);
    });
    const partsBody = Array.from(partsOnSheet.entries()).map(([partId, countOnSheet]) => {
        const part = parts.find(p => p.id === partId);
        const scheduled = scheduledParts.find(sp => sp.partId === partId);
        const totalQty = scheduled ? scheduled.quantity : 0;
        let dims = `${part?.geometry.width.toFixed(1)}x${part?.geometry.height.toFixed(1)}`;
        if (part?.profile && part.profile.type !== 'flat') {
             dims += ` (${part.profile.type})`;
        }
        return [part?.name || 'Unknown', dims, countOnSheet, totalQty];
    });

    // Tooling Data
    const toolHits = new Map<string, number>();
    sheet.placedParts.forEach(pp => {
        const part = parts.find(p => p.id === pp.partId);
        part?.punches.forEach(punch => {
            toolHits.set(punch.toolId, (toolHits.get(punch.toolId) || 0) + 1);
        });
    });
    const toolRows = Array.from(toolHits.entries()).map(([toolId, hits]) => {
        const tool = tools.find(t => t.id === toolId);
        return {
            station: tool?.stationNumber || 0,
            mt: tool?.mtIndex || 0,
            name: tool?.name || toolId,
            shape: tool?.shape || '-',
            size: `${tool?.width}x${tool?.height}`,
            die: tool?.dies[0]?.clearance || 0,
            hits: hits,
            angle: tool?.defaultRotation || 0
        };
    }).sort((a, b) => {
        if (a.station !== b.station) return a.station - b.station;
        return a.mt - b.mt;
    });
    const toolBody = toolRows.map(t => {
        let code = t.station;
        if (t.mt > 0) {
            // Apply T-code correction for display: 20 + index
            code = 20 + t.mt;
        }
        // Prefix with T to match G-code format (e.g. T2, T21)
        const stationDisplay = t.station > 0 ? `T${code}` : 'Auto';

        return [
            stationDisplay,
            t.name,
            `${t.angle}°`,
            `${t.die}`,
            t.hits
        ];
    });

    // 2. Layout Calculation
    const headerHeight = 25;
    const footerHeight = 30; // Signature block
    const tableHeaderHeight = 6;
    const rowHeight = 6; // Compact row height approx
    const gap = 5;

    // Calculate space needed for tables
    const sheetTableHeight = (sheetBody.length * rowHeight) + tableHeaderHeight + gap;
    const partsTableHeight = (partsBody.length * rowHeight) + tableHeaderHeight + gap + 5; // +5 for title
    const toolsTableHeight = (toolBody.length * rowHeight) + tableHeaderHeight + gap + 5;

    const totalTableHeight = sheetTableHeight + partsTableHeight + toolsTableHeight;
    const availableHeight = pageHeight - headerHeight - footerHeight - (margin * 2);
    
    // Calculate max possible image height
    let maxImgHeight = availableHeight - totalTableHeight - gap;
    
    // Safety clamp
    if (maxImgHeight < 30) maxImgHeight = 30; 
    if (maxImgHeight > 100) maxImgHeight = 100;

    // 3. Render Header
    doc.setFont("Roboto", "bold");
    doc.setFontSize(16);
    doc.text("ОТЧЕТ РАСКРОЯ (SETUP SHEET)", margin, 15);
    
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    // Use ncFilename (which acts as display path string) directly for display
    doc.text(`Файл: ${ncFilename}`, margin, 22);
    doc.text(`Дата: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth - margin - 50, 22);

    let currentY = 25;

    // 4. Render Image
    try {
        const imgData = await generateSheetImage(sheet, parts, clamps);
        
        // Calc aspect ratio to fit width
        const availableWidth = pageWidth - (margin * 2);
        const ratio = sheet.height / sheet.width;
        
        let imgWidth = availableWidth;
        let imgHeight = imgWidth * ratio;
        
        // Constraint check
        if (imgHeight > maxImgHeight) {
            imgHeight = maxImgHeight;
            imgWidth = imgHeight / ratio;
        }

        // Center image
        const xPos = (pageWidth - imgWidth) / 2;
        doc.addImage(imgData, 'PNG', xPos, currentY, imgWidth, imgHeight);
        
        currentY += imgHeight + gap;
    } catch (e) {
        console.error("Error generating image", e);
        doc.text("[Ошибка генерации изображения]", margin, currentY + 10);
        currentY += 20;
    }

    // Common Table Styles for Compactness, Boldness and Black Text
    const tableStyles: any = {
        theme: 'grid', // Force grid to show all borders
        styles: { 
            fontSize: 8, 
            font: "Roboto", 
            fontStyle: "bold", // Bold for body
            textColor: [0, 0, 0], // Black text for body
            cellPadding: 1.5, 
            overflow: 'ellipsize',
            lineWidth: 0.1,
            lineColor: [0, 0, 0]
        },
        headStyles: { 
            fontSize: 8, 
            font: "Roboto", 
            fontStyle: "bold", 
            halign: 'center',
            lineWidth: 0.1,
            lineColor: [0, 0, 0],
            textColor: [255, 255, 255] // Keep headers white
        },
        margin: { left: margin, right: margin }
    };

    // 5. Render Sheet Table
    runAutoTable({
        startY: currentY,
        head: [['ПАРАМЕТРЫ ЛИСТА', 'ЗНАЧЕНИЯ', 'ПОЛОЖЕНИЕ ЗАЖИМОВ']],
        body: sheetBody,
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [45, 55, 72] },
        columnStyles: { 0: { width: 40 } }
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + gap;

    // 6. Render Parts Table
    doc.setFontSize(10);
    doc.setFont("Roboto", "bold");
    doc.text("Список Деталей (Кратко)", margin, currentY - 1);
    
    runAutoTable({
        startY: currentY,
        head: [['Наименование', 'Размеры', 'На листе', 'В заказе']],
        body: partsBody,
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [49, 130, 206] },
        columnStyles: { 
            2: { halign: 'center' }, 
            3: { halign: 'center' } 
        }
    });

    currentY = (doc as any).lastAutoTable?.finalY + gap;

    // 7. Render Tool Table
    doc.setFontSize(10);
    doc.text("Инструмент", margin, currentY - 1);
    runAutoTable({
        startY: currentY,
        head: [['Станция', 'Инструмент', 'Угол', 'Зазор', 'Уд.']],
        body: toolBody,
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [214, 158, 46] }, // Orange
        columnStyles: { 
            0: { halign: 'center' }, 
            2: { halign: 'center' },
            3: { halign: 'center' }, 
            4: { halign: 'center' } 
        }
    });

    // 8. Fixed Footer (Always at bottom of Page 1)
    const renderFooter = (d: jsPDF) => {
        const footerY = pageHeight - 30;
        d.setDrawColor(0);
        d.setLineWidth(0.5);
        d.setFontSize(9);
        d.setFont("Roboto", "bold");

        // Box 1
        d.rect(margin, footerY, 50, 12);
        d.text("ВЫПОЛНЕНО", margin + 2, footerY + 8);
        d.rect(margin + 40, footerY + 3, 6, 6);

        // Box 2
        d.rect(margin + 55, footerY, 50, 12);
        d.text("НЕ ВЫПОЛНЕНО", margin + 57, footerY + 8);
        d.rect(margin + 95, footerY + 3, 6, 6);

        // Box 3
        d.rect(margin + 110, footerY, 60, 12);
        d.text("ОШИБКА ПРОГР.", margin + 112, footerY + 8);
        d.rect(margin + 160, footerY + 3, 6, 6);

        // Signatures Line
        d.setFont("Roboto", "normal");
        d.text("Оператор: __________________", margin, footerY + 25);
        d.text("Дата изг.: __________________", pageWidth - margin - 60, footerY + 25);
    };

    renderFooter(doc);

    // --- PAGE 2: DETAILED PRODUCTION INFO ---
    doc.addPage();
    
    // Header for Page 2
    doc.setFont("Roboto", "bold");
    doc.setFontSize(14);
    doc.text("ДЕТАЛИЗАЦИЯ ПРОИЗВОДСТВА (PRODUCTION DETAILS)", margin, 15);
    
    // Prepare Data for Detailed Table
    const detailedBody = Array.from(partsOnSheet.keys()).map(partId => {
        const part = parts.find(p => p.id === partId);
        const scheduled = scheduledParts.find(sp => sp.partId === partId);
        
        const totalRequired = scheduled ? scheduled.quantity : 0;
        const qtyOnThisLayout = partsOnSheet.get(partId) || 0;
        const sheetMultiplier = sheet.quantity; // How many sheets of this type
        const producedThisRun = qtyOnThisLayout * sheetMultiplier;
        
        // Find other sheets containing this part
        const otherLocations: string[] = [];
        allSheets.forEach((s, idx) => {
            // Skip current sheet instance (by ID check if available, or just logic)
            // But usually we want to see ALL locations.
            // Let's filter to show "Other" sheets or list all distribution.
            // The prompt asks "on which *other* sheets".
            if (s.id === sheet.id) return; // Skip self

            const countOnOther = s.placedParts.filter(pp => pp.partId === partId).length;
            if (countOnOther > 0) {
                // Sheet name usually "Sheet 1", "Sheet 2".
                // If sheets are generic, use index.
                const sName = s.sheetName || `Sheet ${idx + 1}`;
                otherLocations.push(`${sName} (x${s.quantity}): ${countOnOther * s.quantity} шт.`);
            }
        });

        const otherSheetsStr = otherLocations.length > 0 ? otherLocations.join('\n') : "Нет (Только этот лист)";

        return [
            part?.name || 'Unknown',
            totalRequired,
            `${qtyOnThisLayout} шт.`,
            `x ${sheetMultiplier}`,
            `${producedThisRun} шт.`,
            otherSheetsStr
        ];
    });

    runAutoTable({
        startY: 20,
        head: [['Наименование', 'Всего нужно', 'На листе', 'Кратность', 'Итого с листа', 'Другие листы (Распределение)']],
        body: detailedBody,
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [75, 85, 99] }, // Gray-600
        columnStyles: { 
            1: { halign: 'center', width: 20 }, 
            2: { halign: 'center', width: 20 },
            3: { halign: 'center', width: 20 },
            4: { halign: 'center', fontStyle: 'bold', width: 25 }
        }
    });

    // Optional Footer on Page 2
    renderFooter(doc);
    
    // Save - sanitize filename for download to prevent filesystem errors
    const safeFilename = ncFilename.replace(/[\/\\]/g, '_');
    doc.save(`${safeFilename}_report.pdf`);
};