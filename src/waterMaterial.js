import * as THREE from "three";

export function makeAnimatedWaterMaterial() {
  const uniforms = {
    uTime:   { value: 0 },
    uColorDeep:  { value: new THREE.Color(0x08304a) },
    uColorShallow:{ value: new THREE.Color(0x1e7bb3) },

    uWaveAmp:   { value: 0.6 },
    uWaveFreq:  { value: 0.08 },
    uWaveSpeed: { value: 0.8 },

    uRipScale:  { value: 0.18 },
    uRipSpeed:  { value: 0.35 },
  };

  const vertexShader = `
    uniform float uTime;
    uniform float uWaveAmp;
    uniform float uWaveFreq;
    uniform float uWaveSpeed;

    varying vec3 vWorldPos;
    varying float vWave;

    float wave2(vec2 p, float t) {
      float w1 = sin(p.x * uWaveFreq + t);
      float w2 = sin(p.y * uWaveFreq * 1.3 + t * 1.2);
      float w3 = sin((p.x + p.y) * uWaveFreq * 0.7 + t * 0.8);
      return (w1 + w2 + w3) / 3.0;
    }

    void main() {
      vec4 localPos = vec4(position, 1.0);

      vec4 worldPos;

      #ifdef USE_INSTANCING
        worldPos = modelMatrix * instanceMatrix * localPos;
      #else
        worldPos = modelMatrix * localPos;
      #endif

      float t = uTime * uWaveSpeed;

      float w = wave2(worldPos.xz, t);

      worldPos.y += w * uWaveAmp;

      vWorldPos = worldPos.xyz;
      vWave = w;

      vec4 mvPos = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;

    uniform float uRipScale;
    uniform float uRipSpeed;

    varying vec3 vWorldPos;
    varying float vWave;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      float t = uTime * uRipSpeed;
      vec2 p = vWorldPos.xz * uRipScale;

      float n1 = noise(p + vec2(t, t * 0.7));
      float n2 = noise(p * 1.8 - vec2(t * 0.4, t));
      float n = 0.6 * n1 + 0.4 * n2;

      float ripples = smoothstep(0.55, 0.75, n);

      float depthMix = clamp(0.5 + 0.5 * vWave, 0.0, 1.0);
      vec3 baseCol = mix(uColorDeep, uColorShallow, depthMix);

      vec3 col = baseCol + ripples * vec3(0.10, 0.14, 0.16);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    fog: false,
  });

  mat.defines = mat.defines || {};
  mat.defines.USE_INSTANCING = "";

  return mat;
}
