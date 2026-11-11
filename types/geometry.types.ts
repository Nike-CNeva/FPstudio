
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
  bulges?: number[];
  contourType?: 'outer' | 'inner';
}

export interface DxfCircle {
  type: 'CIRCLE';
  center: Point;
  radius: number;
  contourType?: 'outer' | 'inner';
}

export interface DxfArc {
  type: 'ARC';
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  contourType?: 'outer' | 'inner';
}

export interface DxfLine {
  type: 'LINE';
  start: Point;
  end: Point;
  contourType?: 'outer' | 'inner';
}

export type DxfEntity = DxfLwPolyline | DxfCircle | DxfArc | DxfLine;
