import { TrackData } from './sim/track';
import { CarSpec } from './sim/car-spec';

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
