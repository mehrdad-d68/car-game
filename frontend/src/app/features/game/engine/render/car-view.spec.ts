import { CarState } from '../sim/types';
import { CarView } from './car-view';

const AT_REST: CarState = { position: { x: 0, z: 0 }, heading: 0, speed: 0 };

describe('CarView', () => {
  it('interpolates position between the previous and current simulation states', () => {
    const view = new CarView();
    const current: CarState = { ...AT_REST, position: { x: 10, z: 20 } };

    view.sync(AT_REST, current, 0.5);

    expect(view.group.position.x).toBeCloseTo(5);
    expect(view.group.position.z).toBeCloseTo(10);
  });

  it('interpolates heading between the previous and current simulation states', () => {
    const view = new CarView();
    const current: CarState = { ...AT_REST, heading: 1 };

    view.sync(AT_REST, current, 0.25);

    expect(view.group.rotation.y).toBeCloseTo(0.25);
  });
});
