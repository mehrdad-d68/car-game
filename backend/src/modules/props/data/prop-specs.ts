import { PropSpec } from '../prop-spec';

export const PROP_SPECS: PropSpec[] = [
  {
    kind: 'trafficLight',
    name: 'Traffic light',
    variants: [
      {
        id: 'pole',
        parts: [
          { name: 'pole', size: [0.2, 4.2, 0.2], position: [0, 2.1, 0], color: 0x455a64 },
          { name: 'head', size: [0.9, 1.9, 0.25], position: [0, 3.35, 0], color: 0x1f2326 },
          { name: 'lamp-red', size: [0.34, 0.34, 0.06], position: [0, 3.9, 0.16], color: 0xffffff, emissive: 0xe53935, renderOrder: 1 },
          { name: 'lamp-amber', size: [0.34, 0.34, 0.06], position: [0, 3.35, 0.16], color: 0xffffff, emissive: 0xf9a825, renderOrder: 1 },
          { name: 'lamp-green', size: [0.34, 0.34, 0.06], position: [0, 2.8, 0.16], color: 0xffffff, emissive: 0x43a047, renderOrder: 1 },
        ],
      },
      {
        id: 'overhead',
        parts: [
          { name: 'head', size: [0.9, 1.9, 0.25], position: [0, 5.9, 0], color: 0x1f2326 },
          { name: 'lamp-red', size: [0.34, 0.34, 0.06], position: [0, 6.45, 0.16], color: 0xffffff, emissive: 0xe53935, renderOrder: 1 },
          { name: 'lamp-amber', size: [0.34, 0.34, 0.06], position: [0, 5.9, 0.16], color: 0xffffff, emissive: 0xf9a825, renderOrder: 1 },
          { name: 'lamp-green', size: [0.34, 0.34, 0.06], position: [0, 5.35, 0.16], color: 0xffffff, emissive: 0x43a047, renderOrder: 1 },
        ],
      },
    ],
  },
  {
    kind: 'pedestrianCrossing',
    name: 'Pedestrian crossing',
    variants: [
      {
        id: 'default',
        parts: [
          { name: 'stripe', size: [4.2, 0.03, 0.5], position: [0, 0, 0], color: 0xffffff, renderOrder: 1 },
        ],
      },
    ],
  },
  {
    kind: 'busStop',
    name: 'Bus stop',
    footprint: { width: 1.7, depth: 1.0 },
    variants: [
      {
        id: 'default',
        parts: [
          { name: 'pole', size: [0.2, 2.7, 0.2], position: [0, 1.35, 0], color: 0x455a64 },
          { name: 'sign', size: [1.7, 1.0, 0.16], position: [0, 2.05, 0], color: 0x1e88e5, emissive: 0x1e88e5, renderOrder: 1 },
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
          { name: 'canopy', size: [8, 0.3, 6], position: [0, 3.15, 0], color: 0xfdd835, castShadow: true },
          { name: 'pole-left', size: [0.3, 3, 0.3], position: [-3, 1.5, 0], color: 0x757575 },
          { name: 'pole-right', size: [0.3, 3, 0.3], position: [3, 1.5, 0], color: 0x757575 },
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
          { name: 'building', size: [10, 4, 8], position: [0, 2, 0], color: 0xc62828, castShadow: true },
          { name: 'door', size: [4, 3, 0.2], position: [0, 1.5, 4.1], color: 0x8e0000 },
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
          { name: 'building', size: [10, 5, 8], position: [0, 2.5, 0], color: 0xfafafa, castShadow: true },
          { name: 'cross-vert', size: [0.6, 3, 0.1], position: [0, 3.5, 4.05], color: 0xe53935 },
          { name: 'cross-hori', size: [3, 0.6, 0.1], position: [0, 3.5, 4.05], color: 0xe53935 },
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
          { name: 'building', size: [10, 4, 8], position: [0, 2, 0], color: 0x1565c0, castShadow: true },
          { name: 'shield', size: [2, 2.5, 0.1], position: [0, 2.5, 4.05], color: 0xffffff },
        ],
      },
    ],
  },
];