
/**
 * ОТВЕТСТВЕННОСТЬ: Инфраструктурные функции для jsPDF.
 */
import { jsPDF } from "jspdf";

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

export const loadReportFonts = async (doc: jsPDF) => {
    try {
        const fontBaseUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/";
        const [resRegular, resBold] = await Promise.all([
            fetch(`${fontBaseUrl}Roboto-Regular.ttf`),
            fetch(`${fontBaseUrl}Roboto-Medium.ttf`)
        ]);

        if (resRegular.ok && resBold.ok) {
            const bufRegular = await resRegular.arrayBuffer();
            const bufBold = await resBold.arrayBuffer();
            
            doc.addFileToVFS("Roboto-Regular.ttf", arrayBufferToBase64(bufRegular));
            doc.addFileToVFS("Roboto-Bold.ttf", arrayBufferToBase64(bufBold));
            
            doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
            doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
            doc.setFont("Roboto", "normal"); 
            return true;
        }
    } catch (e) {
        console.error("Error loading fonts:", e);
    }
    return false;
};
