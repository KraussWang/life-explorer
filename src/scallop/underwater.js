import * as THREE from 'three';

// Shared clock uniform so every injected material animates in lock-step and
// window.__habitat.setTime(t) can freeze the whole scene for screenshots.
export const uniforms = {
  time: { value: 0 },
};

// Per-channel water extinction + in-scatter, matched by the surface shader and
// the background dome so distant geometry dissolves seamlessly.
export const FOG_GLSL = /* glsl */`
vec3 uwInscatter(vec3 dir) {
  vec3 deep = vec3(0.008, 0.16, 0.28);
  vec3 bright = vec3(0.15, 0.57, 0.70);
  return mix(deep, bright, smoothstep(0.0, 0.7, dir.y));
}
vec3 uwApplyFog(vec3 col, vec3 fogVec) {
  float d = length(fogVec);
  vec3 dir = fogVec / max(d, 1e-5);
  vec3 T = exp(-d * vec3(0.032, 0.019, 0.014));
  vec3 ins = uwInscatter(dir);
  float farF = 1.0 - exp(-pow(d * 0.016, 2.0));
  return mix(col * T + ins * (1.0 - T), ins, farF);
}
`;

export const CAUSTIC_GLSL = /* glsl */`
vec2 uwHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float uwVoronoiEdge(vec2 x, float t) {
  vec2 n = floor(x), f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = uwHash2(n + g);
    o = 0.5 + 0.42 * sin(t * 0.7 + 6.2831 * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; }
    else if (d < f2) { f2 = d; }
  }
  return f2 - f1;
}
// Cellular bright-edge web, always in [0,1]. Domain-warped so cells read as
// organic honeycomb, not regular polygons. uv unit ~= 1 m.
float uwCaustic(vec2 uv, float t) {
  uv += vec2(sin(uv.y * 3.1 + t * 0.4), cos(uv.x * 2.7 - t * 0.3)) * 0.30;
  uv += (vec2(uwNoise(uv * 1.9), uwNoise(uv * 1.9 + 31.0)) - 0.5) * 0.55;
  float e1 = uwVoronoiEdge(uv, t);
  float e2 = uwVoronoiEdge(uv * 2.3 + 7.3, t * 1.35 + 2.0);
  float aa = min(length(fwidth(uv)) * 0.5, 0.15);
  float c = (1.0 - smoothstep(0.015, 0.085 + aa, e1))
          + 0.18 * (1.0 - smoothstep(0.0, 0.055 + aa, e2));
  return clamp(c, 0.0, 1.0);
}
`;

