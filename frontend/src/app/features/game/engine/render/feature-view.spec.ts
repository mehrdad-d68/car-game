import * as THREE from 'three';
import { MapItemKind, OSMMapData } from '../sim/osm-types';
import { PropPart } from '../sim/prop-spec';
import { createTrack } from '../sim/track';
import viennaData from '../../../../../../../backend/src/modules/map/data/vienna-roads.json';
import {
  crossingStripeCount,
  crossingStripeRotation,
  FeatureView,
  geometryFor,
  ROUNDED_BOX_RADIUS_RATIO,
  partKey,
  placeBusStop,
  planTrafficLightApproaches,
} from './feature-view';
import { PROP_SPECS } from './prop-specs.fixture';
import { SURFACE_OFFSET } from './constants';

const SAMPLE_DATA: OSMMapData = {
  meta: {
    source: 'openstreetmap',
    generatedAt: '2026-01-01T00:00:00Z',
    place: 'test',
    center: { lat: 48.145, lng: 16.29 },
    bbox: { south: 48.13, west: 16.25, north: 48.16, east: 16.33 },
    totalRoads: 2,
  },
  roads: [
    {
      id: 1,
      type: 'primary',
      name: 'Street A',
      lanes: 2,
      width: 12,
      oneway: 1,
      access: 'yes',
      points: [
        { x: -200, z: 0 },
        { x: 200, z: 0 },
      ],
    },
    {
      id: 2,
      type: 'residential',
      name: 'Street B',
      lanes: 1,
      width: 8,
      oneway: 0,
      access: 'yes',
      points: [
        { x: 50, z: -200 },
        { x: 50, z: 200 },
      ],
    },
  ],
  items: [
    { kind: 'trafficLight', id: 1, x: 0, z: 0 },
    { kind: 'trafficLight', id: 2, x: 10, z: 0 },
    { kind: 'trafficLight', id: 3, x: 12, z: 0 },
    { kind: 'pedestrianCrossing', id: 10, x: 0, z: 0 },
    { kind: 'busStop', id: 20, x: 0, z: 0, name: 'Central', type: 'platform' },
    { kind: 'busStop', id: 21, x: 20000, z: 20000, name: 'Far', type: 'platform' },
    { kind: 'gasStation', id: 30, x: 100, z: 100, name: 'Shell' },
    { kind: 'fireStation', id: 31, x: -100, z: 100, name: 'Feuerwehr' },
    { kind: 'hospital', id: 32, x: 0, z: 0, name: 'AKH' },
    { kind: 'policeStation', id: 33, x: 500, z: 0, name: 'Polizei' },
  ],
};

