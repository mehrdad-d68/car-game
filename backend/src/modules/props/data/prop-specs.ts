import { PropPart, PropSpec, PropVariant } from '../prop-spec';

type SignalColour = 'red' | 'amber' | 'green';

const SIGNAL_EMISSIVE: Record<SignalColour, number> = {
  red: 0xe53935,
  amber: 0xf9a825,
  green: 0x43a047,
};

const SIGNAL_OFF: Record<SignalColour, number> = {
  red: 0x9c4a46,
  amber: 0x8f7330,
  green: 0x52855e,
};

const SIGNAL_LAMP_OFFSET: Record<SignalColour, number> = {
  red: 0.55,
  amber: 0,
  green: -0.55,
};

const HOUSING_POLE = 0x535a61;
const HOUSING_HEAD = 0x3a4046;
const HOUSING_VISOR = 0x59616a;
const SHELTER_FRAME = 0xbcc4cb;
const SHELTER_GLASS = 0xd4e6ee;
const SHELTER_ROOF = 0xa9b2ba;
const SHELTER_BENCH = 0xb08a5e;
const TRANSIT_BLUE = 0x1e88e5;

const SIGNAL_COLOURS: SignalColour[] = ['red', 'amber', 'green'];

function trafficLightVariant(
  mount: 'pole' | 'overhead',
  lit: SignalColour,
): PropVariant {
  const headY = mount === 'pole' ? 3.35 : 5.9;
  const parts: PropPart[] = [];
  if (mount === 'pole') {
    parts.push({
      name: 'pole',
      size: [0.2, 4.2, 0.2],
      position: [0, 2.1, 0],
      color: HOUSING_POLE,
      material: 'housing',
    });
  }
  parts.push({
    name: 'head',
    shape: 'roundedBox',
    size: [0.9, 1.9, 0.25],
    position: [0, headY, 0],
    color: HOUSING_HEAD,
    material: 'housing',
  });
  for (const colour of SIGNAL_COLOURS) {
    const lampY = headY + SIGNAL_LAMP_OFFSET[colour];
    parts.push({
      name: 'visor',
      shape: 'visor',
      size: [0.44, 0.44, 0.28],
      position: [0, lampY, 0.25],
      color: HOUSING_VISOR,
      material: 'housing',
    });
    parts.push(
      colour === lit
        ? {
            name: 'lens',
            size: [0.34, 0.34, 0.12],
            position: [0, lampY, 0.19],
            color: 0xffffff,
            emissive: SIGNAL_EMISSIVE[colour],
            renderOrder: 1,
            material: 'lens',
            shape: 'cylinderZ',
          }
        : {
            name: 'lens',
            size: [0.34, 0.34, 0.12],
            position: [0, lampY, 0.19],
            color: SIGNAL_OFF[colour],
            renderOrder: 1,
            material: 'lens',
            shape: 'cylinderZ',
          },
    );
  }
  return { id: `${mount}-${lit}`, parts };
}

function trafficLightVariants(): PropVariant[] {
  const variants: PropVariant[] = [];
  for (const mount of ['pole', 'overhead'] as const) {
    for (const colour of SIGNAL_COLOURS) {
      variants.push(trafficLightVariant(mount, colour));
    }
  }
  return variants;
}

