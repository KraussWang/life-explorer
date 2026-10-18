import * as THREE from 'three';
import { applyUnderwater } from './underwater.js';

// Heightfield sampling for runtime queries (camera hints, particles).
export function makeHeightfield(hf) {
  const { size, res, data } = hf;
  const half = size / 2;
  return (x, z) => {
    const gx = Math.min(res - 1.001, Math.max(0, (x + half) / size * (res - 1)));
    const gz = Math.min(res - 1.001, Math.max(0, (z + half) / size * (res - 1)));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const i = z0 * res + x0;
    const a = data[i], b = data[i + 1], c = data[i + res], d = data[i + res + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

// 512px mask of reef footprints -> darker, slightly olive sand near reefs.
function makeReefMask(reefs) {
  const N = 512, half = 80;
  const data = new Uint8Array(N * N * 4);
  for (const r of reefs) {
    const rad = r.r * 2.2;
    const x0 = Math.max(0, Math.floor((r.x - rad + half) / (2 * half) * N));
    const x1 = Math.min(N - 1, Math.ceil((r.x + rad + half) / (2 * half) * N));
    const z0 = Math.max(0, Math.floor((r.z - rad + half) / (2 * half) * N));
    const z1 = Math.min(N - 1, Math.ceil((r.z + rad + half) / (2 * half) * N));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / N * 2 * half - half;
        const wz = (z + 0.5) / N * 2 * half - half;
        const d = Math.hypot(wx - r.x, wz - r.z) / rad;
        if (d >= 1) continue;
        const v = Math.round(255 * (1 - d * d) * (1 - d * d));
        const idx = (z * N + x) * 4;
        if (v > data[idx]) data[idx] = v;
      }
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const SAND_DBG = typeof location !== 'undefined'
  ? (new URLSearchParams(location.search).get('sand') || '') : '';

export function makeSandMaterial(reefs) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd9c49a,
    roughness: 0.95,
    metalness: 0.0,
    name: 'Sand',
  });
  const reefMask = makeReefMask(reefs);
  mat.userData.reefMask = reefMask;
  applyUnderwater(mat, {
    caustic: !SAND_DBG.includes('nocaus'),
    key: 'sand',
    onShader: SAND_DBG.includes('nocol') ? '' : /* glsl */`
    {
      vec2 wp = vUwWorld.xz;
      // Low-frequency patches: warm cream vs faint grey-green.
      float patchN = uwFbm(wp * 0.05);
      vec3 warm = vec3(0.78, 0.66, 0.48);
      vec3 cool = vec3(0.64, 0.61, 0.50);
      diffuseColor.rgb = mix(warm, cool, smoothstep(0.3, 0.7, patchN));
      // Reef proximity darkens the sand with olive-brown algae debris.
      #ifndef SAND_NOMASK
      float reefM = texture2D(uReefMask, (wp + 80.0) / 160.0).r;
      diffuseColor.rgb *= 1.0 - reefM * 0.15;
      float debris = reefM * smoothstep(0.45, 0.8, uwVnoise(wp * 22.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.33, 0.15),
                             reefM * 0.12 + debris * 0.3);
      #endif
      // Fine grain: interpolated value noise at ~400/m, +-6% brightness,
      // plus ~1% dark flecks and sparse bright specks.
      #ifndef SAND_NOGRAIN
      float grainFade = 1.0 - smoothstep(0.004, 0.025, length(fwidth(wp)));
      float g = uwVnoise(wp * 180.0);
      diffuseColor.rgb *= 1.0 + (g - 0.5) * 0.32 * grainFade;
      float dark = smoothstep(0.78, 0.94, uwVnoise(wp * 120.0 + 31.0)) * grainFade;
      float lite = smoothstep(0.85, 0.98, uwVnoise(wp * 140.0 + 57.0)) * grainFade;
      diffuseColor.rgb *= 1.0 - 0.35 * dark;
      diffuseColor.rgb += 0.08 * lite;
      #endif
    }`.replaceAll('#ifndef SAND_NOMASK', SAND_DBG.includes('nomask') ? '#if 0' : '#if 1')
        .replaceAll('#ifndef SAND_NOGRAIN', SAND_DBG.includes('nograin') ? '#if 0' : '#if 1')
        .replaceAll('#endif', '#endif'),
  });
  const baseOnShader = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uReefMask = { value: reefMask };
    baseOnShader(shader);
    // Procedural ripple normal: ~0.22 m sine waves along X, direction warped
    // by noise; injected as a perturbation of the geometric world normal.
    if (!SAND_DBG.includes('norip')) shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
    {
      vec2 wp = vUwWorld.xz;
      float warp = uwFbm(wp * 0.35) * 3.0;
      float wave = (wp.x + wp.y * 0.22) * 6.28318 / 0.38 + warp;
      float rippleFade = 1.0 - smoothstep(0.03, 0.12, length(fwidth(wp)));
      float dh = (cos(wave) * 0.60 + cos(wave * 0.37 + 1.7) * 0.18) * rippleFade;
      vec2 grad = vec2(dh, dh * 0.35 * (uwNoise(wp * 0.8) - 0.5) * 4.0);
      vec3 wN = normalize(vUwNrm);
      vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), wN));
      vec3 b = cross(wN, t);
      vec3 wNp = normalize(wN - (t * grad.x + b * grad.y) * 0.5);
      normal = normalize((viewMatrix * vec4(wNp, 0.0)).xyz);
    }`);
    shader.fragmentShader = 'uniform sampler2D uReefMask;\n' + shader.fragmentShader;
  };
  return mat;
}
