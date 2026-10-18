import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyUnderwater, uniforms, FOG_GLSL, NOISE_GLSL } from './underwater.js';
import { rng } from './noise.js';

// Small procedural fish: stretched body + tail fin, ~14 cm long.
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 10, 7);
  body.scale(0.125, 0.04, 0.023);
  const tail = new THREE.PlaneGeometry(0.05, 0.042);
  tail.translate(-0.075, 0, 0);
  const g = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()], false);
  g.computeVertexNormals();
  return g;
}

export function makeFish(scene) {
  const geo = fishGeometry();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a5564, metalness: 0.4, roughness: 0.5, // backlit silhouette hue
    side: THREE.DoubleSide,
  });
  // Tail wag by per-instance phase hashed from the instance translation.
  applyUnderwater(mat, {
    caustic: true, key: 'fish',
  });
  const baseCb = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    baseCb(shader);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
    {
      vec3 uwI = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float ph = uTime * 9.0 + dot(uwI, vec3(3.1, 5.7, 2.3));
      float tailness = smoothstep(0.0, -0.05, transformed.x);
      transformed.z += sin(ph) * 0.012 * tailness;
    }`);
  };

  const r = rng(551);
  const schools = [];
  const specs = [
    // One school visible upper-left in Establishing, one mid-right in Diagonal.
    { center: new THREE.Vector3(-6, 4.5, -12), rx: 4, rz: 4, speed: 0.09, n: 90 },
    { center: new THREE.Vector3(8, 4.0, -20), rx: 4, rz: 4, speed: -0.075, n: 90 },
  ];
  for (const spec of specs) {
    const mesh = new THREE.InstancedMesh(geo, mat, spec.n);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    const fish = [];
    for (let i = 0; i < spec.n; i++) {
      fish.push({
        off: new THREE.Vector3((r() - 0.5) * 4.5, (r() - 0.5) * 1.6, (r() - 0.5) * 4.5),
        phase: r() * Math.PI * 2,
        scale: 0.8 + r() * 0.5,
      });
    }
    scene.add(mesh);
    schools.push({ mesh, fish, spec });
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const euler = new THREE.Euler();
  function update(t) {
    for (const { mesh, fish, spec } of schools) {
      const a = t * spec.speed;
      const cx = spec.center.x + Math.cos(a) * spec.rx;
      const cz = spec.center.z + Math.sin(a) * spec.rz;
      const cy = spec.center.y + Math.sin(t * 0.11) * 0.5;
      // School heading = tangent of the ellipse path.
      const hx = -Math.sin(a) * spec.rx * Math.sign(spec.speed);
      const hz = Math.cos(a) * spec.rz * Math.sign(spec.speed);
      const heading = Math.atan2(-hz, hx);
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        const wob = t * 0.35 + f.phase;
        p.set(cx + f.off.x + Math.sin(wob) * 0.35,
              cy + f.off.y + Math.sin(wob * 1.3) * 0.2,
              cz + f.off.z + Math.cos(wob * 0.9) * 0.35);
        euler.set(0, heading + Math.sin(wob) * 0.12, 0);
        q.setFromEuler(euler);
        s.setScalar(f.scale);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return { update };
}

// Marine snow: a wrap-around box of drifting motes that follows the camera.
export function makeParticles(scene) {
  const N = 5000, BOX = 30;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const r = rng(313);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = r() * BOX;
    pos[i * 3 + 1] = r() * BOX;
    pos[i * 3 + 2] = r() * BOX;
    seed[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  // Soft round sprite from a canvas.
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(cv);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: uniforms.time,
      uMap: { value: sprite },
      uCam: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uCam;
      attribute float aSeed;
      varying float vFade;
      void main() {
        float B = ${BOX.toFixed(1)};
        vec3 p = position;
        p.y += uTime * (0.05 + fract(aSeed) * 0.08); // slow rise
        p.x += sin(uTime * 0.23 + aSeed) * 0.5;
        p.z += cos(uTime * 0.19 + aSeed * 1.7) * 0.5;
        // Wrap into a camera-centred box.
        p = mod(p - uCam + B * 0.5, B) - B * 0.5 + uCam;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = length(mv.xyz);
        vFade = smoothstep(0.3, 2.0, d) * smoothstep(B * 0.5, B * 0.28, d);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(160.0 / d, 1.0, 6.0) * (0.6 + fract(aSeed * 7.7) * 0.8);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vFade;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vec3(0.75, 0.9, 0.95) * 0.35, a * 0.35 * vFade);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    update(camera) { mat.uniforms.uCam.value.copy(camera.position); },
  };
}
