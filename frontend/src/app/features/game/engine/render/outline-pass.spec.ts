import * as THREE from 'three';
import { bindReadDepth, createOutlineComposer, OUTLINE_SHADER } from './outline-pass';

describe('OUTLINE_SHADER', () => {
  it('declares every uniform the fragment code reads', () => {
    for (const name of ['tDiffuse', 'tDepth', 'resolution', 'cameraNear', 'cameraFar', 'lineColor', 'thickness']) {
      expect(OUTLINE_SHADER.uniforms).toHaveProperty(name);
      expect(OUTLINE_SHADER.fragmentShader).toContain(name);
    }
  });

  it('compares depth against its neighbours to find an edge', () => {
    expect(OUTLINE_SHADER.fragmentShader).toContain('tDepth');
    expect(OUTLINE_SHADER.fragmentShader).toMatch(/perspectiveDepthToViewZ|linearDepth/);
  });

  it('uses no GLSL reserved identifiers', () => {
    const source = `${OUTLINE_SHADER.vertexShader}\n${OUTLINE_SHADER.fragmentShader}`;
    expect(source).not.toMatch(/\bhalf\b/);
    expect(source).not.toMatch(/\bsample\b/);
  });
});
describe('bindReadDepth', () => {
  it('binds the depth of the buffer the pass reads, never the one it writes', () => {
    const readDepth = new THREE.DepthTexture(4, 4);
    const writeDepth = new THREE.DepthTexture(4, 4);
    const composer = {
      readBuffer: { depthTexture: readDepth },
      writeBuffer: { depthTexture: writeDepth },
    };
    const pass = { uniforms: { tDepth: { value: null as THREE.Texture | null } } };

    bindReadDepth(composer as never, pass as never);

    expect(pass.uniforms.tDepth.value).toBe(readDepth);
  });

  it('leaves the uniform alone when the read buffer has no depth texture', () => {
    const pass = { uniforms: { tDepth: { value: null as THREE.Texture | null } } };
    expect(() => bindReadDepth({ readBuffer: {} } as never, pass as never)).not.toThrow();
    expect(pass.uniforms.tDepth.value).toBeNull();
  });
});

describe('createOutlineComposer', () => {
  function fakeRenderer() {
    return {
      getPixelRatio: () => 1,
      getSize: (target: THREE.Vector2) => target.set(320, 240),
    } as unknown as THREE.WebGLRenderer;
  }

  it('gives both buffers their own depth texture, so the pass never samples what it writes', () => {
    const composer = createOutlineComposer(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(composer.renderTarget1.depthTexture).toBeDefined();
    expect(composer.renderTarget2.depthTexture).toBeDefined();
    expect(composer.renderTarget1.depthTexture).not.toBe(composer.renderTarget2.depthTexture);
  });
});
