import { createTrack } from '../sim/track';
import { TrackView } from './track-view';

describe('TrackView', () => {
  it('builds exactly one mesh per lane dash in the track data', () => {
    const track = createTrack();
    const view = new TrackView(track);

    const dashes = view.group.children.filter((child) => child.name === 'lane-dash');

    expect(dashes).toHaveLength(track.laneDashes.length);
  });

  it('builds one mesh per road segment', () => {
    const track = createTrack();
    const view = new TrackView(track);

    const roads = view.group.children.filter((child) => child.name === 'road');

    expect(roads).toHaveLength(track.roads.length);
  });
});
