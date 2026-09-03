export interface InputFrame {
  throttle: number;
  steer: number;
  brake: boolean;
}

export interface InputSource {
  read(): InputFrame;
}
