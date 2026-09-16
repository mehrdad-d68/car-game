import viennaData from '../../../../../../../backend/src/modules/map/data/vienna-roads.json';
import { nodeHash } from './node-key';
import { buildRoadGraph, RoadGraph } from './road-graph';
import { findJunctions, PolylineRoad } from './track';

function road(
  name: string,
  overrides: Partial<PolylineRoad> & { points: PolylineRoad['points'] },
): PolylineRoad {
  return {
    name,
    type: 'residential',
    lanes: 2,
    width: 8,
    oneway: 0,
    access: 'yes',
    ...overrides,
  };
}

const X_ROAD: PolylineRoad = road('Xstraße', {
  points: [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
  ],
});

const Y_ROAD: PolylineRoad = road('Ystraße', {
  points: [
    { x: 50, z: -100 },
    { x: 50, z: 0 },
    { x: 50, z: 100 },
  ],
});

function graphOf(...roads: PolylineRoad[]): RoadGraph {
  return buildRoadGraph(roads);
}

describe('buildRoadGraph', () => {
  it('merges vertices that share a rounded coordinate', () => {
    const graph = graphOf(
      X_ROAD,
      road('B', {
        points: [
          { x: 100, z: 0.05 },
          { x: 100, z: 50 },
        ],
      }),
    );
    expect(graph.nodes).toHaveLength(3);
    const joint = graph.nodes.find((n) => Math.abs(n.x - 100) < 1);
    expect(joint).toEqual({ x: 100, z: 0 });
    const fromJoint = graph.out.findIndex((edges) =>
      edges.some((e) => Math.abs(graph.nodes[e.to].x - 100) < 1 && Math.abs(graph.nodes[e.to].z - 50) < 1),
    );
    expect(fromJoint).not.toBe(-1);
  });

  it('creates a two-way edge between consecutive vertices', () => {
    const graph = graphOf(X_ROAD);
    expect(graph.out[0].map((e) => e.to)).toContain(1);
    expect(graph.out[1].map((e) => e.to)).toContain(0);
  });

  it('gives a one-way road an edge in one direction only', () => {
    const graph = graphOf(road('Einbahn', { oneway: 1, points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }));
    expect(graph.out[0].map((e) => e.to)).toContain(1);
    expect(graph.out[1].map((e) => e.to)).not.toContain(0);
  });

  it('gives a one-way -1 road an edge in the reverse direction only', () => {
    const graph = graphOf(road('Rückweg', { oneway: -1, points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }));
    expect(graph.out[0].map((e) => e.to)).not.toContain(1);
    expect(graph.out[1].map((e) => e.to)).toContain(0);
  });

  it('flags private roads as restricted', () => {
    const graph = graphOf(road('Privat', { access: 'private', points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }));
    expect(graph.out[0][0].restricted).toBe(true);
  });

  it('marks a node where at least three arms meet as a junction', () => {
    const graph = graphOf(
      road('A', { points: [{ x: -100, z: 0 }, { x: 0, z: 0 }] }),
      road('B', { points: [{ x: 100, z: 0 }, { x: 0, z: 0 }] }),
      road('C', { points: [{ x: 0, z: -100 }, { x: 0, z: 0 }] }),
    );
    const junctionIndex = graph.nodes.findIndex((n) => Math.abs(n.x) < 1 && Math.abs(n.z) < 1);
    expect(junctionIndex).not.toBe(-1);
    expect(graph.junction[junctionIndex]).toBe(1);
  });

  it('does not treat a two-road way split as a junction', () => {
    const graph = graphOf(
      road('A', { points: [{ x: -100, z: 0 }, { x: 0, z: 0 }] }),
      road('B', { points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }),
    );
    const junctionIndex = graph.nodes.findIndex((n) => Math.abs(n.x) < 1 && Math.abs(n.z) < 1);
    expect(graph.junction[junctionIndex]).toBe(0);
  });

  it('sets service road edges at double cost', () => {
    const graph = graphOf(road('Parkplatz', { type: 'service', points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }));
    expect(graph.out[0][0].cost).toBeCloseTo(200, 6);
    expect(graph.out[0][0].length).toBeCloseTo(100, 6);
  });

  it('groups nodes by trimmed street name', () => {
    const graph = graphOf(X_ROAD, road('Xstraße', { points: [{ x: 100, z: 0 }, { x: 200, z: 0 }] }));
    const nodes = graph.nodesByStreet.get('Xstraße');
    expect(nodes).toBeDefined();
    expect(nodes!.length).toBe(3);
  });

  it('merges vertices 0.1 m apart but not 1 m apart', () => {
    const graph = graphOf(
      road('A', { points: [{ x: 0, z: 0 }, { x: 0, z: 100 }] }),
      road('B', { points: [{ x: 0.1, z: 0 }, { x: 60, z: 0 }] }),
      road('C', { points: [{ x: 1, z: 0 }, { x: 40, z: -40 }] }),
    );
    const origin = graph.nodes.find((n) => Math.abs(n.x) < 0.01 && Math.abs(n.z) < 0.01)!;
    const neighbors = graph.out[graph.nodes.indexOf(origin)].map((e) => graph.nodes[e.to]);
    expect(neighbors.some((n) => Math.abs(n.x - 60) < 1)).toBe(true);
    expect(neighbors.some((n) => Math.abs(n.z - 100) < 1)).toBe(true);
    expect(
      graph.nodes.some((n) => Math.abs(n.x - 1) < 0.01 && Math.abs(n.z) < 0.01),
    ).toBe(true);
  });

  it('agrees with findJunctions about junction positions on the real map', () => {
    const roads = (viennaData as { roads: PolylineRoad[] }).roads;
    const graph = buildRoadGraph(roads);
    const junctions = findJunctions(roads);

    const byHash = new Map<number, number>();
    graph.nodes.forEach((p, id) => byHash.set(nodeHash(p.x, p.z), id));

    expect(junctions.length).toBeGreaterThan(0);
    let matched = 0;
    for (const junction of junctions) {
      const id = byHash.get(nodeHash(junction.position.x, junction.position.z));
      if (id !== undefined && graph.junction[id] === 1) matched++;
    }
    expect(matched / junctions.length).toBeGreaterThan(0.95);
  });

  it('builds the real map into a connected network', () => {
    const graph = buildRoadGraph((viennaData as { roads: PolylineRoad[] }).roads);
    expect(graph.nodes.length).toBeGreaterThan(12000);
    expect(graph.junction.length).toBe(graph.nodes.length);

    let start = 0;
    let mostEdges = -1;
    for (let i = 0; i < graph.nodes.length; i++) {
      if (graph.out[i].length > mostEdges) {
        mostEdges = graph.out[i].length;
        start = i;
      }
    }

    const seen = new Uint8Array(graph.nodes.length);
    const queue = [start];
    seen[start] = 1;
    let head = 0;
    let count = 0;
    while (head < queue.length) {
      const node = queue[head++];
      count++;
      for (const edge of graph.out[node]) {
        if (!seen[edge.to]) {
          seen[edge.to] = 1;
          queue.push(edge.to);
        }
      }
    }
    expect(count / graph.nodes.length).toBeGreaterThan(0.95);
  });
});