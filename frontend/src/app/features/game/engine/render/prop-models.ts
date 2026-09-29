import * as THREE from 'three';
import { MapItemKind } from '../sim/osm-types';
import { PropModel, PropSpec } from '../sim/prop-spec';
import { featureKeyFor, STATION_KINDS, TrackData } from '../sim/track';
import { loadPropModel } from './model-loader';

export function presentPropKinds(track: TrackData): Set<MapItemKind> {
  const kinds = new Set<MapItemKind>();
  const features = track.features;
  if (features.trafficLights.length > 0) kinds.add('trafficLight');
  if (features.pedestrianCrossings.length > 0) kinds.add('pedestrianCrossing');
  if (features.publicTransportStops.length > 0) kinds.add('busStop');
  for (const kind of STATION_KINDS) {
    if (features[featureKeyFor(kind)].length > 0) kinds.add(kind);
  }
  return kinds;
}

export function replacedBuildingIds(
  track: TrackData,
  models: ReadonlyMap<MapItemKind, THREE.Group>,
): Set<number> {
  const replaced = new Set<number>();
  for (const kind of STATION_KINDS) {
    if (!models.has(kind)) continue;
    for (const marker of track.features[featureKeyFor(kind)]) {
      if (marker.buildingId !== undefined) replaced.add(marker.buildingId);
    }
  }
  return replaced;
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