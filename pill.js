import * as THREE from "three";

/**
 * Pill — the 280×52px liquid-glass capsule that bonds to the Claude window edge.
 * Uses Three.js with a custom fragment shader for refraction + blur illusion.
 */
export class Pill {
  constructor(root) {
    this._state = "idle";
    this._connected = false;

    // Canvas fills the overlay window
    this._canvas = document.createElement("canvas");
    this._canvas.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 26px;
    `;
    root.appendChild(this._canvas);

    this._initThree();
    this._buildShader();
    this._animate();
  }

  _initThree() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this._renderer.setSize(w, h, false);
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setClearColor(0x000000, 0);

    this._scene = new THREE.Scene();
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._clock = new THREE.Clock();
  }

  _buildShader() {
    // Full-screen quad
    const geo = new THREE.PlaneGeometry(2, 2);

    this._uniforms = {
      uTime:       { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uState:      { value: 0 },   // 0=idle 1=thinking 2=streaming 3=code 4=error 5=done
      uConnected:  { value: 0.0 },
      uPulse:      { value: 0.0 }, // driven by oscilloscope pulse
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: PILL_FRAG,
    });

    this._mesh = new THREE.Mesh(geo, mat);
    this._scene.add(this._mesh);
  }

  _stateToInt(s) {
    return { idle: 0, thinking: 1, streaming_text: 2, streaming_code: 3,
             error: 4, done: 5 }[s] ?? 0;
  }

  setState(s) {
    this._state = s;
    this._uniforms.uState.value = this._stateToInt(s);
  }

  setConnected(v) {
    this._connected = v;
    this._uniforms.uConnected.value = v ? 1.0 : 0.0;
  }

  /** Called by oscilloscope on each token chunk */
  pulse(intensity = 1.0) {
    this._uniforms.uPulse.value = intensity;
  }

  show() { this._canvas.style.display = "block"; }
  hide() { this._canvas.style.display = "none"; }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();
    this._uniforms.uTime.value = t;
    // Decay pulse
    this._uniforms.uPulse.value *= 0.88;
    this._renderer.render(this._scene, this._camera);
  }
}

// ── Liquid glass fragment shader ─────────────────────────────────────────────
const PILL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform int   uState;
uniform float uConnected;
uniform float uPulse;

// SDF for a rounded rectangle (pill)
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Smooth noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y
  );
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

  // Centre coords in [-1,1]
  vec2 p = (uv - 0.5) * 2.0 * aspect;

  // Pill SDF — matches 280×52 window
  float radius = 0.85;
  vec2 halfSize = vec2(aspect.x * 0.88, 0.72);
  float d = sdRoundedBox(p, halfSize, radius);

  // Outside pill = fully transparent
  if (d > 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // ── Glass base ──────────────────────────────────────────────────────────
  // Simulated refraction: distort UV by normals at pill edge
  float edge = smoothstep(0.0, -0.12, d);
  vec2 normal = normalize(p); // approximate normal
  float ior = 0.04;
  vec2 refracted = uv + normal * ior * (1.0 - edge);

  // Fake background sample using noise (real backdrop not accessible from overlay)
  float n = noise(refracted * 6.0 + uTime * 0.3);
  float n2 = noise(refracted * 12.0 - uTime * 0.2);

  // ── State colours ────────────────────────────────────────────────────────
  vec3 col;
  float s = float(uState);

  if (uState == 0) {
    // idle — cool silver/lavender
    col = mix(vec3(0.55, 0.55, 0.65), vec3(0.75, 0.75, 0.85), n);
  } else if (uState == 1) {
    // thinking — slow blue pulse
    float pulse = 0.5 + 0.5 * sin(uTime * 1.8);
    col = mix(vec3(0.2, 0.4, 0.9), vec3(0.5, 0.7, 1.0), n * pulse);
  } else if (uState == 2) {
    // streaming text — warm teal river
    col = mix(vec3(0.1, 0.7, 0.6), vec3(0.3, 0.9, 0.8), n2 + uPulse * 0.4);
  } else if (uState == 3) {
    // streaming code — amber-orange
    col = mix(vec3(0.9, 0.5, 0.1), vec3(1.0, 0.75, 0.2), n + uPulse * 0.5);
  } else if (uState == 4) {
    // error — red glitch: sharp noise
    float glitch = step(0.5, noise(uv * 40.0 + uTime * 20.0));
    col = mix(vec3(0.8, 0.1, 0.1), vec3(1.0, 0.3, 0.3), glitch);
  } else {
    // done — celebratory gold shimmer
    float shimmer = 0.5 + 0.5 * sin(uTime * 4.0 + p.x * 8.0);
    col = mix(vec3(0.9, 0.7, 0.1), vec3(1.0, 0.95, 0.4), shimmer);
  }

  // ── Glass layers ─────────────────────────────────────────────────────────
  // Specular highlight — top-left rim
  vec2 lightDir = normalize(vec2(-0.6, -0.8));
  float spec = pow(max(0.0, dot(normalize(p - vec2(-1.0, 0.8)), lightDir)), 12.0);
  spec *= smoothstep(-0.05, -0.15, d); // only on edge

  // Inner glow — slightly lighter centre
  float innerGlow = smoothstep(0.0, -0.4, d) * 0.15;

  // Pulse ring — EKG ripple from last token chunk
  float ring = smoothstep(0.02, 0.0, abs(d + uPulse * 0.25)) * uPulse;

  // Frosted glass base: semi-transparent
  float alpha = smoothstep(0.01, -0.01, d);
  alpha *= 0.72 + innerGlow;

  col += spec * 0.6;
  col += ring * vec3(1.0, 1.0, 1.0) * 0.5;
  col = clamp(col, 0.0, 1.0);

  // Desaturate when disconnected
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(grey), 1.0 - uConnected);

  gl_FragColor = vec4(col * alpha, alpha);
}
`;
