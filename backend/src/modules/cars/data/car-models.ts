export interface CarModelEntry {
  filename: string;
  targetLength: number;
  yawOffset: number;
}

export const CAR_MODELS: Record<string, CarModelEntry> = {
  coupe: {
    filename: 'ergoninane-fast-72.glb',
    targetLength: 3.6,
    yawOffset: Math.PI,
  },
};