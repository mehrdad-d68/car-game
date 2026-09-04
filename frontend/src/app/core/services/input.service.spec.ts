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

  it('does not swallow or track keys when focus is inside an editable control', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(service.isDown('ArrowDown')).toBe(false);
  });

  it('does not swallow or track keys when an interactive widget has focus', () => {
    const trigger = document.createElement('div');
    trigger.setAttribute('role', 'combobox');
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true });
    Object.defineProperty(event, 'target', { value: trigger });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(service.isDown('ArrowDown')).toBe(false);
  });

  it('releases a held key when focus moves into the search box before keyup', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(service.isDown('KeyW')).toBe(true);

    const input = document.createElement('input');
    const up = new KeyboardEvent('keyup', { code: 'KeyW' });
    Object.defineProperty(up, 'target', { value: input });
    window.dispatchEvent(up);

    expect(service.isDown('KeyW')).toBe(false);
  });
});