describe('crossingStripeRotation', () => {
  const roads = createTrack(SAMPLE_DATA).roads;

  it('runs stripes along an east-to-west road', () => {
    const alignment = crossingStripeRotation(0, 0, roads);
    expect(alignment.rotation).toBeCloseTo(0, 6);
  });

  it('runs stripes along a south-to-north road', () => {
    const alignment = crossingStripeRotation(50, 60, roads);
    expect(alignment.rotation).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('runs stripes along a diagonal road', () => {
    const diagonal = createTrack({
      ...SAMPLE_DATA,
      items: [],
      roads: [
        {
          id: 1,
          type: 'primary',
          name: 'Diagonal St',
          lanes: 2,
          width: 10,
          oneway: 1,
          access: 'yes',
          points: [
            { x: -50, z: -50 },
            { x: 50, z: 50 },
          ],
        },
      ],
    }).roads;
    const alignment = crossingStripeRotation(0, 0, diagonal);
    expect(alignment.rotation).toBeCloseTo(-Math.PI / 4, 6);
  });

  it('falls back to 0 when no road is within reach', () => {
    expect(crossingStripeRotation(50000, 50000, roads)).toEqual({
      rotation: 0,
      width: 6,
    });
  });
});

describe('crossingStripeCount', () => {
  it('spreads more stripes across a wider road', () => {
    expect(crossingStripeCount(12)).toBeGreaterThan(crossingStripeCount(6));
  });

  it('keeps the stripe run inside the carriageway', () => {
    for (const width of [6, 8, 12, 18, 24]) {
      const span = (crossingStripeCount(width) - 1) * 0.9;
      expect(span).toBeLessThanOrEqual(width);
    }
  });

  it('always emits at least two stripes for a narrow lane', () => {
    expect(crossingStripeCount(1)).toBeGreaterThanOrEqual(2);
  });
});

describe('planTrafficLightApproaches', () => {
  const roads = createTrack(SAMPLE_DATA).roads;

  const crossingRoads = createTrack({
    ...SAMPLE_DATA,
    items: [],
    roads: [
      {
        id: 1,
        type: 'primary',
        name: 'Street A',
        lanes: 2,
        width: 12,
        oneway: 1,
        access: 'yes',
        points: [
          { x: -200, z: 0 },
          { x: 200, z: 0 },
        ],
      },
      {
        id: 2,
        type: 'primary',
        name: 'Street B',
        lanes: 2,
        width: 8,
        oneway: 0,
        access: 'yes',
        points: [
          { x: 0, z: -200 },
          { x: 0, z: 200 },
        ],
      },
    ],
  }).roads;

  it('places one signal per approach on the right side of the road', () => {
    const plans = planTrafficLightApproaches(0, 0, crossingRoads);
    expect(plans).toHaveLength(3);
    expect(plans.every((p) => p.mount === 'pole')).toBe(true);
  });

  it('sets poles back from the junction so they clear the crossing road', () => {
    const plans = planTrafficLightApproaches(0, 0, crossingRoads);

    for (const plan of plans) {
      const distanceToStreetA = Math.abs(plan.z);
      const distanceToStreetB = Math.abs(plan.x);
      expect(distanceToStreetA).toBeGreaterThan(6);
      expect(distanceToStreetB).toBeGreaterThan(4);
    }
  });

  it('hangs the signal overhead when no kerb position clears the carriageway', () => {
    const wideCrossing = createTrack({
      ...SAMPLE_DATA,
      items: [],
      roads: [
        {
          id: 1,
          type: 'primary',
          name: 'Wide',
          lanes: 6,
          width: 24,
          oneway: 0,
          access: 'yes',
          points: [
            { x: -200, z: 0 },
            { x: 200, z: 0 },
          ],
        },
        {
          id: 2,
          type: 'residential',
          name: 'Narrow',
          lanes: 1,
          width: 6,
          oneway: 0,
          access: 'yes',
          points: [
            { x: 0, z: -200 },
            { x: 0, z: 200 },
          ],
        },
      ],
    }).roads;

    const plans = planTrafficLightApproaches(0, 0, wideCrossing);

    const overhead = plans.filter((p) => p.mount === 'overhead');
    const poles = plans.filter((p) => p.mount === 'pole');

    expect(overhead.length).toBeGreaterThan(0);
    expect(poles.length).toBeGreaterThan(0);

    expect(overhead.every((p) => Math.abs(p.x) < 1)).toBe(true);
    expect(poles.every((p) => Math.abs(p.z) > 12)).toBe(true);
  });

  it('respects one-way streets when selecting approach directions', () => {
    const oneWay = createTrack({
      ...SAMPLE_DATA,
      items: [],
      roads: [
        {
          id: 1,
          type: 'residential',
          name: 'One Way',
          lanes: 1,
          width: 6,
          oneway: -1,
          access: 'yes',
          points: [
            { x: -200, z: 0 },
            { x: 200, z: 0 },
          ],
        },
      ],
    }).roads;

    const reverse = planTrafficLightApproaches(0, 0, oneWay);
    expect(reverse).toHaveLength(1);
    expect(reverse[0].faceYaw).toBeCloseTo(Math.PI / 2, 6);
    expect(reverse[0].z).toBeCloseTo(-4.5, 6);
    expect(reverse[0].mount).toBe('pole');

    const forward = planTrafficLightApproaches(
      0,
      0,
      createTrack({
        ...SAMPLE_DATA,
        items: [],
        roads: [
          {
            id: 1,
            type: 'residential',
            name: 'One Way',
            lanes: 1,
            width: 6,
            oneway: 1,
            access: 'yes',
            points: [
              { x: -200, z: 0 },
              { x: 200, z: 0 },
            ],
          },
        ],
      }).roads,
    );
    expect(forward).toHaveLength(1);
    expect(forward[0].faceYaw).toBeCloseTo(-Math.PI / 2, 6);
    expect(forward[0].z).toBeCloseTo(4.5, 6);
  });

  it('hangs an isolated signal overhead rather than planting it in the road', () => {
    expect(planTrafficLightApproaches(50000, 50000, roads)).toEqual([
      { x: 50000, z: 50000, faceYaw: 0, mount: 'overhead' },
    ]);
  });
});

describe('placeBusStop', () => {
  const roads = createTrack(SAMPLE_DATA).roads;

  it('moves a stop on the road centerline to the kerb side', () => {
    const placement = placeBusStop(0, 0, roads);
    expect(placement.x).toBeCloseTo(0, 6);
    expect(placement.z).toBeCloseTo(7.5, 6);
    expect(placement.faceYaw).toBeCloseTo(Math.PI, 6);
  });

  it('offsets a stop on a north-south road to its right side', () => {
    const placement = placeBusStop(50, 60, roads);
    expect(placement.x).toBeCloseTo(44.5, 6);
    expect(placement.z).toBeCloseTo(60, 6);
    expect(placement.faceYaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it('keeps a stop that is already beside the road in place', () => {
    const placement = placeBusStop(-12, 4, roads);
    expect(placement.x).toBeCloseTo(-12, 6);
    expect(placement.z).toBeCloseTo(4, 6);
    expect(placement.faceYaw).toBeCloseTo(Math.PI, 6);
  });

  it('leaves a far-away stop unchanged', () => {
    const placement = placeBusStop(50000, 50000, roads);
    expect(placement.x).toBeCloseTo(50000, 6);
    expect(placement.z).toBeCloseTo(50000, 6);
  });
});

describe('FeatureView', () => {
  let track: ReturnType<typeof createTrack>;
  let view: FeatureView;

  beforeEach(() => {
    track = createTrack(SAMPLE_DATA);
    view = new FeatureView(track, PROP_SPECS);
  });

  afterEach(() => {
    view.dispose();
  });

  it('exposes one placement per traffic light approach', () => {
    expect(view.placements.filter((p) => p.kind === 'trafficLight')).toHaveLength(3);
    expect(view.placements.every((p) => p.kind !== 'trafficLight' || p.variant.startsWith('pole-'))).toBe(true);
  });

  it('exposes one placement per crossing with the road-aligned yaw', () => {
    const crossing = view.placements.find((p) => p.kind === 'pedestrianCrossing');
    expect(crossing).toBeDefined();
    expect(crossing!.yaw).toBeCloseTo(0, 6);
    expect(crossing!.y).toBeCloseTo(0.4 + 0.03 / 2, 6);
  });

  it('builds one pool per distinct part type, not per marker', () => {
    const totalCapacity = view.pools.reduce((sum, pool) => sum + pool.capacity, 0);
    expect(view.pools.length).toBe(29);
    expect(view.pools.length).toBeLessThan(totalCapacity);
    for (const pool of view.pools) {
      expect(pool.mesh).toBeInstanceOf(THREE.InstancedMesh);
    }
  });

  it('shares a single stripe pool across all crossing stripes', () => {
    const stripes = view.pools.find((pool) => pool.name === 'stripe')!;
    expect(stripes.kind).toBe('pedestrianCrossing');
    expect(stripes.capacity).toBe(crossingStripeCount(12));
  });

  it('draws crossing stripes as a road decal that wins over every road surface', () => {
    const stripes = view.pools.find((pool) => pool.kind === 'pedestrianCrossing')!;
    const material = stripes.mesh.material as THREE.Material;
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(SURFACE_OFFSET.decal);
    expect(material.polygonOffsetUnits).toBe(SURFACE_OFFSET.decal);

    const { decal, ...surfaces } = SURFACE_OFFSET;
    for (const offset of Object.values(surfaces)) {
      expect(decal).toBeLessThan(offset);
    }

    const signalPole = view.pools.find((pool) => pool.kind === 'trafficLight' && pool.name === 'pole')!;
    expect((signalPole.mesh.material as THREE.Material).polygonOffset).toBe(false);
  });

  it('lights exactly one lens per signal and tints the off lamps', () => {
    const lens = view.pools.filter((pool) => pool.name === 'lens');
    expect(lens).toHaveLength(6);
    const lit = lens.filter((pool) => {
      const material = pool.mesh.material as THREE.MeshToonMaterial;
      return material.emissive && material.emissive.getHex() !== 0;
    });
    expect(lit.map((pool) => (pool.mesh.material as THREE.MeshToonMaterial).emissive.getHexString()).sort()).toEqual([
      '43a047',
      'e53935',
      'f9a825',
    ]);
    const litCapacity = lit.reduce((sum, pool) => sum + pool.capacity, 0);
    expect(litCapacity).toBe(3);
    const off = lens.filter((pool) => !((pool.mesh.material as THREE.MeshToonMaterial).emissive.getHexString() !== '000000'));
    expect(off).toHaveLength(3);
    for (const pool of off) {
      expect(pool.capacity).toBe(2);
      expect((pool.mesh.material as THREE.MeshToonMaterial).color.getHex()).toBeGreaterThan(0x303030);
    }
    const offColours = off.map((pool) => (pool.mesh.material as THREE.MeshToonMaterial).color.getHexString());
    expect(new Set(offColours).size).toBe(3);
    expect(offColours.includes('000000')).toBe(false);
  });

  it('shrinks unlit lens geometry to cylinders while lit lenses glow', () => {
    const lens = view.pools.filter((pool) => pool.name === 'lens');
    for (const pool of lens) {
      expect(pool.mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
      expect(
        (pool.mesh.geometry as THREE.CylinderGeometry).parameters.radiusTop,
      ).toBeCloseTo(0.17, 6);
      const material = pool.mesh.material as THREE.MeshToonMaterial;
      expect(material.map).toBeDefined();
      const lit = material.emissive && material.emissive.getHex() !== 0;
      expect(material.emissiveMap).toBe(lit ? material.map : null);
    }
    const litTextures = lens
      .filter(
        (pool) =>
          (pool.mesh.material as THREE.MeshToonMaterial).emissiveMap !== null,
      )
      .map((pool) => (pool.mesh.material as THREE.MeshToonMaterial).emissiveMap);
    const reference = litTextures[0];
    expect(litTextures.every((texture) => texture === reference)).toBe(true);
  });

  it('draws a curved visor hood attached over every lens', () => {
    const visor = view.pools.find((pool) => pool.name === 'visor')!;
    expect(visor.kind).toBe('trafficLight');
    expect(visor.capacity).toBe(9);
    expect(visor.mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);

    const declared = PROP_SPECS.find((spec) => spec.kind === 'trafficLight')!
      .variants[0].parts.find((part) => part.name === 'visor')!;
    const params = (visor.mesh.geometry as THREE.CylinderGeometry).parameters;
    expect(params.radiusTop).toBeCloseTo(declared.size[0] / 2, 6);
    expect(params.height).toBeCloseTo(declared.size[2], 6);
  });

  it('opens the visor hood downwards so it shades the lens instead of capping it', () => {
    const visor = view.pools.find((pool) => pool.name === 'visor')!;
    const params = (visor.mesh.geometry as THREE.CylinderGeometry).parameters;
    expect(params.openEnded).toBe(true);
    expect(params.thetaLength).toBeCloseTo(Math.PI, 6);
    expect(params.thetaStart).toBeCloseTo(Math.PI / 2, 6);

    visor.mesh.geometry.computeBoundingBox();
    const box = visor.mesh.geometry.boundingBox!;
    const radius = params.radiusTop;
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(radius, 6);
    expect(box.min.x).toBeCloseTo(-radius, 6);
    expect(box.max.x).toBeCloseTo(radius, 6);
  });

  it('seats every visor hood into the signal head with no gap', () => {
    const spec = PROP_SPECS.find((s) => s.kind === 'trafficLight')!;
    for (const variant of spec.variants) {
      const head = variant.parts.find((part) => part.name === 'head')!;
      const headFrontZ = head.position[2] + head.size[2] / 2;
      for (const visor of variant.parts.filter((part) => part.name === 'visor')) {
        expect(visor.position[2] - visor.size[2] / 2).toBeLessThanOrEqual(headFrontZ);
      }
    }
  });

  it('keeps each visor hood clear of the lens above it', () => {
    const spec = PROP_SPECS.find((s) => s.kind === 'trafficLight')!;
    for (const variant of spec.variants) {
      const lenses = variant.parts.filter((part) => part.name === 'lens');
      const visors = variant.parts.filter((part) => part.name === 'visor');
      const gaps = lenses
        .map((lens) => lens.position[1])
        .sort((a, b) => a - b)
        .flatMap((y, i, all) => (i === 0 ? [] : [all[i] - all[i - 1]]));
      const lensRadius = lenses[0].size[0] / 2;
      for (const visor of visors) {
        expect(visor.size[0] / 2).toBeLessThan(Math.min(...gaps) - lensRadius);
      }
    }
  });

  it('builds one placement per public transport stop', () => {
    const stops = view.placements.filter((p) => p.kind === 'busStop');
    expect(stops).toHaveLength(2);
  });

  it('places traffic lights beside the road near their input positions', () => {
    const lights = view.placements.filter((p) => p.kind === 'trafficLight');
    expect(lights).toHaveLength(3);
    for (const light of lights) {
      expect(Math.abs(light.z)).toBeCloseTo(7.5, 2);
    }
  });

  it('encodes the footprint into the placement scale when dimensions exist', () => {
    const nearby = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'gasStation', id: 1, x: 0, z: 0, name: 'Shell', width: 40, depth: 18 },
        { kind: 'fireStation', id: 2, x: 0, z: 0, name: 'Feuerwehr', width: 20, depth: 14 },
        { kind: 'hospital', id: 3, x: 0, z: 0, name: 'AKH', width: 60, depth: 30 },
        { kind: 'policeStation', id: 4, x: 0, z: 0, name: 'Polizei', width: 15, depth: 12 },
        { kind: 'busStop', id: 5, x: 0, z: 0, name: 'Nahe', type: 'platform', width: 25, depth: 5 },
        { kind: 'gasStation', id: 6, x: 300, z: 300, name: 'BP' },
      ],
    });
    const sized = new FeatureView(nearby, PROP_SPECS);
    const gas = sized.placements.find((p) => p.kind === 'gasStation')!;
    expect(gas.scaleX).toBeCloseTo(40 / 8);
    expect(gas.scaleZ).toBeCloseTo(18 / 6);
    const hospital = sized.placements.find((p) => p.kind === 'hospital')!;
    expect(hospital.scaleX).toBeCloseTo(60 / 10);
    expect(hospital.scaleZ).toBeCloseTo(30 / 8);
    const stop = sized.placements.find((p) => p.kind === 'busStop')!;
    expect(stop.variant).toBe('interchange');
    expect(stop.scaleX).toBeCloseTo(25 / 8);
    expect(stop.scaleZ).toBeCloseTo(1);
    sized.dispose();
  });

  it('keeps placements unscaled when an item has no dimensions', () => {
    const plain = createTrack({
      ...SAMPLE_DATA,
      items: [{ kind: 'gasStation', id: 1, x: 0, z: 0, name: 'BP' }],
    });
    const viewPlain = new FeatureView(plain, PROP_SPECS);
    const gas = viewPlain.placements.find((p) => p.kind === 'gasStation')!;
    expect(gas.scaleX).toBe(1);
    expect(gas.scaleZ).toBe(1);
    viewPlain.dispose();
  });

  it('chooses the shelter variant when a bus stop has no footprint', () => {
    const stops = view.placements.filter((p) => p.kind === 'busStop');
    expect(stops).toHaveLength(2);
    for (const stop of stops) {
      expect(stop.variant).toBe('shelter');
      expect(stop.scaleX).toBe(1);
      expect(stop.scaleZ).toBe(1);
    }
  });

  it('spans interchange posts and benches across the placed footprint', () => {
    const plaza = createTrack({
      ...SAMPLE_DATA,
      items: [
        { kind: 'busStop', id: 5, x: 0, z: 0, name: 'Plaza', type: 'platform', width: 26.7, depth: 5 },
      ],
    });
    const viewPlaza = new FeatureView(plaza, PROP_SPECS);
    const stop = viewPlaza.placements.find((p) => p.kind === 'busStop')!;
    expect(stop.variant).toBe('interchange');
    viewPlaza.update(0, 0);
    const posts = viewPlaza.pools.find((pool) => pool.kind === 'busStop' && pool.name === 'post')!;
    const benches = viewPlaza.pools.find((pool) => pool.kind === 'busStop' && pool.name === 'bench')!;
    expect(posts.mesh.count).toBe(7);
    expect(benches.mesh.count).toBe(5);
    const canopy = viewPlaza.pools.find((pool) => pool.kind === 'busStop' && pool.name === 'canopy')!;
    expect(canopy.mesh.count).toBe(1);
    expect((canopy.mesh.geometry as THREE.BoxGeometry).parameters.width).toBeCloseTo(8, 6);
    const scaleX = canopy.mesh.instanceMatrix.array[0];
    expect(Math.abs(scaleX)).toBeCloseTo(26.7 / 8, 3);
    viewPlaza.dispose();
  });

  it('starts with every pool empty', () => {
    for (const pool of view.pools) {
      expect(pool.mesh.count).toBe(0);
    }
  });

  it('keeps gas station support columns in separate named pools', () => {
    const supports = view.pools.filter((pool) => pool.kind === 'gasStation' && pool.name.startsWith('pole-'));
    expect(supports.map((pool) => pool.name).sort()).toEqual(['pole-left', 'pole-right']);
    for (const support of supports) {
      expect(support.capacity).toBe(1);
    }
  });

  it('clears every pool when the car enters an empty region', () => {
    const busPole = view.pools.find((pool) => pool.kind === 'busStop' && pool.name === 'post')!;

    view.update(0, 0);
    expect(busPole.mesh.count).toBe(2);

    view.update(30000, 30000);
    for (const pool of view.pools) {
      expect(pool.mesh.count).toBe(0);
    }
  });

  it('reveals placement pools near the car and keeps far ones empty', () => {
    const busPole = view.pools.find((pool) => pool.kind === 'busStop' && pool.name === 'post')!;

    view.update(0, 0);
    expect(busPole.mesh.count).toBe(2);

    view.update(20000, 20000);
    expect(busPole.mesh.count).toBe(2);
    expect(view.pools.find((pool) => pool.kind === 'pedestrianCrossing')!.mesh.count).toBe(0);
  });

  it('hides markers that leave the culling window', () => {
    const signalPole = view.pools.find((pool) => pool.kind === 'trafficLight' && pool.name === 'pole')!;

    view.update(0, 0);
    expect(signalPole.mesh.count).toBe(3);

    view.update(20000, 20000);
    expect(signalPole.mesh.count).toBe(0);
  });

  it('renders model clones instead of pools when a kind has a loaded model', () => {
    const model = new THREE.Group();
    model.name = 'gas-model';
    const models = new Map<MapItemKind, THREE.Group>([['gasStation', model]]);
    const withModels = new FeatureView(track, PROP_SPECS, models);

    expect(withModels.pools.filter((pool) => pool.kind === 'gasStation')).toHaveLength(0);
    expect(placementsOf(withModels, 'gasStation')).toHaveLength(1);
    expect(withModels.modelGroups).toHaveLength(1);
    expect(withModels.modelGroups[0].visible).toBe(false);

    withModels.update(0, 0);
    expect(withModels.modelGroups[0].visible).toBe(true);

    withModels.update(20000, 20000);
    expect(withModels.modelGroups[0].visible).toBe(false);
    withModels.dispose();
  });

  it('keeps building after dispose', () => {
    view.dispose();
    const rebuilt = new FeatureView(createTrack(SAMPLE_DATA), PROP_SPECS);
    expect(placementsOf(rebuilt, 'trafficLight')).toHaveLength(3);
    rebuilt.dispose();
  });
});

function placementsOf(
  view: FeatureView,
  kind: MapItemKind,
): { kind: MapItemKind }[] {
  return view.placements.filter((p) => p.kind === kind);
}

describe('POI markers', () => {
  let track: ReturnType<typeof createTrack>;
  let view: FeatureView;

  beforeEach(() => {
    track = createTrack(SAMPLE_DATA);
    view = new FeatureView(track, PROP_SPECS);
  });

  afterEach(() => {
    view.dispose();
  });

  it('builds one placement per POI', () => {
    const counts: Record<string, number> = {};
    for (const p of view.placements) {
      counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    }
    expect(counts['gasStation']).toBe(1);
    expect(counts['fireStation']).toBe(1);
    expect(counts['hospital']).toBe(1);
    expect(counts['policeStation']).toBe(1);
  });

  it('reveals gas stations near the car', () => {
    const canopy = view.pools.find((pool) => pool.kind === 'gasStation' && pool.name === 'canopy')!;
    view.update(0, 0);
    expect(canopy.mesh.count).toBe(1);
  });

  it('hides far-away POI pools', () => {
    const canopy = view.pools.find((pool) => pool.kind === 'gasStation' && pool.name === 'canopy')!;
    view.update(0, 0);
    expect(canopy.mesh.count).toBe(1);
    view.update(20000, 20000);
    expect(canopy.mesh.count).toBe(0);
  });

  it('produces no POI pools when the track has no POIs', () => {
    view.dispose();
    const emptyView = new FeatureView(createTrack({ ...SAMPLE_DATA, items: [] }), PROP_SPECS);
    const poiKinds = ['gasStation', 'fireStation', 'hospital', 'policeStation'];
    expect(placementsOf(emptyView, 'gasStation')).toHaveLength(0);
    expect(emptyView.pools.filter((pool) => poiKinds.includes(pool.kind))).toHaveLength(0);
    emptyView.dispose();
  });
});

describe('Vienna prop placement guard', () => {
  it('places at least one instance of every kind present in the real map data', () => {
    const data = viennaData as OSMMapData;
    const view = new FeatureView(createTrack(data), PROP_SPECS);
    const count = (kind: MapItemKind): number =>
      view.placements.filter((p) => p.kind === kind).length;

    for (const kind of [
      'trafficLight',
      'pedestrianCrossing',
      'busStop',
      'gasStation',
      'fireStation',
      'hospital',
      'policeStation',
    ] as const) {
      expect(count(kind)).toBeGreaterThan(0);
    }
    expect(view.pools.length).toBeLessThan(50);

    view.dispose();
  });
});

describe('Prop part geometry', () => {
  const part = (overrides: Partial<PropPart>): PropPart =>
    ({
      name: 'p',
      position: [0, 0, 0],
      size: [2, 1, 3],
      color: 0xffffff,
      ...overrides,
    }) as PropPart;

  it('builds boxes by default', () => {
    const geometry = geometryFor(part({}));
    expect(geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect((geometry as THREE.BoxGeometry).parameters.width).toBeCloseTo(2, 6);
    expect((geometry as THREE.BoxGeometry).parameters.depth).toBeCloseTo(3, 6);
  });

  it('builds a rotated cylinder for cylinderZ', () => {
    const geometry = geometryFor(part({ shape: 'cylinderZ', size: [0.4, 0.4, 0.12] }));
    expect(geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect((geometry as THREE.CylinderGeometry).parameters.radiusTop).toBeCloseTo(0.2, 6);
    expect((geometry as THREE.CylinderGeometry).parameters.height).toBeCloseTo(0.12, 6);
  });

  it('builds an upright cylinder for cylinderY and a sphere for sphere', () => {
    const cylinder = geometryFor(part({ shape: 'cylinderY', size: [1, 2, 1] }));
    expect((cylinder as THREE.CylinderGeometry).parameters.height).toBeCloseTo(2, 6);
    const sphere = geometryFor(part({ shape: 'sphere', size: [2, 2, 2] }));
    expect(sphere).toBeInstanceOf(THREE.SphereGeometry);
    expect((sphere as THREE.SphereGeometry).parameters.radius).toBeCloseTo(1, 6);
  });

  it('builds an open half-cylinder hood for visor', () => {
    const visor = geometryFor(part({ shape: 'visor', size: [0.52, 0.52, 0.4] }));
    expect(visor).toBeInstanceOf(THREE.CylinderGeometry);
    const cylinder = visor as THREE.CylinderGeometry;
    expect(cylinder.parameters.radiusTop).toBeCloseTo(0.26, 6);
    expect(cylinder.parameters.height).toBeCloseTo(0.4, 6);
    expect(cylinder.parameters.thetaLength).toBeCloseTo(Math.PI, 6);
  });

  it('builds a rounded box that occupies the same volume as a plain box', () => {
    const size: [number, number, number] = [0.9, 1.9, 0.25];
    const rounded = geometryFor(part({ shape: 'roundedBox', size }));
    const plain = geometryFor(part({ size }));
    rounded.computeBoundingBox();
    plain.computeBoundingBox();
    expect(rounded.boundingBox!.min).toEqual(plain.boundingBox!.min);
    expect(rounded.boundingBox!.max).toEqual(plain.boundingBox!.max);
  });

  it('keeps the rounding radius inside the thinnest side', () => {
    for (const size of [
      [0.9, 1.9, 0.25],
      [4, 0.14, 1.85],
      [0.09, 0.46, 0.4],
    ] as [number, number, number][]) {
      const radius = Math.min(...size) * ROUNDED_BOX_RADIUS_RATIO;
      expect(radius).toBeLessThan(Math.min(...size) / 2);
      expect(geometryFor(part({ shape: 'roundedBox', size }))).toBeInstanceOf(
        THREE.BufferGeometry,
      );
    }
  });

  it('separates pools by shape, material, and repeat', () => {
    const plain = part({});
    const material = part({ material: 'housing' });
    const repeated = part({ repeat: { axis: 'x', spacing: 4, max: 20 } });
    const unsealed = part({ scaleWithFootprint: false });
    const keys = new Set([partKey(plain), partKey(material), partKey(repeated), partKey(unsealed)]);
    expect(keys.size).toBe(4);
    expect(partKey(plain)).toBe(partKey(part({})));
  });
});

describe('FeatureView toon rendering', () => {
  it('draws props with the toon ramp so they match the buildings', () => {
    const view = new FeatureView(createTrack(viennaData as OSMMapData), PROP_SPECS);

    for (const pool of view.pools) {
      const material = pool.mesh.material as THREE.MeshToonMaterial;
      expect(material.type).toBe('MeshToonMaterial');
      expect(material.gradientMap).toBeDefined();
    }

    view.dispose();
  });
});