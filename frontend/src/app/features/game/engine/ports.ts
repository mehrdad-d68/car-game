import { TrackData } from './sim/track';
import { CarSpec } from './sim/car-spec';
import { PropSpec } from './sim/prop-spec';
import { BuildingAssignments, BuildingPlacement, BuildingSpec } from './sim/building-spec';

export interface InputFrame {
  throttle: number;
  steer: number;
  brake: boolean;
}

export interface InputSource {
  read(): InputFrame;
}

export interface TrackSource {
  loadTrack(): Promise<TrackData>;
}

export interface CarSource {
  loadCars(): Promise<CarSpec[]>;
}

export interface PropSource {
  loadProps(): Promise<PropSpec[]>;
}

export interface BuildingSource {
  loadBuildings(): Promise<BuildingSpec[]>;
  loadPlacements(): Promise<BuildingPlacement[]>;
  loadAssignments(): Promise<BuildingAssignments>;
}
