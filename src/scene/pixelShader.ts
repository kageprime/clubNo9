// Retro 3D Pixel-Art Post-Processor (Offscreen RenderTarget + Selective Neon Bloom + Ordered 4x4 Bayer Dithering & Upscaling).
import * as THREE from 'three';

const PIXEL_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Extract high-luminance / glowing emissive neon pixels
const BLOOM_EXTRACT_FRAGMENT = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;

  void main() {
    vec4 col = texture2D(tDiffuse, vUv);
    // Relative luminance calculation
    float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    if (lum > uThreshold) {
      // Soft knee extraction
      float factor = clamp((lum - uThreshold) / (1.0 - uThreshold), 0.0, 1.0);
      gl_FragColor = vec4(col.rgb * factor, 1.0);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
  }
`;

// Separable 5-tap Gaussian blur
const BLOOM_BLUR_FRAGMENT = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    vec2 step = uDirection / uResolution;
    vec4 sum = vec4(0.0);
    sum += texture2D(tDiffuse, vUv - 2.0 * step) * 0.06136;
    sum += texture2D(tDiffuse, vUv - 1.0 * step) * 0.24477;
    sum += texture2D(tDiffuse, vUv) * 0.38774;
    sum += texture2D(tDiffuse, vUv + 1.0 * step) * 0.24477;
    sum += texture2D(tDiffuse, vUv + 2.0 * step) * 0.06136;
    gl_FragColor = sum;
  }
`;

const PIXEL_FRAGMENT = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform vec2 uResolution;
  uniform float uDitherStrength;
  uniform float uBloomStrength;
  uniform float uBloomEnabled;
  varying vec2 vUv;

  // 4x4 Bayer ordered dithering matrix
  float bayer4x4(vec2 pos) {
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));
    int index = x + y * 4;
    float m = 0.0;
    if (index == 0) m = 0.0;
    else if (index == 1) m = 8.0;
    else if (index == 2) m = 2.0;
    else if (index == 3) m = 10.0;
    else if (index == 4) m = 12.0;
    else if (index == 5) m = 4.0;
    else if (index == 6) m = 14.0;
    else if (index == 7) m = 6.0;
    else if (index == 8) m = 3.0;
    else if (index == 9) m = 11.0;
    else if (index == 10) m = 1.0;
    else if (index == 11) m = 9.0;
    else if (index == 12) m = 15.0;
    else if (index == 13) m = 7.0;
    else if (index == 14) m = 13.0;
    else m = 5.0;
    return (m / 16.0) - 0.5;
  }

  void main() {
    vec2 pixelCoord = floor(vUv * uResolution);
    vec2 snappedUv = (pixelCoord + 0.5) / uResolution;
    vec4 texel = texture2D(tDiffuse, snappedUv);

    // Composite selective warm neon bloom before dithering
    if (uBloomEnabled > 0.5) {
      vec4 bloom = texture2D(tBloom, vUv);
      texel.rgb += bloom.rgb * (uBloomStrength * 0.42);
    }

    // Subtle 90s pixel-art ordered dithering & color quantization (48 levels per channel)
    float dither = bayer4x4(pixelCoord) * uDitherStrength;
    vec3 col = texel.rgb + vec3(dither / 48.0);
    col = floor(col * 48.0 + 0.5) / 48.0;

    // Gentle warm CRT vignette
    vec2 d = vUv - 0.5;
    float vig = 1.0 - dot(d, d) * 0.22;
    gl_FragColor = vec4(col * vig, 1.0);
  }
