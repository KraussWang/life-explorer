import * as THREE from 'three';
import { uniforms, FOG_GLSL, CAUSTIC_GLSL, NOISE_GLSL } from './underwater.js';
import { rng } from './noise.js';

// Sky/water background dome: renders the same in-scatter colour the fog model
// converges to, so distant terrain fades into it without a seam.
export function makeDome() {
  const geo = new THREE.SphereGeometry(900, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // pin to far plane
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      ${FOG_GLSL}
      void main() {
        vec3 dir = normalize(vDir);
        vec3 c = uwInscatter(dir);
        // Below the horizon the dome is the dimmer deep-water tone anyway.
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/**
 * Opaque water surface seen from below, with filtered ripples and sunlight.
 */
export function makeSurface(waterLevel, sunDir) {
  const geo = new THREE.PlaneGeometry(600, 600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.BackSide, // seen from below
    uniforms: {
      uTime: uniforms.time,
      uSun: { value: sunDir.clone() }, // direction light travels (down/forward)
      uLevel: { value: waterLevel },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uSun;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      ${FOG_GLSL}
      ${CAUSTIC_GLSL}
      void main() {
        vec3 toP = vWorld - cameraPosition;
        float dist = length(toP);
        vec3 dir = toP / dist;
        vec3 sunDir = normalize(-uSun); // direction toward the sun
        vec2 p = vWorld.xz;
        p += vec2(uwFbm(p * 0.7), uwFbm(p * 0.7 + 11.0)) * 2.0;
        float waves = sin(p.x * 6.3 + sin(p.y * 4.8 + uTime * 0.35) * 1.7)
                    * sin(p.y * 8.7 - uTime * 0.5 + sin(p.x * 4.6));
        float detailFade = 1.0 - smoothstep(0.08, 0.7, length(fwidth(p)));
        float rip = smoothstep(-0.35, 0.92, waves) * detailFade;
        // Snell window: bright overhead, dark green at grazing angles.
        vec3 base = mix(vec3(0.015, 0.24, 0.38), vec3(0.30, 0.70, 0.83),
                        smoothstep(0.08, 0.75, dir.y));
        vec3 col = base + rip * vec3(0.30, 0.40, 0.40) * smoothstep(0.10, 0.6, dir.y);
        vec3 bent = normalize(dir + vec3(waves * 0.13, 0.0, (rip - 0.5) * 0.16));
        float s = max(dot(bent, sunDir), 0.0);
        col += vec3(0.92, 0.97, 1.0) * (pow(s, 8.0) * 2.0 + pow(s, 110.0) * 5.0);
        col += rip * pow(s, 5.0) * 0.65;
        col = uwApplyFog(col, toP);

        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = waterLevel;
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * World-space light shafts: 64 soft billboards aligned with the sunlight.
 * Both transverse and longitudinal edges fade continuously.
 */
export function makeLightShafts(waterLevel, sunDir) {
  const N = 64;
  const r = rng(2207);
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  const pos = new Float32Array(N * 3), w = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 26;
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = waterLevel - 0.1;
    pos[i * 3 + 2] = Math.sin(a) * rad;
    w[i] = 0.40 + r() * 1.1;
    ph[i] = r() * 100;
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('aW', new THREE.InstancedBufferAttribute(w, 1));
  geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
  geo.instanceCount = N;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: uniforms.time,
      uAxis: { value: sunDir.clone().normalize() }, // light travel dir (down)
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos;
      attribute float aW;
      attribute float aPh;
      uniform vec3 uAxis;
      varying vec2 vUv;
      varying float vPh;
      varying float vT;
      void main() {
        vUv = uv;
        vPh = aPh;
        // Cylindrical billboard: free axis = shaft direction, width faces camera.
        vec3 toCam = cameraPosition - aPos;
        vec3 wdir = normalize(cross(uAxis, toCam));
        vec3 wp = aPos + uAxis * ((1.0 - uv.y) * 8.8) + wdir * (uv.x - 0.5) * aW;
        vT = length(cameraPosition - wp);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      varying float vPh;
      varying float vT;
      void main() {
        float bx = (vUv.x - 0.5) * 5.5;
        float edge = exp(-bx * bx) * (1.0 - smoothstep(0.35, 0.5, abs(vUv.x - 0.5)));
        float fade = smoothstep(0.0, 0.85, vUv.y) * (1.0 - smoothstep(0.94, 1.0, vUv.y)) * 0.20;
        fade *= 0.75 + 0.25 * sin(uTime * 0.4 + vPh);  // slow shimmer
        float T = exp(-vT * 0.035);                    // distance attenuation
        vec3 col = vec3(0.75, 0.95, 1.0) * edge * fade * T;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}
