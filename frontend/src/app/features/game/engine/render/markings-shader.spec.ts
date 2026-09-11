import * as THREE from 'three';
import { applyMarkingsShader, markingStyleValue } from './markings-shader';

type ShaderParameters = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

function injectedShaders(): { vertex: string; fragment: string } {
  const material = new THREE.MeshLambertMaterial();
  applyMarkingsShader(material);
  const shader: ShaderParameters = {
    vertexShader: 'void main() { #include <uv_vertex> }',
    fragmentShader: 'void main() { #include <map_fragment> }',
  } as unknown as ShaderParameters;
  const renderer = {} as THREE.WebGLRenderer;
  material.onBeforeCompile!(shader, renderer);
  return { vertex: shader.vertexShader, fragment: shader.fragmentShader };
}

describe('markingStyleValue', () => {
  it('maps marking patterns to styles', () => {
    expect(markingStyleValue('two-way-dashed')).toBe(1);
    expect(markingStyleValue('two-way-double')).toBe(2);
    expect(markingStyleValue('one-way')).toBe(3);
    expect(markingStyleValue('none')).toBe(0);
  });
});

describe('applyMarkingsShader', () => {
  it('registers a shader hook and a stable program cache key', () => {
    const material = new THREE.MeshLambertMaterial();
    applyMarkingsShader(material);
    expect(typeof material.onBeforeCompile).toBe('function');
    expect(material.customProgramCacheKey()).toBe('road-markings-v3');
  });

  it('reads the mapped UV produced by the map chunk, not the raw uv varying', () => {
    const { fragment } = injectedShaders();
    expect(fragment).toContain('vMapUv.y * 4.0');
    expect(fragment).not.toMatch(/\bvUv\b/);
  });

  it('uses no GLSL ES reserved identifiers in the injected code', () => {
    const { vertex, fragment } = injectedShaders();
    expect(`${vertex}\n${fragment}`).not.toMatch(/\bhalf\b/);
  });

  it('fades markings only when far from both the previous and the next junction', () => {
    const { fragment } = injectedShaders();
    expect(fragment).toContain(
      'markingAllowance(dist - vMarkingPrevS, vMarkingPrevA)',
    );
    expect(fragment).toContain(
      'markingAllowance(vMarkingNextS - dist, vMarkingNextA)',
    );
    expect(fragment).toMatch(/float mask = min\(/);
  });

  it('declares every varying the fragment block reads', () => {
    const { vertex, fragment } = injectedShaders();
    for (const varying of [
      'vMarkingStyle',
      'vMarkingAcross',
      'vMarkingWidth',
      'vMarkingLanes',
      'vMarkingPrevS',
      'vMarkingPrevA',
      'vMarkingNextS',
      'vMarkingNextA',
    ]) {
      const name = varying.slice(1);
      expect(vertex).toContain(`v${name} = a${name};`);
      expect(fragment).toContain(`varying float ${varying};`);
    }
  });

  it('draws dividers on a real lane boundary for odd lane counts', () => {
    const { fragment } = injectedShaders();
    expect(fragment).toContain('mod(lanes, 2.0) > 0.5 ? -0.5 * cw : 0.0');
    expect(fragment).toContain('abs(center - centerLine) > 0.4 * cw');
    expect(fragment).not.toContain('cw * 0.9');
  });
});