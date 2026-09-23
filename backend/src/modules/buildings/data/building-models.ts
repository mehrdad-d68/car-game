export interface BuildingModelEntry {
  filename: string;
  targetWidth: number;
  yawOffset: number;
}

export const BUILDING_MODELS: Record<string, BuildingModelEntry> = {};
