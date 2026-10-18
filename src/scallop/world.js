import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { uniforms } from './underwater.js';
import { makeSandMaterial, makeHeightfield } from './terrain.js';
import { makeDome, makeSurface, makeLightShafts } from './surface.js';
import { buildScatter } from './scatter.js';
import { makeFish, makeParticles } from './life.js';
import { makeComposer } from './post.js';

const ASSETS = '/habitats/scallop/assets/';
const SPAWN_X = 0;
const SPAWN_Z = 5;
const FLOOR_CLEARANCE = 1.5;
const CAMERA_CLEARANCE = 1.25;
const WATER_CLEARANCE = 1.7;

function disposeScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    if (material.userData.reefMask) textures.add(material.userData.reefMask);
    material.dispose();
  }
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  scene.environment?.dispose();
  scene.clear();
}

export async function createScallopWorld(renderer, camera, progress = () => {}) {
  const response = await fetch(ASSETS + 'scene.json');
  if (!response.ok) throw new Error('扇贝栖息地数据加载失败');
  const manifest = await response.json();
  progress(0.12);
  const groundHeight = makeHeightfield(manifest.heightfield);
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(...manifest.sun.direction).normalize();
  let composer;
  try {
    const sun = new THREE.DirectionalLight(manifest.sun.color, 3.4);
    sun.position.copy(sunDir).multiplyScalar(-80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, {left: -28, right: 28, top: 28, bottom: -28, near: 10, far: 200});
    sun.shadow.bias = -0.00004;
    sun.shadow.normalBias = 0.003;
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xf3f8ff, 0xc4ae85, 0.7));

    const gltf = await new GLTFLoader().loadAsync(ASSETS + 'seafloor.glb', event => {
      if (event.total) progress(0.12 + event.loaded / event.total * 0.34);
    });
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      object.material = makeSandMaterial(manifest.reefs);
      object.receiveShadow = true;
      object.castShadow = false;
    });
    scene.add(gltf.scene);
    scene.add(makeDome(), makeSurface(manifest.waterLevel, sunDir),
      makeLightShafts(manifest.waterLevel, sunDir));
    progress(0.5);
    await buildScatter(scene, manifest);
    progress(0.84);
    const fish = makeFish(scene);
    const particles = makeParticles(scene);

    const environmentScene = new THREE.Scene();
    environmentScene.add(makeDome());
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(environmentScene, 0.04).texture;
    scene.environmentIntensity = 0.18;
    pmrem.dispose();
    disposeScene(environmentScene);

    ({composer} = makeComposer(renderer, scene, camera, sunDir));
    const grade = composer.passes.at(-1);
    const godrays = composer.passes[1];
    godrays.enabled = false;
    let qualityHigh = false;
    let elapsed = 0;
    const spawn = [SPAWN_X, groundHeight(SPAWN_X, SPAWN_Z) + FLOOR_CLEARANCE, SPAWN_Z];
    const colliderRings = manifest.reefs.map(reef => ({x: reef.x, z: reef.z, r: reef.r + 0.55}));

    function constrain(position, floorClearance = CAMERA_CLEARANCE) {
      position.x = THREE.MathUtils.clamp(position.x, manifest.bounds.x[0] + 1, manifest.bounds.x[1] - 1);
      position.z = THREE.MathUtils.clamp(position.z, manifest.bounds.z[0] + 1, manifest.bounds.z[1] - 1);
      position.y = THREE.MathUtils.clamp(position.y,
        groundHeight(position.x, position.z) + floorClearance,
        manifest.waterLevel - WATER_CLEARANCE);
      for (const reef of colliderRings) {
        if (position.y > groundHeight(reef.x, reef.z) + 3.1) continue;
        const dx = position.x - reef.x, dz = position.z - reef.z;
        const distance = Math.hypot(dx, dz);
        if (distance < reef.r) {
          const scale = reef.r / Math.max(distance, 0.0001);
          position.x = reef.x + (distance ? dx * scale : reef.r);
          position.z = reef.z + dz * scale;
        }
      }
      position.y = Math.max(position.y, groundHeight(position.x, position.z) + floorClearance);
      return position;
    }

    function resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
    }
    function quality(high) {
      qualityHigh = high;
      renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 0.8));
      renderer.shadowMap.enabled = high;
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.passes[2].enabled = high;
      resize();
    }
    function tick(dt) {
      elapsed += dt;
      uniforms.time.value = elapsed;
      grade.uniforms.uTime.value = elapsed;
      sun.target.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
      sun.position.copy(sun.target.position).addScaledVector(sunDir, -80);
      fish.update(elapsed);
      particles.update(camera);
    }
    function render() {
      renderer.toneMappingExposure = 1.05;
      composer.render();
    }
    function dispose() {
      composer.dispose();
      disposeScene(scene);
    }
    progress(1);
    return {scene, camera, renderer, manifest, groundHeight, constrain, quality, tick, render,
      resize, dispose, spawn, environment() {}, get qualityHigh() { return qualityHigh; }};
  } catch (error) {
    composer?.dispose();
    disposeScene(scene);
    throw error;
  }
}
