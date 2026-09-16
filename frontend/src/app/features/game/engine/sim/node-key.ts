export function roundKey(v: number): number {
  return Math.round(v * 4);
}

export function nodeHash(x: number, z: number): number {
  return roundKey(x) * 73856093 ^ roundKey(z) * 19349663;
}