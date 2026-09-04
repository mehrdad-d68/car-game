import { TrackData } from './sim/track';

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
