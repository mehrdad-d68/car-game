export interface Point {
  x: number;
  z: number;
}

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
  points: Point[];
}

export interface OSMBuilding {
  id: number;
  type: string;
  name: string;
  levels?: number;
  height?: number;
  points: Point[];
}

export const MAP_ITEM_KINDS = [
  'trafficLight',
  'pedestrianCrossing',
  'busStop',
  'gasStation',
  'fireStation',
  'hospital',
  'policeStation',
] as const;

export type MapItemKind = (typeof MAP_ITEM_KINDS)[number];

interface MapItemBase<K extends MapItemKind> {
  kind: K;
  id: number;
  x: number;
  z: number;
}

export type TrafficLightItem = MapItemBase<'trafficLight'>;

export type PedestrianCrossingItem = MapItemBase<'pedestrianCrossing'>;

export interface AreaFootprint {
  width?: number;
  depth?: number;
  area?: number;
}

export interface BusStopItem extends MapItemBase<'busStop'>, AreaFootprint {
  name: string;
  type: 'platform' | 'stop_position';
}

export interface StationItem
  extends
    MapItemBase<'gasStation' | 'fireStation' | 'hospital' | 'policeStation'>,
    AreaFootprint {
  name: string;
}

export type MapItem =
  TrafficLightItem | PedestrianCrossingItem | BusStopItem | StationItem;

export interface OSMMapData {
  meta: OSMMeta;
  roads: OSMRoad[];
  buildings?: OSMBuilding[];
  items?: MapItem[];
}
