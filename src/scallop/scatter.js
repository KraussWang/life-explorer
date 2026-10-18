import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyUnderwater } from './underwater.js';
import { rng } from './noise.js';

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

// Merge every mesh in a GLB scene into a single geometry; meshes are grouped
// by material so multi-material assets keep their material array.
async function loadMerged(url) {
  const gltf = await load(url);
  const buckets = new Map(); // material -> geometries
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  const materials = [...buckets.keys()];
  const merged = materials.map((m) => {
    const gs = buckets.get(m);
    return gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
  });
  const geo = merged.length === 1 ? merged[0]
    : mergeGeometries(merged, true); // true -> groups per material
  geo.computeBoundingSphere();
  return { geo, material: materials.length === 1 ? materials[0] : materials };
}

const PEBBLE_COLORS = [0x887b67, 0xaaa092, 0x5b5650, 0xc8b493].map(
  (c) => new THREE.Color(c));
const SHELL_TINTS = [0xe8dccb, 0xd9b9a4].map(
  (c) => new THREE.Color(c));

function makePebbleGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  const r = rng(9917);
  const bumps = [];
  for (let i = 0; i < 8; i++) {
    bumps.push(new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize());
  }
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    let d = 1;
    for (const b of bumps) d += v.dot(b) * 0.06;
    v.multiplyScalar(d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const smoothGeo = mergeVertices(g);
  smoothGeo.computeVertexNormals();
  return smoothGeo;
}