export const PROP_SPECS: PropSpec[] = [
  {
    kind: 'trafficLight',
    name: 'Traffic light',
    variants: trafficLightVariants(),
  },
  {
    kind: 'pedestrianCrossing',
    name: 'Pedestrian crossing',
    variants: [
      {
        id: 'default',
        parts: [
          {
            name: 'stripe',
            size: [4.2, 0.03, 0.5],
            position: [0, 0, 0],
            color: 0xffffff,
            renderOrder: 1,
          },
        ],
      },
    ],
  },
  {
    kind: 'busStop',
    name: 'Bus stop',
    footprint: { width: 8, depth: 6 },
    variants: [
      {
        id: 'shelter',
        parts: [
          {
            name: 'post',
            size: [0.12, 2.5, 0.12],
            position: [-1.85, 1.25, 0.78],
            color: SHELTER_FRAME,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'post',
            size: [0.12, 2.5, 0.12],
            position: [1.85, 1.25, 0.78],
            color: SHELTER_FRAME,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'glass-back',
            size: [3.74, 1.85, 0.06],
            position: [0, 1.38, -0.82],
            color: SHELTER_GLASS,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'glass-side',
            size: [0.06, 1.85, 1.6],
            position: [-1.85, 1.38, 0],
            color: SHELTER_GLASS,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'glass-side',
            size: [0.06, 1.85, 1.6],
            position: [1.85, 1.38, 0],
            color: SHELTER_GLASS,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'roof',
            size: [4.0, 0.14, 1.85],
            position: [0, 2.45, 0],
            color: SHELTER_ROOF,
            material: 'housing',
            castShadow: true,
            scaleWithFootprint: false,
          },
          {
            name: 'fascia',
            size: [4.0, 0.22, 0.08],
            position: [0, 2.29, 0.9],
            color: TRANSIT_BLUE,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'bench',
            size: [3.0, 0.12, 0.46],
            position: [0, 0.52, -0.5],
            color: SHELTER_BENCH,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'bench-leg',
            size: [0.09, 0.46, 0.4],
            position: [-1.2, 0.23, -0.5],
            color: SHELTER_FRAME,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'bench-leg',
            size: [0.09, 0.46, 0.4],
            position: [1.2, 0.23, -0.5],
            color: SHELTER_FRAME,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'sign-pole',
            size: [0.09, 2.8, 0.09],
            position: [2.35, 1.4, 0.55],
            color: SHELTER_FRAME,
            material: 'housing',
            scaleWithFootprint: false,
          },
          {
            name: 'sign',
            size: [0.95, 0.52, 0.07],
            position: [2.35, 2.55, 0.55],
            color: 0xffffff,
            renderOrder: 1,
            material: 'sign',
            scaleWithFootprint: false,
          },
        ],
      },
      {
        id: 'interchange',
        parts: [
          {
            name: 'canopy',
            size: [8, 0.3, 6],
            position: [0, 3.2, 0],
            color: SHELTER_ROOF,
            material: 'housing',
            castShadow: true,
          },
          {
            name: 'fascia',
            size: [8, 0.26, 0.1],
            position: [0, 2.99, 3.05],
            color: TRANSIT_BLUE,
            material: 'housing',
          },
          {
            name: 'post',
            size: [0.25, 3, 0.25],
            position: [0, 1.5, 0],
            color: SHELTER_FRAME,
            material: 'housing',
            repeat: { axis: 'x', spacing: 4, max: 20 },
            scaleWithFootprint: false,
          },
          {
            name: 'bench',
            size: [2, 0.35, 0.6],
            position: [0, 0.55, 2.1],
            color: SHELTER_BENCH,
            material: 'housing',
            repeat: { axis: 'x', spacing: 6, max: 5 },
            scaleWithFootprint: false,
          },
          {
            name: 'sign',
            size: [3, 1, 0.15],
            position: [4, 3.7, 0],
            color: 0xffffff,
            renderOrder: 1,
            material: 'sign',
            scaleWithFootprint: false,
          },
        ],
      },
    ],
  },
  {
    kind: 'gasStation',
    name: 'Gas station',
    footprint: { width: 8, depth: 6 },
    variants: [
      {
        id: 'default',
        parts: [
          {
            name: 'canopy',
            size: [8, 0.3, 6],
            position: [0, 3.15, 0],
            color: 0xfdd835,
            castShadow: true,
          },
          {
            name: 'pole-left',
            size: [0.3, 3, 0.3],
            position: [-3, 1.5, 0],
            color: 0x757575,
          },
          {
            name: 'pole-right',
            size: [0.3, 3, 0.3],
            position: [3, 1.5, 0],
            color: 0x757575,
          },
        ],
      },
    ],
  },
  {
    kind: 'fireStation',
    name: 'Fire station',
    footprint: { width: 10, depth: 8 },
    variants: [
      {
        id: 'default',
        parts: [
          {
            name: 'building',
            size: [10, 4, 8],
            position: [0, 2, 0],
            color: 0xc62828,
            castShadow: true,
          },
          {
            name: 'door',
            size: [4, 3, 0.2],
            position: [0, 1.5, 4.1],
            color: 0x8e0000,
          },
        ],
      },
    ],
  },
  {
    kind: 'hospital',
    name: 'Hospital',
    footprint: { width: 10, depth: 8 },
    variants: [
      {
        id: 'default',
        parts: [
          {
            name: 'building',
            size: [10, 5, 8],
            position: [0, 2.5, 0],
            color: 0xfafafa,
            castShadow: true,
          },
          {
            name: 'cross-vert',
            size: [0.6, 3, 0.1],
            position: [0, 3.5, 4.05],
            color: 0xe53935,
          },
          {
            name: 'cross-hori',
            size: [3, 0.6, 0.1],
            position: [0, 3.5, 4.05],
            color: 0xe53935,
          },
        ],
      },
    ],
  },
  {
    kind: 'policeStation',
    name: 'Police station',
    footprint: { width: 10, depth: 8 },
    variants: [
      {
        id: 'default',
        parts: [
          {
            name: 'building',
            size: [10, 4, 8],
            position: [0, 2, 0],
            color: 0x1565c0,
            castShadow: true,
          },
          {
            name: 'shield',
            size: [2, 2.5, 0.1],
            position: [0, 2.5, 4.05],
            color: 0xffffff,
          },
        ],
      },
    ],
  },
];
