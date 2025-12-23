
/**
 * ОТВЕТСТВЕННОСТЬ: Оркестрация процесса создания PDF.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { NestResultSheet, Part, Tool, ScheduledPart } from "../../types";
import { generateSheetImage } from "./visualizer";
import { loadReportFonts } from "./pdfHelpers";
import { getSheetTableData, getPartsTableData, getToolingTableData, getProductionDetailsData } from "./dataTransform";

const tableStyles: any = {
    theme: 'grid',
    styles: { fontSize: 8, font: "Roboto", fontStyle: "bold", textColor: [0, 0, 0], cellPadding: 1.5, lineWidth: 0.1, lineColor: [0, 0, 0] },
    headStyles: { fontSize: 8, font: "Roboto", fontStyle: "bold", halign: 'center', lineWidth: 0.1, lineColor: [0, 0, 0], textColor: [255, 255, 255] }
};

const renderFooter = (doc: jsPDF, margin: number, pageWidth: number, pageHeight: number) => {
    const footerY = pageHeight - 30;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.setFontSize(9);
    doc.setFont("Roboto", "bold");

    doc.rect(margin, footerY, 50, 12);
    doc.text("ВЫПОЛНЕНО", margin + 2, footerY + 8);
    doc.rect(margin + 40, footerY + 3, 6, 6);

    doc.rect(margin + 55, footerY, 50, 12);
    doc.text("НЕ ВЫПОЛНЕНО", margin + 57, footerY + 8);
    doc.rect(margin + 95, footerY + 3, 6, 6);

    doc.rect(margin + 110, footerY, 60, 12);
    doc.text("ОШИБКА ПРОГР.", margin + 112, footerY + 8);
    doc.rect(margin + 160, footerY + 3, 6, 6);

    doc.setFont("Roboto", "normal");
    doc.text("Оператор: __________________", margin, footerY + 25);
    doc.text("Дата изг.: __________________", pageWidth - margin - 60, footerY + 25);
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
    await loadReportFonts(doc);
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const runAutoTable = (options: any) => ((autoTable as any).default || autoTable)(doc, options);

    // Header
    doc.setFont("Roboto", "bold");
    doc.setFontSize(16);
    doc.text("ОТЧЕТ РАСКРОЯ (SETUP SHEET)", margin, 15);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    doc.text(`Файл: ${ncFilename}`, margin, 22);
    doc.text(`Дата: ${new Date().toLocaleString()}`, pageWidth - margin - 50, 22);

    let currentY = 25;

    // Image
    const imgData = await generateSheetImage(sheet, parts, clamps);
    const imgWidth = pageWidth - (margin * 2);
    const imgHeight = Math.min(80, imgWidth * (sheet.height / sheet.width));
    doc.addImage(imgData, 'PNG', margin + (imgWidth - (imgHeight * (sheet.width / sheet.height))) / 2, currentY, imgHeight * (sheet.width / sheet.height), imgHeight);
    currentY += imgHeight + 5;

    // Tables Page 1
    runAutoTable({
        startY: currentY,
        head: [['ПАРАМЕТРЫ ЛИСТА', 'ЗНАЧЕНИЯ', 'ПОЛОЖЕНИЕ ЗАЖИМОВ']],
        body: getSheetTableData(sheet, clamps),
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [45, 55, 72] }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 5;
    doc.text("Список Деталей (Кратко)", margin, currentY - 1);
    runAutoTable({
        startY: currentY,
        head: [['Наименование', 'Размеры', 'На листе', 'В заказе']],
        body: getPartsTableData(sheet, parts, scheduledParts),
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [49, 130, 206] }
    });

    currentY = (doc as any).lastAutoTable.finalY + 5;
    doc.text("Инструмент", margin, currentY - 1);
    runAutoTable({
        startY: currentY,
        head: [['Станция', 'Инструмент', 'Угол', 'Зазор', 'Уд.']],
        body: getToolingTableData(sheet, parts, tools),
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [214, 158, 46] }
    });

    renderFooter(doc, margin, pageWidth, pageHeight);

    // Page 2
    doc.addPage();
    doc.setFont("Roboto", "bold");
    doc.setFontSize(14);
    doc.text("ДЕТАЛИЗАЦИЯ ПРОИЗВОДСТВА (PRODUCTION DETAILS)", margin, 15);
    
    runAutoTable({
        startY: 20,
        head: [['Наименование', 'Всего нужно', 'На листе', 'Кратность', 'Итого с листа', 'Другие листы (Распределение)']],
        body: getProductionDetailsData(sheet, parts, scheduledParts, allSheets),
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [75, 85, 99] }
    });

    renderFooter(doc, margin, pageWidth, pageHeight);
    
    doc.save(`${ncFilename.replace(/[\/\\]/g, '_')}_report.pdf`);
};
