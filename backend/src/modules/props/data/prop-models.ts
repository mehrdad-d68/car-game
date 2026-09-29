export interface PropModelEntry {
  filename: string;
  targetLength: number;
  yawOffset: number;
}

export const PROP_MODELS: Record<string, PropModelEntry> = {
  busStop: {
    filename: 'bus-station.glb',
    targetLength: 12,
    yawOffset: 0,
  },
  policeStation: {
    filename: 'police-station.glb',
    targetLength: 25.1,
    yawOffset: 0,
  },
};
