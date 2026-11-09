import { DxfLwPolyline } from '../types';
import { dxfEntitiesToSvg } from './dxfParser';

export interface ParsedCpTool {
    name: string;
    width: number;
    height: number;
    path: string;
    normalizedEntities: DxfLwPolyline[];
}

interface CpGeometryRecord {
    x: number;
    y: number;
    flag: number;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

const parseGeometryRecord = (line: string): CpGeometryRecord | null => {
    const values = line.trim().split(/\s+/);
    if (values.length < 3) return null;

    const x = Number(values[0]);
    const y = Number(values[1]);
    const flag = Number(values[2]);

    if (![x, y, flag].every(Number.isFinite) || !Number.isInteger(flag)) return null;
    return { x, y, flag };
};

/**
 * Imports the DRAWING contour stored in a Finn-Power .CP tool file.
 *
 * CP contour records use 0 for a line vertex, 8 for the initial vertex,
 * and +/-1 for an arc centre located between the arc start and end vertices.
 * In this format +1 denotes clockwise and -1 counter-clockwise travel.
 */
export const parseCpTool = (content: string, fileName: string): ParsedCpTool => {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim());
    if (lines[0]?.toUpperCase() !== 'DRAWING') {
        throw new Error('Файл не похож на Finn-Power CP: отсутствует заголовок DRAWING.');
    }

    const drawingName = (lines[1] || '').trim();
    if (!drawingName || /^(ALT90|ALT180|ALT270)$/i.test(drawingName)) {
        throw new Error('В CP-файле не указано имя инструмента.');
    }

    const firstRecordIndex = lines.findIndex((line, index) =>
        index >= 2 && parseGeometryRecord(line) !== null
    );
    if (firstRecordIndex < 0) {
        throw new Error('В CP-файле не найдены координаты контура инструмента.');
    }

    const records: CpGeometryRecord[] = [];
    let foundTerminator = false;

    for (let i = firstRecordIndex; i < lines.length; i++) {
        if (!lines[i]) continue;
        const record = parseGeometryRecord(lines[i]);
        if (!record) {
            // Metadata begins after the geometry terminator. Before it, malformed
            // coordinate rows must not be silently ignored.
            if (foundTerminator) break;
            throw new Error(`Некорректная строка геометрии CP (строка ${i + 1}).`);
        }

        if (record.flag === 99) {
            foundTerminator = true;
            break;
        }

        if (![0, 1, -1, 8].includes(record.flag)) {
            throw new Error(`Неизвестный флаг геометрии CP: ${record.flag} (строка ${i + 1}).`);
        }
        records.push(record);
    }

    if (!foundTerminator) {
        throw new Error('В CP-файле отсутствует признак окончания контура (флаг 99).');
    }
    if (records.length < 4 || records[0].flag !== 8) {
        throw new Error('Контур CP должен начинаться с точки, отмеченной флагом 8.');
    }

    const vertices: { x: number; y: number }[] = [{ x: records[0].x, y: records[0].y }];
    const bulges: number[] = [];
    let current = vertices[0];
    let closed = false;
    const closeTolerance = 0.01;

    const appendSegment = (end: { x: number; y: number }, bulge: number, lineNumber: number) => {
        if (distance(current, end) <= 1e-9) return;

        const currentIndex = vertices.length - 1;
        bulges[currentIndex] = bulge;

        if (distance(end, vertices[0]) <= closeTolerance) {
            closed = true;
            return;
        }

        vertices.push({ x: end.x, y: end.y });
        current = vertices[vertices.length - 1];
    };

    for (let i = 1; i < records.length && !closed; i++) {
        const record = records[i];

        if (record.flag === 1 || record.flag === -1) {
            const end = records[i + 1];
            if (!end || (end.flag !== 0 && end.flag !== 8)) {
                throw new Error(`Для центра дуги в строке ${firstRecordIndex + i + 1} отсутствует конечная точка.`);
            }

            const center = { x: record.x, y: record.y };
            const startAngle = Math.atan2(current.y - center.y, current.x - center.x);
            const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
            const radiusStart = distance(current, center);
            const radiusEnd = distance(end, center);
            const radiusTolerance = Math.max(0.01, radiusStart * 0.005);

            if (radiusStart <= 1e-9 || Math.abs(radiusStart - radiusEnd) > radiusTolerance) {
                throw new Error(`Некорректный радиус дуги около строки ${firstRecordIndex + i + 1}.`);
            }

            let sweep = endAngle - startAngle;
            if (record.flag === -1) {
                while (sweep <= 0) sweep += Math.PI * 2;
            } else {
                while (sweep >= 0) sweep -= Math.PI * 2;
            }

            const bulge = Math.tan(sweep / 4);
            if (!Number.isFinite(bulge)) {
                throw new Error(`Не удалось рассчитать дугу около строки ${firstRecordIndex + i + 1}.`);
            }

            appendSegment(end, bulge, firstRecordIndex + i + 1);
            i++;
            continue;
        }

        if (record.flag === 0 || record.flag === 8) {
            appendSegment({ x: record.x, y: record.y }, 0, firstRecordIndex + i + 1);
        }
    }

    if (!closed || vertices.length < 3) {
        throw new Error('Контур специального инструмента должен быть замкнутым и содержать минимум 3 вершины.');
    }

    bulges.length = vertices.length;
    for (let i = 0; i < vertices.length; i++) {
        if (bulges[i] === undefined) bulges[i] = 0;
    }

    const polyline: DxfLwPolyline = {
        type: 'LWPOLYLINE',
        vertices,
        bulges,
        closed: true
    };
    const converted = dxfEntitiesToSvg([polyline]);

    if (!converted.path || !Number.isFinite(converted.width) || !Number.isFinite(converted.height) ||
        converted.width <= 0 || converted.height <= 0) {
        throw new Error('Не удалось построить корректную геометрию специального инструмента из CP-файла.');
    }

    return {
        name: drawingName || fileName.replace(/\.cp$/i, ''),
        width: Number(converted.width.toFixed(6)),
        height: Number(converted.height.toFixed(6)),
        path: converted.path,
        normalizedEntities: converted.normalizedEntities as DxfLwPolyline[]
    };
};