export const NOISE_GLSL = /* glsl */`
float uwHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float uwNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(uwHash(i), uwHash(i + vec2(1, 0)), u.x),
             mix(uwHash(i + vec2(0, 1)), uwHash(i + vec2(1, 1)), u.x), u.y);
}
// Smooth value noise (interpolated hash lattice) for fine sand grain.
float uwVnoise(vec2 p) { return uwNoise(p); }
float uwFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * uwNoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const VERT_DECL = /* glsl */`
uniform float uTime;
varying vec3 vUwWorld;
varying vec3 vUwNrm;
varying vec3 vUwFog;
`;

const VERT_CAPTURE = /* glsl */`
vec4 uwW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
uwW = instanceMatrix * uwW;
#endif
uwW = modelMatrix * uwW;
vUwWorld = uwW.xyz;
vUwFog = uwW.xyz - cameraPosition;
vUwNrm = inverseTransformDirection(transformedNormal, viewMatrix);
`;

const FRAG_DECL = /* glsl */`
uniform float uTime;
varying vec3 vUwWorld;
varying vec3 vUwNrm;
varying vec3 vUwFog;
${NOISE_GLSL}
${FOG_GLSL}
${CAUSTIC_GLSL}
`;

const FOG_FRAG = /* glsl */`
#ifdef UW_DEBUG_NAN
if (isnan(gl_FragColor.r) || isnan(gl_FragColor.g) || isnan(gl_FragColor.b) ||
    isinf(gl_FragColor.r) || isinf(gl_FragColor.g) || isinf(gl_FragColor.b)) {
  gl_FragColor.rgb = vec3(1.0, 0.0, 1.0);
} else
#endif
gl_FragColor.rgb = uwApplyFog(gl_FragColor.rgb, vUwFog);
`;

/**
 * Inject shared underwater features into a built-in material:
 *  - opts.caustic  multiply the directional light by animated caustics
 *  - opts.sway     vertex sway, {height} = local height that maps to full bend
 *  - opts.algae    olive algae coating on upward-facing surfaces
 *  - opts.onShader extra fragment snippet run after <color_fragment>
 */
export function applyUnderwater(material, opts = {}) {
  const o = Object.assign({ caustic: true, sway: 0, algae: false }, opts);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    if (o.sway) shader.uniforms.uSwayHeight = { value: o.sway };

    shader.vertexShader = VERT_DECL + shader.vertexShader;
    let swayCode = '';
    if (o.sway) {
      shader.vertexShader = 'uniform float uSwayHeight;\n' + shader.vertexShader;
      swayCode = /* glsl */`
      {
        float uwH = clamp(transformed.y / uSwayHeight, 0.0, 1.0);
        vec3 uwI = vec3(0.0);
        #ifdef USE_INSTANCING
        uwI = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #endif
        float uwPh = uTime * 1.3 + uwI.x * 0.7 + uwI.z * 0.5;
        transformed.x += sin(uwPh) * 0.06 * uwH * uwH;
        transformed.z += cos(uwPh * 0.83) * 0.045 * uwH * uwH;
      }`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\n' + swayCode);
    }
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\n' + VERT_CAPTURE);

    if (typeof location !== 'undefined' &&
        new URLSearchParams(location.search).has('nandebug')) {
      shader.fragmentShader = '#define UW_DEBUG_NAN\n' + shader.fragmentShader;
    }
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader;

    if (o.algae) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>', /* glsl */`#include <color_fragment>
      {
        // The Hyper3D rock albedo is near-black; lift toward grey-brown.
        float rockGrain = uwFbm(vUwWorld.xz * 13.0 + vUwWorld.yy * 7.0);
        diffuseColor.rgb = mix(diffuseColor.rgb * 1.25, vec3(0.38, 0.33, 0.25), 0.45);
        diffuseColor.rgb *= 0.55 + rockGrain * 0.95;
        vec3 uwN = normalize(vUwNrm);
        float mask = smoothstep(0.5, 0.78, uwN.y);
        mask *= smoothstep(0.3, 0.62, uwFbm(vUwWorld.xz * 1.6 + vUwWorld.yy * 2.0));
        mask *= 0.55 + 0.45 * uwNoise(vUwWorld.xz * 9.0);
        // Olive-brown algae: #6b7a2a / #4e5a2a in linear-ish terms.
        vec3 algaeCol = mix(vec3(0.075, 0.105, 0.016), vec3(0.155, 0.20, 0.024),
                            uwNoise(vUwWorld.xz * 5.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, algaeCol, clamp(mask * 0.65, 0.0, 0.38));
      }`);
    }
    if (o.onShader) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>', '#include <color_fragment>\n' + o.onShader);
    }

    if (o.caustic) {
      const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        /* glsl */`getDirectionalLightInfo( directionalLight, directLight );
        directLight.color *= uwCausticMod;`);
      const pre = /* glsl */`
      vec3 uwNrmW = normalize(vUwNrm);
      float uwCa = uwCaustic(vUwWorld.xz / 0.48, uTime);
      // Fade the web with distance so far sand stays smooth.
      uwCa *= mix(1.0, 0.35, smoothstep(8.0, 30.0, length(vUwFog)));
      vec3 uwCausticMod = vec3(clamp(mix(0.82, 1.9, uwCa), 0.0, 2.2))
                          * vec3(1.0, 0.98, 0.92);
      uwCausticMod = mix(vec3(1.0), uwCausticMod,
                         clamp(uwNrmW.y * 0.8 + 0.2, 0.0, 1.0));
      `;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>', pre + chunk);
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>', FOG_FRAG);
    if (material.userData.onShader) material.userData.onShader(shader);
  };
  // Distinct key per option set so programs are cached correctly.
  material.customProgramCacheKey = () =>
    `uw|c${o.caustic ? 1 : 0}|s${o.sway || 0}|a${o.algae ? 1 : 0}|${o.key || material.name}`;
  return material;
}
