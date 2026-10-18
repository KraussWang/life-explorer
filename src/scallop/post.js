import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Screen-space god rays: the water-surface shader stores beam source
 * intensity in alpha (1 - mask), opaque materials write alpha = 1, so
 * (1 - a) * luminance isolates the bright cells on the surface. Radial blur
 * towards the sun's projected screen position turns them into shafts.
 */
class GodRaysPass extends Pass {
  constructor(camera, sunDir) {
    super();
    this.camera = camera;
    this.sunDir = sunDir;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uSunScreen: { value: new THREE.Vector2(0.5, 1.2) },
        uDecay: { value: 0.965 },
        uDensity: { value: 0.9 },
        uWeight: { value: 1.3 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc;
        uniform vec2 uSunScreen;
        uniform float uDecay, uDensity, uWeight;
        varying vec2 vUv;
        void main() {
          const int STEPS = 72;
          vec2 delta = (uSunScreen - vUv) * uDensity / float(STEPS);
          vec2 uv = vUv;
          float illum = 1.0;
          vec3 acc = vec3(0.0);
          for (int i = 0; i < STEPS; i++) {
            uv += delta;
            vec4 s = texture2D(tSrc, clamp(uv, 0.0, 1.0));
            float src = (1.0 - s.a) * dot(s.rgb, vec3(0.33));
            // Guard: a single NaN/Inf texel would otherwise smear across the
            // whole frame through the 56-tap radial blur.
            if (isnan(src) || isinf(src)) src = 0.0;
            acc += src * illum;
            illum *= uDecay;
          }
          acc *= uWeight / float(STEPS) * 2.2 * 0.35; // exposure 0.35
          gl_FragColor = vec4(acc, 1.0);
        }`,
    }));
    // ?raymask=1 dumps the raw beam-source mask for debugging.
    this.debugMask = typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('raymask');
    this.composite = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tRays: { value: this.rt.texture },
                  uDebug: { value: this.debugMask ? 1 : 0 } },
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc;
        uniform sampler2D tRays;
        uniform float uDebug;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tSrc, vUv);
          if (uDebug > 0.5) {
            gl_FragColor = vec4(vec3(1.0 - base.a), 1.0); // raw mask
            return;
          }
          vec3 rays = texture2D(tRays, vUv).rgb;
          gl_FragColor = vec4(base.rgb + rays * vec3(0.75, 0.95, 1.0) * 1.8,
                              base.a);
        }`,
    }));
    this._sunWorld = new THREE.Vector3();
    this._proj = new THREE.Vector3();
    this.needsSwap = true;
  }
  setSize(w, h) {
    this.rt.setSize(Math.floor(w / 2), Math.floor(h / 2));
  }
  render(renderer, writeBuffer, readBuffer) {
    // Sun screen position (may be off-screen, which is fine for the blur).
    this._sunWorld.copy(this.sunDir).multiplyScalar(-400)
      .add(this.camera.position);
    this._proj.copy(this._sunWorld).project(this.camera);
    this.blur.material.uniforms.uSunScreen.value.set(
      this._proj.x * 0.5 + 0.5, this._proj.y * 0.5 + 0.5);
    this.blur.material.uniforms.tSrc.value = readBuffer.texture;
    renderer.setRenderTarget(this.rt);
    this.blur.render(renderer);
    this.composite.material.uniforms.tSrc.value = readBuffer.texture;
    renderer.setRenderTarget(writeBuffer);
    this.composite.render(renderer);
  }
  dispose() {
    this.rt.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Minimal bloom: threshold -> downsampled separable blur -> additive
 * composite into writeBuffer. Never samples and writes the same buffer.
 */
class BloomPass extends Pass {
  constructor(strength = 0.45, threshold = 0.85, radius = 0.6) {
    super();
    this.strength = strength;
    this.rtA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.rtB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const mk = (frag, uniforms) => new FullScreenQuad(
      new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag,
                                 depthTest: false, depthWrite: false }));
    this.bright = mk(/* glsl */`
      uniform sampler2D tSrc; uniform float uThresh;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tSrc, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float w = smoothstep(uThresh, uThresh + 0.25, l);
        if (isnan(w) || isinf(w)) w = 0.0;
        gl_FragColor = vec4(c.rgb * w, 1.0);
      }`, { tSrc: { value: null }, uThresh: { value: threshold } });
    this.blur = mk(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        vec3 acc = texture2D(tSrc, vUv).rgb * 0.227;
        acc += (texture2D(tSrc, vUv + uDir * 1.384).rgb +
                texture2D(tSrc, vUv - uDir * 1.384).rgb) * 0.316;
        acc += (texture2D(tSrc, vUv + uDir * 3.230).rgb +
                texture2D(tSrc, vUv - uDir * 3.230).rgb) * 0.070;
        gl_FragColor = vec4(acc, 1.0);
      }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.radius = radius;
    this.composite = mk(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uStrength;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tSrc, vUv);
        gl_FragColor = vec4(base.rgb + texture2D(tBloom, vUv).rgb * uStrength,
                            base.a);
      }`, { tSrc: { value: null }, tBloom: { value: this.rtA.texture },
            uStrength: { value: strength } });
    this.needsSwap = true;
  }
  setSize(w, h) {
    this.rtA.setSize(Math.floor(w / 4), Math.floor(h / 4));
    this.rtB.setSize(Math.floor(w / 4), Math.floor(h / 4));
    this.texel = new THREE.Vector2(4 / w, 4 / h);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.bright.material.uniforms.tSrc.value = readBuffer.texture;
    renderer.setRenderTarget(this.rtA);
    this.bright.render(renderer);
    for (let i = 0; i < 2; i++) {
      const spread = this.radius * (i + 1);
      this.blur.material.uniforms.tSrc.value = this.rtA.texture;
      this.blur.material.uniforms.uDir.value.set(this.texel.x * spread, 0);
      renderer.setRenderTarget(this.rtB);
      this.blur.render(renderer);
      this.blur.material.uniforms.tSrc.value = this.rtB.texture;
      this.blur.material.uniforms.uDir.value.set(0, this.texel.y * spread);
      renderer.setRenderTarget(this.rtA);
      this.blur.render(renderer);
    }
    this.composite.material.uniforms.tSrc.value = readBuffer.texture;
    renderer.setRenderTarget(writeBuffer);
    this.composite.render(renderer);
  }
  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.12 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette, uTime;
    varying vec2 vUv;
    float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // S-curve contrast + saturation.
      vec3 col = c.rgb;
      col = col * col * (3.0 - 2.0 * col) * 0.5 + col * 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.12);
      // Vignette.
      float v = smoothstep(1.25, 0.45, length(vUv - 0.5) * 2.0);
      col *= mix(1.0, v, uVignette);
      // Faint film grain.
      col += (gHash(vUv * 1731.0 + uTime) - 0.5) * 0.002;
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function makeComposer(renderer, scene, camera, sunDir) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: new URLSearchParams(location.search).has('nomsaa') ? 0 : 2,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const godrays = new GodRaysPass(camera, sunDir);
  composer.addPass(godrays);
  composer.addPass(new BloomPass(0.12, 1.4, 0.6));
  // Grade bounded display colours: the polynomial is invalid for HDR values.
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return { composer, grade, godrays };
}
