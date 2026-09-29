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
    variants: [],
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
