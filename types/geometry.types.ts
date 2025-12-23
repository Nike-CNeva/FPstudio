
/**
 * Types related to geometry entities (DXF, SVG, bounding boxes)
 * This file should contain only structural geometry contracts.
 * UI, business logic, and services must NOT be here.
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
