export type PartMaterial =
  'wall' | 'glass' | 'roof' | 'trim' | 'door' | 'shopfront';

export interface BuildingPart {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  color: number;
  material?: PartMaterial;
  emissive?: number;
  castShadow?: boolean;
}

export interface BuildingModel {
  url: string;
  targetWidth: number;
  yawOffset: number;
}

export interface BuildingSpec {
  id: string;
  name: string;
  category: 'house' | 'apartment' | 'shop' | 'works' | 'civic';
  footprint: { width: number; depth: number; tolerance: number };
  height: number;
  floors: number;
  match?: {
    osmTypes?: string[];
    minArea?: number;
    maxArea?: number;
    minFloors?: number;
    maxFloors?: number;
    weight?: number;
  };
  parts: BuildingPart[];
  model?: BuildingModel;
}

export interface BuildingPlacement {
  specId: string;
  x: number;
  z: number;
  yaw: number;
}

export interface BuildingAssignment {
  spec: string | null;
  yaw?: number;
  scale?: [number, number];
}

export type BuildingAssignments = Record<string, BuildingAssignment>;
