import { KeyboardInput, KeyState } from './keyboard-input';

function holding(...held: string[]): KeyState {
  return { isDown: (...codes: string[]) => codes.some((code) => held.includes(code)) };
}

describe('KeyboardInput', () => {
  it('reads forward throttle from either W or the up arrow', () => {
    expect(new KeyboardInput(holding('KeyW')).read().throttle).toBe(1);
    expect(new KeyboardInput(holding('ArrowUp')).read().throttle).toBe(1);
  });

  it('reads reverse throttle from either S or the down arrow', () => {
    expect(new KeyboardInput(holding('KeyS')).read().throttle).toBe(-1);
    expect(new KeyboardInput(holding('ArrowDown')).read().throttle).toBe(-1);
  });

  it('cancels opposing throttle keys', () => {
    expect(new KeyboardInput(holding('KeyW', 'KeyS')).read().throttle).toBe(0);
  });

  it('cancels opposing steer keys', () => {
    expect(new KeyboardInput(holding('KeyA', 'KeyD')).read().steer).toBe(0);
  });

  it('reads the brake from the space bar', () => {
    expect(new KeyboardInput(holding('Space')).read().brake).toBe(true);
  });

  it('reads a neutral frame when nothing is held', () => {
    expect(new KeyboardInput(holding()).read()).toEqual({ throttle: 0, steer: 0, brake: false });
  });
});
