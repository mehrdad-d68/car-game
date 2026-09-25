import { MapItemKind } from './osm-types';

export type PropShape =
  'box' | 'roundedBox' | 'cylinderZ' | 'cylinderY' | 'sphere' | 'visor';

export type PropMaterial = 'lens' | 'housing' | 'sign';

export interface PropRepeat {
  axis: 'x' | 'z';
  spacing: number;
  max: number;
}

export interface PropPart {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  color: number;
  emissive?: number;
  renderOrder?: number;
  castShadow?: boolean;
  shape?: PropShape;
  material?: PropMaterial;
  repeat?: PropRepeat;
  scaleWithFootprint?: boolean;
}

export interface PropVariant {
  id: string;
  parts: PropPart[];
}

export interface PropModel {
  url: string;
  targetLength: number;
  yawOffset: number;
}

export interface PropSpec {
  kind: MapItemKind;
  name: string;
  footprint?: { width: number; depth: number };
  variants: PropVariant[];
  model?: PropModel;
}