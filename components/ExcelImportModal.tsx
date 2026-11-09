
import React, { useState, useRef } from 'react';
import { FileExcelIcon, DownloadIcon, CheckIcon } from './Icons';
import * as XLSX from 'xlsx';
import { ParametricScript, Part, Tool, ScheduledPart, PartProfile } from '../types';
import { generateId } from '../utils/helpers';
import { executeParametricScript } from '../services/scriptExecutor';
import { detectPartProfile } from '../services/geometry';

interface ExcelImportModalProps {
    onClose: () => void;
    scripts: ParametricScript[];
    parts: Part[];
    tools: Tool[];
    onProcess: (newLibraryParts: Part[], newScheduledParts: ScheduledPart[]) => void;
}

interface ProcessReportItem {
    status: 'found' | 'created' | 'missing_script' | 'error';
    name: string;
    qty: number;
    message: string;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ onClose, scripts, parts, tools, onProcess }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [report, setReport] = useState<ProcessReportItem[]>([]);
    const [isProcessed, setIsProcessed] = useState(false);
    const [tempNewParts, setTempNewParts] = useState<Part[]>([]);
    const [tempScheduled, setTempScheduled] = useState<ScheduledPart[]>([]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            processExcel(file);
        }
        event.target.value = ''; // Reset
    };

    const processExcel = async (file: File) => {
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        const MAX_ROWS = 5000;
        const MAX_COLUMNS = 100;

        if (file.size === 0) {
            alert("Файл пустой.");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            alert("Файл слишком большой. Максимальный размер — 10 МБ.");
            return;
        }
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            alert("Поддерживаются только файлы Excel .xlsx и .xls.");
            return;
        }

        const readNumber = (value: unknown, fallback: number): number | null => {
            if (value === undefined || value === null || String(value).trim() === '') return fallback;
            if (typeof value === 'number') return Number.isFinite(value) ? value : null;
            const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
            if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : null;
        };

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, {
                type: 'array',
                cellDates: false,
                sheetRows: MAX_ROWS + 1
            });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                alert("В файле не найден лист с данными.");
                return;
            }

            const sheet = workbook.Sheets[sheetName];
            const rangeRef = sheet['!fullref'] || sheet['!ref'];
            if (!rangeRef) {
                alert("Первый лист Excel пустой.");
                return;
            }

            const range = XLSX.utils.decode_range(rangeRef);
            const rowCount = range.e.r - range.s.r + 1;
            const columnCount = range.e.c - range.s.c + 1;
            if (rowCount > MAX_ROWS + 1) {
                alert(`В файле больше ${MAX_ROWS} строк данных. Разделите файл на несколько частей.`);
                return;
            }
            if (columnCount > MAX_COLUMNS) {
                alert(`В файле больше ${MAX_COLUMNS} столбцов. Проверьте структуру таблицы.`);
                return;
            }

            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
                defval: '',
                raw: true,
                blankrows: false
            });
            if (rows.length === 0) {
                alert("На первом листе нет строк для импорта.");
                return;
            }

            const newReport: ProcessReportItem[] = [];
            const newPartsBuffer: Part[] = [];
            const scheduledBuffer: ScheduledPart[] = [];

            rows.forEach((row, index) => {
                const rowNumber = index + 2;
                const r: Record<string, unknown> = {};
                Object.keys(row).forEach(k => {
                    r[k.toLowerCase().trim()] = row[k];
                });

                const rawScriptName = r['script'] ?? r['название скрипта'];
                const scriptName = String(rawScriptName ?? '').trim();
                const qty = readNumber(r['qty'] ?? r['количество'], 1);
                const materialValue = r['material'] ?? r['материал'];
                const material = String(materialValue ?? 'St-3').trim() || 'St-3';
                const thickness = readNumber(r['thickness'] ?? r['толщина'], 1.0);

                const numericFields: Array<[string, number | null]> = [
                    ['Количество (Qty)', qty],
                    ['Толщина (Thickness)', thickness],
                    ['H_Top', readNumber(r['h_top'] ?? r['высота верх'], 0)],
                    ['H_Center', readNumber(r['h_center'] ?? r['высота центр'], 0)],
                    ['H_Bottom', readNumber(r['h_bottom'] ?? r['высота низ'], 0)],
                    ['W_Left', readNumber(r['w_left'] ?? r['ширина лево'], 0)],
                    ['W_Center', readNumber(r['w_center'] ?? r['ширина центр'], 0)],
                    ['W_Right', readNumber(r['w_right'] ?? r['ширина право'], 0)],
                    ['Width', readNumber(r['width'] ?? r['ширина'], 0)],
                    ['Height', readNumber(r['height'] ?? r['высота'], 0)]
                ];
                const invalidField = numericFields.find(([, value]) => value === null);
                if (invalidField) {
                    newReport.push({
                        status: 'error',
                        name: scriptName || `Строка ${rowNumber}`,
                        qty: 0,
                        message: `Некорректное числовое значение: ${invalidField[0]}`
                    });
                    return;
                }

                const values = Object.fromEntries(numericFields) as Record<string, number>;
                const rowQty = values['Количество (Qty)'];
                const rowThickness = values['Толщина (Thickness)'];
                const hTop = values['H_Top'];
                const hCenter = values['H_Center'];
                const hBottom = values['H_Bottom'];
                const wLeft = values['W_Left'];
                const wCenter = values['W_Center'];
                const wRight = values['W_Right'];
                const genWidth = values['Width'];
                const genHeight = values['Height'];

                if (!scriptName) {
                    newReport.push({ status: 'error', name: `Строка ${rowNumber}`, qty: 0, message: "Не указано имя скрипта" });
                    return;
                }
                if (!Number.isInteger(rowQty) || rowQty < 1) {
                    newReport.push({ status: 'error', name: scriptName, qty: 0, message: "Количество должно быть целым числом больше нуля" });
                    return;
                }
                if (rowThickness <= 0) {
                    newReport.push({ status: 'error', name: scriptName, qty: rowQty, message: "Толщина должна быть больше нуля" });
                    return;
                }
                if ([hTop, hCenter, hBottom, wLeft, wCenter, wRight, genWidth, genHeight].some(value => value < 0)) {
                    newReport.push({ status: 'error', name: scriptName, qty: rowQty, message: "Размеры не могут быть отрицательными" });
                    return;
                }

                const script = scripts.find(s => s.name.toLowerCase() === scriptName.toLowerCase());
                if (!script) {
                    newReport.push({ status: 'missing_script', name: scriptName, qty: rowQty, message: "Скрипт не найден в библиотеке" });
                    return;
                }

                let profileType: PartProfile['type'] = 'flat';
                let orientation: PartProfile['orientation'] = 'vertical';
                const code = script.code;

                if (code.includes('// L-Profile Vertical') || code.includes('L-профиль (vertical)')) {
                    profileType = 'L'; orientation = 'vertical';
                } else if (code.includes('// L-Profile Horizontal') || code.includes('L-профиль (horizontal)')) {
                    profileType = 'L'; orientation = 'horizontal';
                } else if (code.includes('// U-Profile Vertical') || code.includes('U-профиль (vertical)')) {
                    profileType = 'U'; orientation = 'vertical';
                } else if (code.includes('// U-Profile Horizontal') || code.includes('U-профиль (horizontal)')) {
                    profileType = 'U'; orientation = 'horizontal';
                }

                let finalW = genWidth;
                let finalH = genHeight;
                const params: Record<string, number> = {};

                if (profileType === 'L') {
                    if (orientation === 'vertical') {
                        params.a = wLeft; params.b = wRight || wCenter;
                        finalW = params.a + params.b;
                        finalH = hCenter || genHeight;
                    } else {
                        params.a = hTop; params.b = hBottom || hCenter;
                        finalH = params.a + params.b;
                        finalW = wCenter || genWidth;
                    }
                } else if (profileType === 'U') {
                    if (orientation === 'vertical') {
                        params.a = wLeft; params.b = wCenter; params.c = wRight;
                        finalW = params.a + params.b + params.c;
                        finalH = hCenter || genHeight;
                    } else {
                        params.a = hTop; params.b = hCenter; params.c = hBottom;
                        finalH = params.a + params.b + params.c;
                        finalW = wCenter || genWidth;
                    }
                } else {
                    if (finalW === 0 && wCenter !== 0) finalW = wCenter;
                    if (finalH === 0 && hCenter !== 0) finalH = hCenter;
                }

                if (!Number.isFinite(finalW) || !Number.isFinite(finalH) || finalW <= 0 || finalH <= 0) {
                    newReport.push({ status: 'error', name: scriptName, qty: rowQty, message: "Итоговые ширина и высота должны быть больше нуля" });
                    return;
                }

                const usedDims = [wLeft, wCenter, wRight, hTop, hCenter, hBottom];
                const dimStr = usedDims.filter(d => d > 0).map(d => Math.round(d)).join('x');
                const dimsPart = dimStr || `${Math.round(finalW)}x${Math.round(finalH)}`;
                const partName = `${script.name}_${dimsPart}`;

                let existingPart = parts.find(p => p.name === partName);
                if (!existingPart) {
                    existingPart = newPartsBuffer.find(p => p.name === partName);
                }

                let targetPartId = '';
                if (existingPart) {
                    targetPartId = existingPart.id;
                    newReport.push({ status: 'found', name: partName, qty: rowQty, message: "Найдено в библиотеке" });
                } else {
                    try {
                        const basePart: Part = {
                            id: 'temp_base',
                            name: 'Base',
                            faceWidth: finalW,
                            faceHeight: finalH,
                            geometry: { path: '', width: finalW, height: finalH, entities: [], bbox: {minX:0,minY:0,maxX:finalW,maxY:finalH} },
                            punches: [],
                            material: { code: material, thickness: rowThickness, dieClearance: 0.2 },
                            nesting: { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: false, canMirror: false }
                        };

                        const generated = executeParametricScript(basePart, script.code, tools, finalW, finalH, params);
                        const newPart: Part = {
                            ...generated,
                            id: generateId(),
                            name: partName,
                            profile: {
                                type: profileType,
                                orientation: orientation,
                                dims: params
                            }
                        };
                        if (profileType === 'flat') newPart.profile = detectPartProfile(newPart.geometry);

                        newPartsBuffer.push(newPart);
                        targetPartId = newPart.id;
                        newReport.push({ status: 'created', name: partName, qty: rowQty, message: "Сгенерировано по скрипту" });
                    } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        newReport.push({ status: 'error', name: partName, qty: rowQty, message: `Ошибка генерации: ${message}` });
                        return;
                    }
                }

                if (targetPartId) {
                    scheduledBuffer.push({
                        partId: targetPartId,
                        quantity: rowQty,
                        nesting: {
                            allow0_180: true,
                            allow90_270: true,
                            initialRotation: 0,
                            commonLine: false,
                            canMirror: false
                        }
                    });
                }
            });

            setReport(newReport);
            setTempNewParts(newPartsBuffer);
            setTempScheduled(scheduledBuffer);
            setIsProcessed(true);
        } catch (error) {
            console.error("Ошибка импорта Excel:", error);
            const message = error instanceof Error ? error.message : String(error);
            alert(`Не удалось прочитать Excel-файл. Проверьте формат и целостность файла. ${message}`);
        }
    };

    const handleApply = () => {
        onProcess(tempNewParts, tempScheduled);
        onClose();
    };

    return (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl flex flex-col border border-gray-700 max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <FileExcelIcon className="w-5 h-5 mr-2 text-green-500"/>
                        Пакетная генерация (Excel)
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto">
                    {!isProcessed ? (
                        <div className="space-y-6">
                            <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600">
                                <h3 className="text-sm font-bold text-gray-300 mb-2">Инструкция</h3>
                                <p className="text-xs text-gray-400 mb-2">
                                    Загрузите файл Excel (.xlsx) со следующими колонками (заголовки не чувствительны к регистру):
                                </p>
                                <ul className="list-disc list-inside text-xs text-gray-400 space-y-1 ml-2 font-mono">
                                    <li>Script (Обязательно)</li>
                                    <li>Qty, Material, Thickness</li>
                                    <li>H_Top, H_Center, H_Bottom (Высоты)</li>
                                    <li>W_Left, W_Center, W_Right (Ширины)</li>
                                </ul>
                            </div>

                            <div 
                                className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-12 hover:bg-gray-700/30 transition-colors cursor-pointer bg-gray-800" 
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls" className="hidden" />
                                <DownloadIcon className="w-8 h-8 text-gray-500 mb-2 rotate-180" />
                                <p className="text-sm font-bold text-gray-300">Нажмите для загрузки файла</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-white">Отчет обработки</h3>
                                <div className="text-xs space-x-2">
                                    <span className="text-green-400">Найдено: {report.filter(r=>r.status==='found').length}</span>
                                    <span className="text-blue-400">Создано: {report.filter(r=>r.status==='created').length}</span>
                                    <span className="text-red-400">Ошибок: {report.filter(r=>r.status==='error'||r.status==='missing_script').length}</span>
                                </div>
                            </div>
                            
                            <div className="bg-gray-900 rounded-md overflow-hidden border border-gray-700">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-800 text-gray-400">
                                        <tr>
                                            <th className="p-2">Статус</th>
                                            <th className="p-2">Деталь</th>
                                            <th className="p-2">Кол-во</th>
                                            <th className="p-2">Сообщение</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {report.map((item, idx) => (
                                            <tr key={idx} className={item.status === 'error' || item.status === 'missing_script' ? 'bg-red-900/20' : ''}>
                                                <td className="p-2">
                                                    {item.status === 'found' && <span className="text-green-500 font-bold">FOUND</span>}
                                                    {item.status === 'created' && <span className="text-blue-500 font-bold">NEW</span>}
                                                    {item.status === 'missing_script' && <span className="text-yellow-500 font-bold">NO SCRIPT</span>}
                                                    {item.status === 'error' && <span className="text-red-500 font-bold">ERR</span>}
                                                </td>
                                                <td className="p-2 font-mono">{item.name}</td>
                                                <td className="p-2">{item.qty}</td>
                                                <td className="p-2 text-gray-400">{item.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-700/50 flex justify-end space-x-3 rounded-b-lg border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm text-white">Отмена</button>
                    {isProcessed && (
                        <button 
                            onClick={handleApply} 
                            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md flex items-center space-x-2 text-sm font-bold text-white shadow-lg"
                            disabled={tempScheduled.length === 0}
                        >
                            <CheckIcon className="w-4 h-4"/>
                            <span>Добавить в раскрой ({tempScheduled.length})</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
