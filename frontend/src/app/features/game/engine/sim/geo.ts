import { Vec2 } from './types';

export const METERS_PER_DEGREE_LAT = 111320;

export interface GeoCenter {
  lat: number;
  lng: number;
}

export interface GeoProjector {
  (lat: number, lon: number): Vec2;
}

export interface GeoUnprojector {
  (x: number, z: number): { lat: number; lng: number };
}

export function makeGeoProjector(center: GeoCenter): GeoProjector {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const perDegreeLon = METERS_PER_DEGREE_LAT * cosLat;
  return (lat, lon) => ({
    x: (lon - center.lng) * perDegreeLon,
    z: -(lat - center.lat) * METERS_PER_DEGREE_LAT,
  });
}

export function makeGeoUnprojector(center: GeoCenter): GeoUnprojector {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const perDegreeLon = METERS_PER_DEGREE_LAT * cosLat;
  return (x, z) => ({
    lat: center.lat - z / METERS_PER_DEGREE_LAT,
    lng: center.lng + x / perDegreeLon,
  });
}