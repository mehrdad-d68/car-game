import * as THREE from 'three';
import { MarkingPattern } from '../sim/track';

export const MARKING_STYLE_NONE = 0;
export const MARKING_STYLE_TWO_WAY_DASHED = 1;
export const MARKING_STYLE_TWO_WAY_DOUBLE = 2;
export const MARKING_STYLE_ONE_WAY = 3;

export function markingStyleValue(pattern: MarkingPattern): number {
  switch (pattern) {
    case 'two-way-dashed':
      return MARKING_STYLE_TWO_WAY_DASHED;
    case 'two-way-double':
      return MARKING_STYLE_TWO_WAY_DOUBLE;
    case 'one-way':
      return MARKING_STYLE_ONE_WAY;
    default:
      return MARKING_STYLE_NONE;
  }
}

const VERTEX_DECLARATIONS = /* glsl */ `
attribute float aMarkingStyle;
attribute float aMarkingAcross;
attribute float aMarkingWidth;
attribute float aMarkingLanes;
attribute float aMarkingPrevS;
attribute float aMarkingPrevA;
attribute float aMarkingNextS;
attribute float aMarkingNextA;
varying float vMarkingStyle;
varying float vMarkingAcross;
varying float vMarkingWidth;
varying float vMarkingLanes;
varying float vMarkingPrevS;
varying float vMarkingPrevA;
varying float vMarkingNextS;
varying float vMarkingNextA;
`;

const VERTEX_ASSIGNMENTS = /* glsl */ `
	vMarkingStyle = aMarkingStyle;
	vMarkingAcross = aMarkingAcross;
	vMarkingWidth = aMarkingWidth;
	vMarkingLanes = aMarkingLanes;
	vMarkingPrevS = aMarkingPrevS;
	vMarkingPrevA = aMarkingPrevA;
	vMarkingNextS = aMarkingNextS;
	vMarkingNextA = aMarkingNextA;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying float vMarkingStyle;
varying float vMarkingAcross;
varying float vMarkingWidth;
varying float vMarkingLanes;
varying float vMarkingPrevS;
varying float vMarkingPrevA;
varying float vMarkingNextS;
varying float vMarkingNextA;

float markingAA(float edge, float x) {
	return smoothstep(edge, edge + fwidth(x), x);
}

float markingDash(float dist) {
	float period = 3.0 + 6.0;
	float phase = mod(dist, period);
	return 1.0 - smoothstep(3.0, 3.0 + fwidth(phase), phase);
}

float markingSolid(float across, float center) {
	return 1.0 - markingAA(0.12, abs(across - center));
}

float markingAllowance(float distToCenter, float allowance) {
	float ramp = 3.0;
	return clamp((distToCenter - allowance) / ramp, 0.0, 1.0);
}
`;

const FRAGMENT_BLOCK = /* glsl */ `
	{
		float dist = vMapUv.y * 4.0;
		float mask = min(
			markingAllowance(dist - vMarkingPrevS, vMarkingPrevA),
			markingAllowance(vMarkingNextS - dist, vMarkingNextA)
		);
		if (mask > 0.01 && vMarkingStyle > 0.5) {
			float across = vMarkingAcross;
			float w = vMarkingWidth;
			float lanes = max(vMarkingLanes, 1.0);
			float mark = 0.0;

			float edgeLineW = 0.2;
			mark = max(mark, 1.0 - markingAA(-w / 2.0 + edgeLineW, across));
			mark = max(mark, markingAA(w / 2.0 - edgeLineW, across));

			if (vMarkingStyle < 1.5) {
				mark = max(mark, markingSolid(across, 0.0) * markingDash(dist));
			} else if (vMarkingStyle < 2.5) {
				float cw = vMarkingWidth / lanes;
				float centerLine = mod(lanes, 2.0) > 0.5 ? -0.5 * cw : 0.0;
				mark = max(mark, markingSolid(across, centerLine - 0.25));
				mark = max(mark, markingSolid(across, centerLine + 0.25));
				for (int j = 0; j < 6; j++) {
					float fj = float(j);
					if (fj <= lanes - 2.0) {
						float center = (fj - (lanes - 1.0) / 2.0) * cw + cw / 2.0;
						if (abs(center - centerLine) > 0.4 * cw) {
							mark = max(mark, markingSolid(across, center) * markingDash(dist));
						}
					}
				}
			} else {
				float cw = vMarkingWidth / lanes;
				for (int j = 0; j < 6; j++) {
					float fj = float(j);
					if (fj <= lanes - 2.0) {
						float center = (fj - (lanes - 1.0) / 2.0) * cw + cw / 2.0;
						mark = max(mark, markingSolid(across, center) * markingDash(dist));
					}
				}
			}

			diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), mark * mask);
		}
	}
`;

export function applyMarkingsShader(material: THREE.MeshLambertMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = VERTEX_DECLARATIONS + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n' + VERTEX_ASSIGNMENTS,
    );

    shader.fragmentShader = FRAGMENT_DECLARATIONS + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n' + FRAGMENT_BLOCK,
    );
  };
  material.customProgramCacheKey = () => 'road-markings-v3';
}