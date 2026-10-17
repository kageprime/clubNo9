// Retro 3D Pixel-Art Post-Processor (Offscreen RenderTarget + Ordered 4x4 Bayer Dithering & Nearest-Neighbor Upscaling).
import * as THREE from 'three';

const PIXEL_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PIXEL_FRAGMENT = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uDitherStrength;
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
  quadScene: THREE.Scene;
  quadCam: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  pixelDivisor = 1.0; // 1.0 = Native full-resolution crisp PBR, 2.5 = pixelated retro

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

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(640, 360) },
        uDitherStrength: { value: 0.55 },
      },
      vertexShader: PIXEL_VERTEX,
      fragmentShader: PIXEL_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quadScene.add(quad);
  }

  setSize(width: number, height: number, divisor = this.pixelDivisor): void {
    this.pixelDivisor = divisor;
    const pw = Math.max(240, Math.floor(width / divisor));
    const ph = Math.max(135, Math.floor(height / divisor));
    this.target.setSize(pw, ph);
    this.material.uniforms.uResolution.value.set(pw, ph);
    this.material.uniforms.uDitherStrength.value = divisor <= 1.2 ? 0.1 : 0.55;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, bypass = false): void {
    if (bypass || this.pixelDivisor <= 1.05) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
