export interface CarHandling {
  enginePower: number;
  turnRate: number;
  steeringSpeed: number;
  rollingResistance: number;
  brakePower: number;
  drag: number;
  maxReverseSpeed: number;
}

export interface CarPart {
  width: number;
  height: number;
  length: number;
  color: number;
  position: [number, number, number];
}

export interface CarWheel {
  radius: number;
  width: number;
  color: number;
  positions: [number, number, number][];
}

export interface CarLamp {
  width: number;
  height: number;
  length: number;
  color: number;
  emissive: number;
  emissiveIntensity: number;
  positions: [number, number, number][];
}

export interface CarAppearance {
  body: CarPart;
  cabin: CarPart;
  wheel: CarWheel;
  headlight: CarLamp;
  taillight: CarLamp;
}

export interface CarModel {
  url: string;
  targetLength: number;
  yawOffset: number;
}

export interface CarSpec {
  id: string;
  name: string;
  handling: CarHandling;
  appearance: CarAppearance;
  model?: CarModel;
}
