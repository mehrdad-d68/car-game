import { Vec2 } from './types';

export interface OSMMeta {
  source: string;
  generatedAt: string;
  place: string;
  center: { lat: number; lng: number };
  bbox: { south: number; west: number; north: number; east: number };
  totalRoads: number;
}

export interface OSMRoad {
  id: number;
  type: string;
  name: string;
  lanes: number;
  width: number;
  oneway: 0 | 1 | -1;
  access: string;
  points: Vec2[];
}

export interface OSMMapData {
  meta: OSMMeta;
  roads: OSMRoad[];
}
