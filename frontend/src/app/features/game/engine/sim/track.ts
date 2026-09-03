export type Axis = 'x' | 'z';

export interface RoadSegment {
  axis: Axis;
  offset: number;
}

export interface LaneDash {
  axis: Axis;
  x: number;
  z: number;
}

export interface TrackData {
  size: number;
  roadWidth: number;
  dashLength: number;
  roads: RoadSegment[];
  laneDashes: LaneDash[];
}

const SIZE = 400;
const ROAD_WIDTH = 16;
const DASH_LENGTH = 16;
const GRID_SPACING = 40;

export function createTrack(): TrackData {
  const roads: RoadSegment[] = [
    { axis: 'x', offset: 0 },
    { axis: 'z', offset: 0 },
  ];

  const half = SIZE / 2;
  const laneDashes: LaneDash[] = [];

  for (const road of roads) {
    for (let distance = -half; distance <= half; distance += GRID_SPACING) {
      laneDashes.push(
        road.axis === 'x'
          ? { axis: 'x', x: distance, z: road.offset }
          : { axis: 'z', x: road.offset, z: distance },
      );
    }
  }

  return { size: SIZE, roadWidth: ROAD_WIDTH, dashLength: DASH_LENGTH, roads, laneDashes };
}