function buildInstanced(geo, material, list, { colors = null, shadows = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const p = new THREE.Vector3();
  list.forEach((inst, i) => {
    p.fromArray(inst.p);
    q.set(inst.q[0], inst.q[1], inst.q[2], inst.q[3]);
    s.fromArray(inst.s);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, colors[inst.c ?? 0] || colors[0]);
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * Build every instanced layer from scene.json. Assets farther than 35 m from
 * the stage origin use the -lod variant.
 */
export async function buildScatter(scene, manifest) {
  const [rock, rockLod, fanweed, fanweedLod, waterweed, waterweedLod,
         scallop, scallopLod, starfish, algae] = await Promise.all([
    loadMerged('/habitats/scallop/models/rock.glb'), loadMerged('/habitats/scallop/models/rock-lod.glb'),
    loadMerged('/habitats/scallop/models/fanweed-lod.glb'), loadMerged('/habitats/scallop/models/fanweed-far.glb'),
    loadMerged('/habitats/scallop/models/waterweed-lod.glb'), loadMerged('/habitats/scallop/models/waterweed-far.glb'),
    loadMerged('/habitats/scallop/models/scallop.glb'), loadMerged('/habitats/scallop/models/scallop-lod.glb'),
    loadMerged('/habitats/scallop/models/starfish.glb'),
    loadMerged('/habitats/scallop/models/algae.glb'),
  ]);

  const group = new THREE.Group();
  group.name = 'Scatter';
  const I = manifest.instances;
  const split = (list, dist) => {
    const near = [], far = [];
    for (const e of list) (Math.hypot(e.p[0], e.p[2]) > dist ? far : near).push(e);
    return [near, far];
  };

  const prepOne = (mat, { metal, rough, ...opts }) => {
    const m = mat.clone();
    m.metalness = metal;
    m.metalnessMap = null; // kill metallic channel of the MR map
    if (rough != null) { m.roughness = rough; m.roughnessMap = null; }
    applyUnderwater(m, opts);
    return m;
  };
  const prep = (mat, o) => Array.isArray(mat)
    ? mat.map((m) => prepOne(m, o)) : prepOne(mat, o);

  // Rocks keep their Hyper3D maps; albedo lift + algae handled in the shader.
  const rockMat = prep(rock.material, { metal: 0, rough: 1, algae: true, key: 'rock' });
  const rockMatLod = prep(rockLod.material || rock.material,
                          { metal: 0, rough: 1, algae: true, key: 'rock' });
  for (const g of [rock.geo, rockLod.geo]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = Math.sin(x * 23 + y * 17) * Math.sin(z * 29 - y * 13) * 0.018;
      p.setXYZ(i, x + d, y + d * Math.min(y * 8, 1), z + d * 0.7);
    }
    g.computeVertexNormals();
  }
  const [rn, rf] = split(I.rock, 26);
  if (rn.length) group.add(buildInstanced(rock.geo, rockMat, rn));
  if (rf.length) group.add(buildInstanced(rockLod.geo, rockMatLod, rf));

  const FAN_TINT = /* glsl */`
    // Olive fronds: lift texture, bias toward olive, drop saturation ~20%.
    diffuseColor.rgb = mix(diffuseColor.rgb * 1.3, vec3(0.42, 0.44, 0.14), 0.45);
    diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.333))), diffuseColor.rgb, 0.8);
  `;
  const fanMat = prep(fanweed.material,
                      { metal: 0, rough: 0.8, sway: 1.37, key: 'fan', onShader: FAN_TINT });
  [fanMat].flat().forEach((m) => { m.side = THREE.DoubleSide; });
  const fanMatLod = prep(fanweedLod.material || fanweed.material,
                         { metal: 0, rough: 0.8, sway: 0, key: 'fan', onShader: FAN_TINT });
  [fanMatLod].flat().forEach((m) => {
    m.side = THREE.DoubleSide;
  });
  // Preserve leaf silhouettes at range with simplified solid geometry.
  const [fn, ff] = split(I.fanweed, 12);
  if (fn.length) group.add(buildInstanced(fanweed.geo, fanMat, fn));
  if (ff.length) group.add(buildInstanced(fanweedLod.geo, fanMatLod, ff,
                                        { shadows: false }));

  const weedMat = prep(waterweed.material,
                       { metal: 0, rough: 0.85, sway: 0.46, key: 'weed' });
  [weedMat].flat().forEach((m) => {
    m.side = THREE.DoubleSide;
    if (m.color) m.color.multiplyScalar(2.4);
  });
  const weedMatLod = prep(waterweedLod.material || waterweed.material,
                          { metal: 0, rough: 0.85, sway: 0.46, key: 'weed' });
  [weedMatLod].flat().forEach((m) => {
    m.side = THREE.DoubleSide;
    if (m.color) m.color.multiplyScalar(2.4);
  });
  const [wn, wf] = split(I.waterweed, 12);
  if (wn.length) group.add(buildInstanced(waterweed.geo, weedMat, wn));
  if (wf.length) group.add(buildInstanced(waterweedLod.geo, weedMatLod, wf,
                                        { shadows: false }));

  const algaeMat = prep(algae.material, { metal: 0, rough: 0.9, sway: 1.37, key: 'algae' });
  [algaeMat].flat().forEach(m => { m.side = THREE.DoubleSide; });
  if (I.algae?.length) group.add(buildInstanced(algae.geo, algaeMat, I.algae));

  // Match the valve profile in the Blender master; retain the radial shell ribs.
  scallop.geo.scale(1, 0.62, 1);
  scallopLod.geo.scale(1, 0.62, 1);

  const scallopMat = prep(scallop.material, { metal: 0, rough: 0.72, key: 'scallop',
    onShader: 'diffuseColor.rgb *= vec3(1.0, 0.85, 0.70);' });
  const scallopMatLod = prep(scallopLod.material || scallop.material,
                             { metal: 0, rough: 0.72, key: 'scallop',
                               onShader: 'diffuseColor.rgb *= vec3(1.0, 0.85, 0.70);' });
  const [sn, sf_] = split(I.scallop, 28);
  if (sn.length) group.add(buildInstanced(scallop.geo, scallopMat, sn));
  if (sf_.length) group.add(buildInstanced(scallopLod.geo, scallopMatLod, sf_));

  const starMat = prep(starfish.material, { metal: 0.05, key: 'star' });
  [starMat].flat().forEach((m) => {
    if (m.color) m.color.lerp(new THREE.Color(0xd9742a), 0.3); // saturated orange
  });
  if (I.starfish.length) {
    // Source model stands upright; lay it flat, detailed face up.
    starfish.geo.rotateX(-Math.PI / 2);
    starfish.geo.scale(1, 0.4, 1);
    starfish.geo.computeBoundingBox();
    const sb = starfish.geo.boundingBox, sc = sb.getCenter(new THREE.Vector3());
    starfish.geo.translate(-sc.x, -sb.min.y, -sc.z);
    group.add(buildInstanced(starfish.geo, starMat, I.starfish));
  }

  // Ribbed fan-shaped fragments, with a cream and pale pink palette.
  if (I.shell.length) {
    const vertices = [], indices = [];
    for (let r = 0; r <= 5; r++) for (let a = 0; a <= 24; a++) {
      const t = (a / 24 - 0.5) * 2.7, rad = r / 5;
      vertices.push(Math.sin(t) * rad, Math.sin(rad * Math.PI) * 0.18 +
        Math.cos(t * 18) * 0.025 * rad, Math.cos(t) * rad - 0.5);
      if (r < 5 && a < 24) {
        const i = r * 25 + a;
        indices.push(i, i + 25, i + 1, i + 1, i + 25, i + 26);
      }
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    shellGeo.setIndex(indices); shellGeo.computeVertexNormals();
    const shellMat = new THREE.MeshStandardMaterial({color: 0xf0dfcb, roughness: 0.82, side: THREE.DoubleSide});
    applyUnderwater(shellMat, {key: 'shell-fragment'});
    group.add(buildInstanced(shellGeo, shellMat, I.shell,
                             { colors: SHELL_TINTS, shadows: false }));
  }

  // Small rubble uses shared rounded geometry; large rocks retain source detail.
  if (I.rubble?.length) {
    const rubbleGeo = makePebbleGeometry();
    rubbleGeo.scale(0.946, 0.469, 0.515);
    rubbleGeo.translate(0, 0.469, 0);
    const rubbleMat = new THREE.MeshStandardMaterial({color: 0x9a8a70, roughness: 1});
    applyUnderwater(rubbleMat, {key: 'rubble', onShader: `
      float mottled = uwFbm(vUwWorld.xz * 60.0);
      diffuseColor.rgb *= 0.60 + mottled * 0.65;
    `});
    group.add(buildInstanced(rubbleGeo, rubbleMat, I.rubble,
                             { shadows: false }));
  }

  if (I.pebble.length) {
    const pebbleMat = new THREE.MeshStandardMaterial({
      roughness: 0.9, metalness: 0, name: 'Pebble',
    });
    applyUnderwater(pebbleMat, { caustic: true, key: 'pebble' });
    group.add(buildInstanced(makePebbleGeometry(), pebbleMat, I.pebble,
                             { colors: PEBBLE_COLORS, shadows: false }));
  }

  scene.add(group);
  return group;
}