`;

export class PixelPostProcessor {
  renderer: THREE.WebGLRenderer;
  target: THREE.WebGLRenderTarget;
  bloomTargetA: THREE.WebGLRenderTarget;
  bloomTargetB: THREE.WebGLRenderTarget;
  quadScene: THREE.Scene;
  quadCam: THREE.OrthographicCamera;
  quadMesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  bloomExtractMaterial: THREE.ShaderMaterial;
  bloomBlurMaterial: THREE.ShaderMaterial;
  pixelDivisor = 1.0; // 1.0 = Native full-resolution crisp PBR, 2.5 = pixelated retro
  bloomEnabled = true;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(640, 360, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    // Bloom targets at half resolution for smooth glowing blur
    this.bloomTargetA = new THREE.WebGLRenderTarget(320, 180, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    this.bloomTargetB = new THREE.WebGLRenderTarget(320, 180, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.bloomExtractMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uThreshold: { value: 0.76 },
      },
      vertexShader: PIXEL_VERTEX,
      fragmentShader: BLOOM_EXTRACT_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    });

    this.bloomBlurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.bloomTargetA.texture },
        uResolution: { value: new THREE.Vector2(320, 180) },
        uDirection: { value: new THREE.Vector2(1.0, 0.0) },
      },
      vertexShader: PIXEL_VERTEX,
      fragmentShader: BLOOM_BLUR_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        tBloom: { value: this.bloomTargetA.texture },
        uResolution: { value: new THREE.Vector2(640, 360) },
        uDitherStrength: { value: 0.55 },
        uBloomStrength: { value: 0.85 },
        uBloomEnabled: { value: 1.0 },
      },
      vertexShader: PIXEL_VERTEX,
      fragmentShader: PIXEL_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    });

    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quadScene.add(this.quadMesh);
  }

  setBloom(enabled: boolean): void {
    this.bloomEnabled = enabled;
    this.material.uniforms.uBloomEnabled.value = enabled ? 1.0 : 0.0;
  }

  setSize(width: number, height: number, divisor = this.pixelDivisor): void {
    this.pixelDivisor = divisor;
    const pw = Math.max(240, Math.floor(width / divisor));
    const ph = Math.max(135, Math.floor(height / divisor));
    this.target.setSize(pw, ph);
    this.material.uniforms.uResolution.value.set(pw, ph);
    this.material.uniforms.uDitherStrength.value = divisor <= 1.2 ? 0.08 : 0.55;

    const bw = Math.max(160, Math.floor(pw * 0.5));
    const bh = Math.max(90, Math.floor(ph * 0.5));
    this.bloomTargetA.setSize(bw, bh);
    this.bloomTargetB.setSize(bw, bh);
    this.bloomBlurMaterial.uniforms.uResolution.value.set(bw, bh);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, bypass = false): void {
    if (bypass || (this.pixelDivisor <= 1.05 && !this.bloomEnabled)) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    // 1. Render primary 3D scene to offscreen target
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);

    // 2. Selective Neon Bloom pass (if enabled)
    if (this.bloomEnabled) {
      // 2a. High-luminance threshold extraction -> bloomTargetA
      this.quadMesh.material = this.bloomExtractMaterial;
      this.bloomExtractMaterial.uniforms.tDiffuse.value = this.target.texture;
      this.renderer.setRenderTarget(this.bloomTargetA);
      this.renderer.render(this.quadScene, this.quadCam);

      // 2b. Horizontal blur -> bloomTargetB
      this.quadMesh.material = this.bloomBlurMaterial;
      this.bloomBlurMaterial.uniforms.tDiffuse.value = this.bloomTargetA.texture;
      this.bloomBlurMaterial.uniforms.uDirection.value.set(1.5, 0.0);
      this.renderer.setRenderTarget(this.bloomTargetB);
      this.renderer.render(this.quadScene, this.quadCam);

      // 2c. Vertical blur -> bloomTargetA
      this.bloomBlurMaterial.uniforms.tDiffuse.value = this.bloomTargetB.texture;
      this.bloomBlurMaterial.uniforms.uDirection.value.set(0.0, 1.5);
      this.renderer.setRenderTarget(this.bloomTargetA);
      this.renderer.render(this.quadScene, this.quadCam);
    }

    // 3. Final composite pass to screen canvas
    this.quadMesh.material = this.material;
    this.material.uniforms.tDiffuse.value = this.target.texture;
    this.material.uniforms.tBloom.value = this.bloomTargetA.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.target.dispose();
    this.bloomTargetA.dispose();
    this.bloomTargetB.dispose();
    this.bloomExtractMaterial.dispose();
    this.bloomBlurMaterial.dispose();
    this.material.dispose();
  }
}
