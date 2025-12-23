
/**
 * ИНСТРУМЕНТ И РЕВОЛЬВЕР
 * Ответственность: Описание физических параметров пуансонов, матриц и конфигурации револьверной головки.
 */
import { ToolShape, PunchType } from './enums.types';

export interface Tool {
  id: string;
  name: string;
  
  // Геометрия
  shape: ToolShape;
  width: number; // Размер X
  height: number; // Размер Y
  cornerRadius: number;
  toolSize: string; // Станция: 'A', 'B', 'C', 'D'
  description: string;
  customPath?: string; // Для DXF-инструментов Special
  
  punchType: PunchType;

  // Параметры в станке
  stationNumber?: number;
  stationType?: string; 
  mtIndex?: number; // Позиция в MultiTool (1-24)
  defaultRotation?: number;

  // Матрицы
  dies: {
    clearance: number;
  }[];
  
  // Технологические параметры
  stripperHeight: number;
  punchDepth: number;
  ramSpeed: number;
  acceleration: number;
  operatingMode: string; 
  
  // Приоритеты
  nibblingPriority: number;
  punchPriority: number;
  punchCount: number;
  isAutoIndex: boolean;
  
  // Ключи ориентации
  keyAngles: number[];
  
  // Оптимизация
  optimizingGroup: string;
  awayFromClamps: boolean;
  motionPrinciple: string;

  // Защита прижимов
  relievedStripper: '1-sided' | '2-sided' | 'none';
  yProtectionArea: number;
  zoneWidth: number;

  onlyForC5: boolean;
}

export interface StationConfig {
    id: number;
    type: string; // 'A', 'B', 'C', 'D', 'MT'
    isAutoIndex: boolean;
}

export interface TurretLayout {
    id: string;
    name: string;
    toolsSnapshot: Tool[]; 
    stations: StationConfig[];
}

export interface PlacedTool {
  id: string;
  toolId: string;
  x: number;
  y: number;
  rotation: number;
  lineId?: string; // Связь в группу (высечка)
}
