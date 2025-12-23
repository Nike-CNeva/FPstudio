
/**
 * ДЕТАЛИ И ПРОФИЛИ
 * Ответственность: Описание геометрии деталей, материалов и параметров гибки (профилей).
 */
import { DxfEntity } from './geometry.types';
import { PlacedTool } from './tools.types';

export interface PartGeometry {
  path: string; // SVG представление
  width: number;
  height: number;
  entities: DxfEntity[]; // Исходные объекты для привязок
  bbox: { minX: number; minY: number; maxX: number; maxY: number; };
}

export interface PartMaterial {
    code: string; 
    thickness: number;
    dieClearance: number;
}

export interface NestingConstraints {
    allow0_180: boolean;
    allow90_270: boolean;
    initialRotation: number;
    commonLine: boolean;
    canMirror: boolean;
}

export interface ParametricScript {
    id: string;
    name: string;
    code: string;
    defaultWidth: number;
    defaultHeight: number;
    updatedAt: number;
}

export interface PartProfile {
    type: 'flat' | 'L' | 'U';
    orientation: 'vertical' | 'horizontal';
    dims: {
        a: number; // Полка A
        b: number; // Полка/Стенка B
        c: number; // Полка C
    };
}

export interface Part {
  id:string;
  name: string;
  geometry: PartGeometry;
  punches: PlacedTool[];
  
  material: PartMaterial;
  nesting: NestingConstraints;
  
  faceWidth: number;
  faceHeight: number;
  
  profile?: PartProfile;
  script?: string;

  customer?: string;
  workOrder?: string;
}

export interface PlacedPart {
  id: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
}
