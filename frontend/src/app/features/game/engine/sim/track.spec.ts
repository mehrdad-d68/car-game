import { createTrack } from './track';

describe('createTrack', () => {
  it('emits one lane dash per grid interval along each road', () => {
    const track = createTrack();

    expect(track.laneDashes).toHaveLength(22);
  });

  it('does not emit duplicate lane dashes', () => {
    const track = createTrack();

    const keys = track.laneDashes.map((dash) => `${dash.axis}:${dash.x}:${dash.z}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every lane dash on a road', () => {
    const track = createTrack();

    for (const dash of track.laneDashes) {
      const onRoad = track.roads.some((road) =>
        road.axis === 'x' ? dash.z === road.offset : dash.x === road.offset,
      );
      expect(onRoad).toBe(true);
    }
  });
});
