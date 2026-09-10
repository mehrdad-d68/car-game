import { makeGeoProjector } from './geo';

describe('makeGeoProjector', () => {
  const project = makeGeoProjector({ lat: 48.145, lng: 16.29 });

  it('maps the map center to the world origin', () => {
    const p = project(48.145, 16.29);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it('projects a real OSM node onto its world position', () => {
    const p = project(48.1559579, 16.3297091);
    expect(p.x).toBeCloseTo(2949.513387686109, 6);
    expect(p.z).toBeCloseTo(-1219.8334280001197, 6);
  });

  it('places higher latitudes south of the origin', () => {
    expect(project(48.156, 16.29).z).toBeLessThan(0);
    expect(project(48.144, 16.29).z).toBeGreaterThan(0);
  });

  it('places higher longitudes east of the origin', () => {
    expect(project(48.145, 16.31).x).toBeGreaterThan(0);
    expect(project(48.145, 16.27).x).toBeLessThan(0);
  });

  it('scales longitudes by the cosine of the centre latitude', () => {
    const equator = makeGeoProjector({ lat: 0, lng: 0 });
    const arctic = makeGeoProjector({ lat: 60, lng: 0 });
    const equatorEast = equator(0, 1).x - equator(0, 0).x;
    const arcticEast = arctic(0, 1).x - arctic(0, 0).x;
    expect(equatorEast).toBeGreaterThan(arcticEast);
  });
});