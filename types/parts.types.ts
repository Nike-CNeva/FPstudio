
import { DxfEntity, Point } from './geometry.types';
import { PlacedTool } from './tools.types';

/**
 * Domain: Parts and Profiles.
 * Definitions for part geometry, materials, and parametric metadata.
 */

export interface PartGeometry {
  path: string; // SVG path data
  width: number;
  height: number;
  entities: DxfEntity[]; // Store original entities for snapping calculations
  bbox: { minX: number; minY: number; maxX: number; maxY: number; }; // Bounding box of original geometry
}

export interface PartMaterial {
    code: string; // e.g. "Alum", "St-3", "Zink"
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
        a: number; // Flange A (Left or Top)
        b: number; // Web/Flange B (Center or Bottom/Right)
        c: number; // Flange C (Right or Bottom for U)
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

  script?: string; // JavaScript code for generating this part

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
