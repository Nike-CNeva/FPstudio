
/**
 * ГЕОМЕТРИЧЕСКИЕ ПРИМИТИВЫ И DXF
 * Ответственность: Описание структуры точек, линий, дуг и полилиний.
 * Используется в парсерах и сервисах топологии.
 */

export interface Point {
  x: number;
  y: number;
}

export interface DxfLwPolyline {
  type: 'LWPOLYLINE';
  vertices: Point[];
  closed: boolean;
}

export interface DxfCircle {
  type: 'CIRCLE';
  center: Point;
  radius: number;
}

export interface DxfArc {
  type: 'ARC';
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface DxfLine {
  type: 'LINE';
  start: Point;
  end: Point;
}

export type DxfEntity = DxfLwPolyline | DxfCircle | DxfArc | DxfLine;
