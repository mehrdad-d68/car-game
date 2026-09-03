import { InputFrame, InputSource } from '../engine/ports';

export interface KeyState {
  isDown(...codes: string[]): boolean;
}

export class KeyboardInput implements InputSource {
  constructor(private readonly keys: KeyState) {}

  read(): InputFrame {
    let throttle = 0;
    let steer = 0;

    if (this.keys.isDown('ArrowUp', 'KeyW')) throttle += 1;
    if (this.keys.isDown('ArrowDown', 'KeyS')) throttle -= 1;
    if (this.keys.isDown('ArrowLeft', 'KeyA')) steer += 1;
    if (this.keys.isDown('ArrowRight', 'KeyD')) steer -= 1;

    return { throttle, steer, brake: this.keys.isDown('Space') };
  }
}
