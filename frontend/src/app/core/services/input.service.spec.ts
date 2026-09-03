import { InputService } from './input.service';

describe('InputService', () => {
  let service: InputService;

  beforeEach(() => {
    service = new InputService();
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('tracks physical key codes rather than layout-dependent characters', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'z' }));

    expect(service.isDown('KeyW')).toBe(true);
  });

  it('releases a key on keyup', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));

    expect(service.isDown('KeyA')).toBe(false);
  });

  it('stops the arrow keys from scrolling the page', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves unrelated keys free to act normally', () => {
    const event = new KeyboardEvent('keydown', { code: 'KeyF', cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
