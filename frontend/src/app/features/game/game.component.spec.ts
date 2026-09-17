import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { GameComponent } from './game.component';

describe('GameComponent chip helpers', () => {
  let injector: EnvironmentInjector;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    }).compileComponents();
    injector = TestBed.inject(EnvironmentInjector);
  });

  function component(): GameComponent {
    return runInInjectionContext(injector, () => new GameComponent());
  }

  describe('formatDistance', () => {
    it('rounds metres below a kilometre', () => {
      const c = component();
      expect(c.formatDistance(0)).toBe('0 m');
      expect(c.formatDistance(45.4)).toBe('45 m');
      expect(c.formatDistance(999.6)).toBe('1000 m');
    });

    it('switches to kilometres at one thousand metres', () => {
      const c = component();
      expect(c.formatDistance(1000)).toBe('1.0 km');
      expect(c.formatDistance(12345)).toBe('12.3 km');
    });
  });

  describe('maneuverIcon', () => {
    it('maps each maneuver to its glyph', () => {
      const c = component();
      expect(c.maneuverIcon('left')).toBe('↰');
      expect(c.maneuverIcon('right')).toBe('↱');
      expect(c.maneuverIcon('uturn')).toBe('⤺');
      expect(c.maneuverIcon('arrive')).toBe('⚑');
    });

    it('falls back to the straight arrow for depart and no step', () => {
      const c = component();
      expect(c.maneuverIcon('depart')).toBe('↑');
      expect(c.maneuverIcon(undefined)).toBe('↑');
    });
  });

  describe('maneuverWord', () => {
    it('names each maneuver', () => {
      const c = component();
      expect(c.maneuverWord('left')).toBe('Left');
      expect(c.maneuverWord('right')).toBe('Right');
      expect(c.maneuverWord('uturn')).toBe('U-turn');
      expect(c.maneuverWord('arrive')).toBe('Arrive');
    });

    it('is empty for depart', () => {
      expect(component().maneuverWord('depart')).toBe('');
    });
  });
});
