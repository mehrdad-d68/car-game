import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const OUTLINE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 1 },
    cameraFar: { value: 2000 },
    lineColor: { value: new THREE.Color(0x1a1a22) },
    thickness: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 lineColor;
    uniform float thickness;

    varying vec2 vUv;

    float perspectiveDepthToViewZ(const in float invClipZ, const in float nearZ, const in float farZ) {
      return (nearZ * farZ) / ((farZ - nearZ) * invClipZ - farZ);
    }

    float viewDepth(vec2 uv) {
      float depth = texture2D(tDepth, uv).x;
      return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    }

    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);
      float c = viewDepth(vUv);
      float n = viewDepth(vUv + vec2(0.0, texel.y));
      float s = viewDepth(vUv - vec2(0.0, texel.y));
      float e = viewDepth(vUv + vec2(texel.x, 0.0));
      float w = viewDepth(vUv - vec2(texel.x, 0.0));
      float biggest = max(max(abs(n - c), abs(s - c)), max(abs(e - c), abs(w - c)));
      float threshold = thickness * max(0.35, abs(c) / cameraFar) * 2.5;
      float line = clamp(biggest / max(threshold, 1e-5), 0.0, 1.0);
      vec4 color = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(mix(color.rgb, lineColor, line), color.a);
    }
  `,
};

export function createOutlineComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): EffectComposer {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });
  const composer = new EffectComposer(renderer, target);
  // The composer swaps its two buffers, so each needs its own depth attachment:
  // a pass may never sample the depth of the buffer it is drawing into.
  if (composer.renderTarget2.depthTexture === composer.renderTarget1.depthTexture) {
    composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
  }
  composer.addPass(new RenderPass(scene, camera));
  const pass = new ShaderPass(OUTLINE_SHADER);
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  bindReadDepth(composer, pass);
  return composer;
}

// The scene is drawn into the composer read buffer, and the outline pass draws
// into the write buffer. Reading the write buffer depth is a feedback loop: the
// driver drops the draw and the frame comes out black.
export function bindReadDepth(composer: EffectComposer, pass: ShaderPass | null): void {
  const depth = composer.readBuffer?.depthTexture;
  if (!pass || !depth) return;
  pass.uniforms['tDepth'].value = depth;
}
