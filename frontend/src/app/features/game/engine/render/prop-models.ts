import * as THREE from 'three';
import { MapItemKind } from '../sim/osm-types';
import { PropModel, PropSpec } from '../sim/prop-spec';
import { TrackData } from '../sim/track';
import { loadPropModel } from './model-loader';

export function presentPropKinds(track: TrackData): Set<MapItemKind> {
  const kinds = new Set<MapItemKind>();
  const features = track.features;
  if (features.trafficLights.length > 0) kinds.add('trafficLight');
  if (features.pedestrianCrossings.length > 0) kinds.add('pedestrianCrossing');
  if (features.publicTransportStops.length > 0) kinds.add('busStop');
  if (features.gasStations.length > 0) kinds.add('gasStation');
  if (features.fireStations.length > 0) kinds.add('fireStation');
  if (features.hospitals.length > 0) kinds.add('hospital');
  if (features.policeStations.length > 0) kinds.add('policeStation');
  return kinds;
}

export type PropModelLoader = (model: PropModel) => Promise<THREE.Group>;

export async function loadPresentModels(
  props: PropSpec[],
  present: ReadonlySet<MapItemKind>,
  loader: PropModelLoader = loadPropModel,
): Promise<Map<MapItemKind, THREE.Group>> {
  const models = new Map<MapItemKind, THREE.Group>();
  await Promise.all(
    props.flatMap((spec) => {
      if (!spec.model || !present.has(spec.kind)) return [];
      return [
        loader(spec.model)
          .then((group) => models.set(spec.kind, group))
          .catch((error: unknown) => {
            console.warn(`Failed to load prop model for ${spec.kind}`, error);
          }),
      ];
    }),
  );
  return models;
}