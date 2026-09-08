// SpecterOrb — a ghostly raymarched orb wrapped in drifting smoke.
//
// Open-source recreation of the React Bits Pro "Specter Orb" (which is behind
// a paid license). Same prop API: raymarched FBM-displaced sphere with key /
// fill / wrap lighting, two opposing rim lights, dual specular highlights, a
// volumetric smoke halo, a circular mask, cursor-reactive lighting and
// adaptive quality.
import { Mesh, Program, Renderer, Triangle, Vec2, Vec3 } from 'ogl';
import { useEffect, useRef, type ReactNode } from 'react';

export interface SpecterOrbProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  /** Content stacked above the orb. */
  children?: ReactNode;
  /** Radius of the smooth core before displacement. Default 0.35. */
  radius?: number;
  /** How far the noise pushes the surface outward. Default 0.3. */
  turbulence?: number;
  /** Frequency of the displacement field. Default 1. */
  noiseScale?: number;
  /** Speed the field drifts through the orb. Default 0.3. */
  flowSpeed?: number;
  /** Octaves baked into the displacement field. Default 3. */
  octaves?: number;
  /** Amplitude falloff between octaves. Default 0.5. */
  roughness?: number;
  /** Frequency gain between octaves. Default 2. */
  lacunarity?: number;
  /** Maximum ray march iterations. Default 32. */
  steps?: number;
  /** Fraction of each distance estimate to advance. Default 1. */
  stride?: number;
  /** Scales the orb inside the frame. Default 1. */
  zoom?: number;
  /** Radius of the circular cutout. Default 1. */
  maskRadius?: number;
  /** Softness of the circular cutout. Default 0.02. */
  maskFeather?: number;
  /** Key light color. Default "#4da6ff". */
  colorA?: string;
  /** Fill light color. Default "#9959ff". */
  colorB?: string;
  /** Ambient wrap color. Default "#6680ff". */
  colorC?: string;
  /** Strength of the two opposing rim lights. Default 0.75. */
  rimStrength?: number;
  /** Tightness of the rim falloff. Default 3. */
  rimPower?: number;
  /** Color of the primary highlight. Default "#669fff". */
  specularColorA?: string;
  /** Color of the secondary highlight. Default "#998fff". */
  specularColorB?: string;
  /** Strength of both highlights. Default 1. */
  specularStrength?: number;
  /** Tightness of the highlights. Default 12. */
  specularSharpness?: number;
  /** Strength of the halo around the silhouette. Default 1. */
  glowStrength?: number;
  /** Tightness of the halo falloff. Default 32. */
  glowFalloff?: number;
  /** Contrast curve applied at the end. Default 1.25. */
  gamma?: number;
  /** Overall gain. Default 1. */
  brightness?: number;
  /** Master alpha of the canvas. Default 1. */
  opacity?: number;
  /** Fill behind the orb. Accepts "transparent". Default "#0a0a0a". */
  backgroundColor?: string;
  /** Let the pointer swing the lighting. Default true. */
  cursorInteraction?: boolean;
  /** How far the pointer swings the lighting. Default 0.35. */
  cursorLight?: number;
  /** Drop resolution when the frame rate falls short. Default true. */
  adaptiveQuality?: boolean;
  /** Frame rate the adaptive pass aims for. Default 60. */
  targetFps?: number;
  /** Upper bound on device pixel ratio. Default 2. */
  dpr?: number;
  /** Hold the animation still. Default false. */
  paused?: boolean;
}

export default function SpecterOrb({
  width = '100%',
  height = '100%',
  className,
  children,
  radius = 0.35,
  turbulence = 0.3,
  noiseScale = 1,
  flowSpeed = 0.3,
  octaves = 3,
  roughness = 0.5,
  lacunarity = 2,
  steps = 32,
  stride = 1,
  zoom = 1,
  maskRadius = 1,
  maskFeather = 0.02,
  colorA = '#4da6ff',
  colorB = '#9959ff',
  colorC = '#6680ff',
  rimStrength = 0.75,
  rimPower = 3,
  specularColorA = '#669fff',
  specularColorB = '#998fff',
  specularStrength = 1,
  specularSharpness = 12,
  glowStrength = 1,
  glowFalloff = 32,
  gamma = 1.25,
  brightness = 1,
  opacity = 1,
  backgroundColor = '#0a0a0a',
  cursorInteraction = true,
  cursorLight = 0.35,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 2,
  paused = false,
}: SpecterOrbProps) {
  const ctnDom = useRef<HTMLDivElement>(null);

  // Live-reactivity: the WebGL effect is created once, so the render loop reads
  // the latest props through this ref instead of the initial closure.
  const latest = useRef({
    radius, turbulence, noiseScale, flowSpeed, octaves, roughness, lacunarity,
    steps, stride, zoom, maskRadius, maskFeather,
    colorA, colorB, colorC, rimStrength, rimPower,
    specularColorA, specularColorB, specularStrength, specularSharpness,
    glowStrength, glowFalloff, cursorLight, gamma, brightness, opacity,
    backgroundColor, cursorInteraction, adaptiveQuality, targetFps, dpr, paused,
  });
  latest.current = {
    radius, turbulence, noiseScale, flowSpeed, octaves, roughness, lacunarity,
    steps, stride, zoom, maskRadius, maskFeather,
    colorA, colorB, colorC, rimStrength, rimPower,
    specularColorA, specularColorB, specularStrength, specularSharpness,
    glowStrength, glowFalloff, cursorLight, gamma, brightness, opacity,
    backgroundColor, cursorInteraction, adaptiveQuality, targetFps, dpr, paused,
  };

  const vert = /* glsl */ `
    precision highp float;
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const frag = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform float uRadius;
    uniform float uTurbulence;
    uniform float uNoiseScale;
    uniform float uFlowSpeed;
    uniform float uOctaves;
    uniform float uRoughness;
    uniform float uLacunarity;
    uniform float uSteps;
    uniform float uStride;
    uniform float uZoom;
    uniform float uMaskRadius;
    uniform float uMaskFeather;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    uniform float uRimStrength;
    uniform float uRimPower;
    uniform vec3 uSpecA;
    uniform vec3 uSpecB;
    uniform float uSpecStrength;
    uniform float uSpecSharpness;
    uniform float uGlowStrength;
    uniform float uGlowFalloff;
    uniform float uCursorLight;
    uniform float uGamma;
    uniform float uBrightness;
    uniform float uOpacity;
    uniform vec3 uBgColor;
    uniform float uBgOpaque;
    varying vec2 vUv;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    float fbm(vec3 p) {
      float amp = 0.5;
      float freq = 1.0;
      float sum = 0.0;
      float norm = 0.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= uOctaves) break;
        sum += amp * snoise(p * freq);
        norm += amp;
        amp *= uRoughness;
        freq *= uLacunarity;
      }
      return sum / max(norm, 0.001);
    }

    float map(vec3 p) {
      float n = fbm(p * uNoiseScale + vec3(uTime * uFlowSpeed * 0.5));
      float r = uRadius + uTurbulence * (n * 0.5 + 0.5);
      return length(p) - r;
    }

    vec3 calcNormal(vec3 p) {
      const float e = 0.0012;
      vec2 k = vec2(1.0, -1.0);
      return normalize(
        k.xyy * map(p + k.xyy * e) +
        k.yyx * map(p + k.yyx * e) +
        k.yxy * map(p + k.yxy * e) +
        k.xxx * map(p + k.xxx * e)
      );
    }

    void main() {
      vec2 uv = (vUv * 2.0 - 1.0);
      uv.x *= uResolution.x / uResolution.y;
      uv *= uZoom;

      vec3 ro = vec3(0.0, 0.0, 3.2);
      vec3 rd = normalize(vec3(uv, -2.0));

      // Slow orbit drift — makes the smoke feel alive.
      float ang = uTime * 0.08 * uFlowSpeed;
      float ca = cos(ang);
      float sa = sin(ang);
      rd.xz = mat2(ca, -sa, sa, ca) * rd.xz;

      // Cursor swings the view.
      vec2 m = uMouse;
      float tiltX = m.y * uCursorLight * 0.18;
      float tiltY = m.x * uCursorLight * 0.18;
      float cx = cos(tiltX);
      float sx = sin(tiltX);
      float cy = cos(tiltY);
      float sy = sin(tiltY);
      rd.yz = mat2(cx, -sx, sx, cx) * rd.yz;
      rd.xz = mat2(cy, -sy, sy, cy) * rd.xz;

      // Ray march the displaced sphere.
      float t = 0.0;
      float tHit = -1.0;
      float minD = 1e9;
      for (int i = 0; i < 64; i++) {
        if (float(i) >= uSteps) break;
        vec3 p = ro + rd * t;
        float d = map(p);
        minD = min(minD, d);
        if (d < 0.0012) {
          tHit = t;
          break;
        }
        t += d * uStride;
        if (t > 6.0) break;
      }

      vec3 col = vec3(0.0);
      float alpha = 0.0;

      if (tHit > -0.5) {
        vec3 p = ro + rd * tHit;
        vec3 n = calcNormal(p);
        vec3 vdir = -rd;

        vec3 keyDir = normalize(vec3(0.55 + m.x * 0.55, 0.75 + m.y * 0.55, 0.5));
        vec3 fillDir = normalize(vec3(-0.75, 0.25 + m.y * 0.3, 0.45));
        vec3 wrapDir = normalize(vec3(0.0, 1.0, 0.35));

        float key = max(dot(n, keyDir), 0.0);
        float fill = max(dot(n, fillDir), 0.0) * 0.5;
        float wrap = 0.55 + 0.45 * (0.5 + 0.5 * dot(n, wrapDir));

        vec3 base = uColorA * key + uColorB * fill + uColorC * wrap;

        // Two opposing rim lights.
        float fres = pow(1.0 - max(dot(n, vdir), 0.0), uRimPower);
        vec3 rimCol = mix(uColorA, uColorB, 0.5) * fres * uRimStrength;
        vec3 backDir = normalize(vec3(-keyDir.x, -keyDir.y * 0.7, -0.55));
        float rim2 = pow(max(dot(n, backDir), 0.0), uRimPower * 1.4);
        rimCol += uColorB * rim2 * uRimStrength * 0.7;

        // Dual specular highlights.
        vec3 h = normalize(keyDir + vdir);
        float spec = pow(max(dot(n, h), 0.0), uSpecSharpness);
        vec3 specCol = mix(uSpecA, uSpecB, clamp(spec * 0.5 + 0.5, 0.0, 1.0)) * spec * uSpecStrength;

        col = base + rimCol + specCol;
        alpha = 1.0;

        // Wispy smoke drifting in front of the surface.
        float smoke = 0.0;
        for (int i = 0; i < 10; i++) {
          float st = tHit - (float(i) + 0.5) * 0.12;
          if (st < 0.0) break;
          float d = map(ro + rd * st);
          smoke += exp(-d * 9.0) * 0.16;
        }
        col += mix(uColorA, uColorB, 0.5) * smoke * uGlowStrength * 0.35;
      } else {
        // Missed: volumetric halo of drifting smoke around the silhouette.
        float smoke = 0.0;
        for (int i = 0; i < 16; i++) {
          float st = 0.6 + float(i) * 0.32;
          if (st > 6.0) break;
          float d = map(ro + rd * st);
          smoke += exp(-d * 5.0) * 0.1;
        }
        float halo = exp(-minD * uGlowFalloff * 0.35);
        vec3 smokeCol = mix(uColorA, uColorB, 0.55);
        float glow = clamp(smoke * uGlowStrength + halo * uGlowStrength, 0.0, 1.0);
        col = smokeCol * glow;
        alpha = glow;
      }

      // Circular mask cutout.
      float dMask = length(uv) - uMaskRadius;
      float mask = 1.0 - smoothstep(0.0, max(uMaskFeather, 0.0001), dMask);
      alpha *= mask;

      // Tone map.
      col *= uBrightness;
      col = pow(max(col, 0.0), vec3(1.0 / max(uGamma, 0.001)));
      col *= uOpacity;

      vec3 outCol = mix(uBgColor, col, alpha);
      float outA = mix(alpha, 1.0, uBgOpaque);
      gl_FragColor = vec4(outCol, outA);
    }
  `;

  useEffect(() => {
    const container = ctnDom.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vert,
      fragment: frag,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2(1, 1) },
        uMouse: { value: new Vec2(0, 0) },
        uRadius: { value: radius },
        uTurbulence: { value: turbulence },
        uNoiseScale: { value: noiseScale },
        uFlowSpeed: { value: flowSpeed },
        uOctaves: { value: octaves },
        uRoughness: { value: roughness },
        uLacunarity: { value: lacunarity },
        uSteps: { value: steps },
        uStride: { value: stride },
        uZoom: { value: zoom },
        uMaskRadius: { value: maskRadius },
        uMaskFeather: { value: maskFeather },
        uColorA: { value: hexToVec3(colorA) },
        uColorB: { value: hexToVec3(colorB) },
        uColorC: { value: hexToVec3(colorC) },
        uRimStrength: { value: rimStrength },
        uRimPower: { value: rimPower },
        uSpecA: { value: hexToVec3(specularColorA) },
        uSpecB: { value: hexToVec3(specularColorB) },
        uSpecStrength: { value: specularStrength },
        uSpecSharpness: { value: specularSharpness },
        uGlowStrength: { value: glowStrength },
        uGlowFalloff: { value: glowFalloff },
        uCursorLight: { value: cursorLight },
        uGamma: { value: gamma },
        uBrightness: { value: brightness },
        uOpacity: { value: opacity },
        uBgColor: { value: hexToVec3(backgroundColor === 'transparent' ? '#000000' : backgroundColor) },
        uBgOpaque: { value: backgroundColor === 'transparent' ? 0 : 1 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const U = program.uniforms;
    let currentScale = 1;
    const dprCap = Math.min(window.devicePixelRatio || 1, Math.max(1, latest.current.dpr));

    function resize() {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const iw = Math.max(1, Math.round(w * currentScale * dprCap));
      const ih = Math.max(1, Math.round(h * currentScale * dprCap));
      renderer.setSize(iw, ih);
      gl.canvas.style.width = w + 'px';
      gl.canvas.style.height = h + 'px';
      U.uResolution.value.set(iw, ih);
    }
    window.addEventListener('resize', resize);
    resize();

    const mouseTarget = { x: 0, y: 0 };
    const mouse = { x: 0, y: 0 };

    const onPointerMove = (e: PointerEvent) => {
      if (!latest.current.cursorInteraction) return;
      const rect = container.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      mouseTarget.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseTarget.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    const onPointerLeave = () => {
      mouseTarget.x = 0;
      mouseTarget.y = 0;
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);

    let rafId = 0;
    let last = performance.now();
    let slowFrames = 0;
    let fastFrames = 0;

    const update = (now: number) => {
      rafId = requestAnimationFrame(update);
      const dt = Math.min(now - last, 100);
      last = now;

      if (!latest.current.paused) U.uTime.value += dt * 0.001;

      mouse.x += (mouseTarget.x - mouse.x) * 0.12;
      mouse.y += (mouseTarget.y - mouse.y) * 0.12;
      U.uMouse.value.set(mouse.x, mouse.y);

      // Push current props into the uniforms each frame.
      const P = latest.current;
      U.uRadius.value = P.radius;
      U.uTurbulence.value = P.turbulence;
      U.uNoiseScale.value = P.noiseScale;
      U.uFlowSpeed.value = P.flowSpeed;
      U.uOctaves.value = P.octaves;
      U.uRoughness.value = P.roughness;
      U.uLacunarity.value = P.lacunarity;
      U.uSteps.value = P.steps;
      U.uStride.value = P.stride;
      U.uZoom.value = P.zoom;
      U.uMaskRadius.value = P.maskRadius;
      U.uMaskFeather.value = P.maskFeather;
      U.uColorA.value = hexToVec3(P.colorA);
      U.uColorB.value = hexToVec3(P.colorB);
      U.uColorC.value = hexToVec3(P.colorC);
      U.uRimStrength.value = P.rimStrength;
      U.uRimPower.value = P.rimPower;
      U.uSpecA.value = hexToVec3(P.specularColorA);
      U.uSpecB.value = hexToVec3(P.specularColorB);
      U.uSpecStrength.value = P.specularStrength;
      U.uSpecSharpness.value = P.specularSharpness;
      U.uGlowStrength.value = P.glowStrength;
      U.uGlowFalloff.value = P.glowFalloff;
      U.uCursorLight.value = P.cursorLight;
      U.uGamma.value = P.gamma;
      U.uBrightness.value = P.brightness;
      U.uOpacity.value = P.opacity;
      U.uBgColor.value = hexToVec3(P.backgroundColor === 'transparent' ? '#000000' : P.backgroundColor);
      U.uBgOpaque.value = P.backgroundColor === 'transparent' ? 0 : 1;

      // Adaptive quality: drop internal resolution when we're behind, raise it back when fast.
      if (P.adaptiveQuality) {
        const frameBudget = 1000 / Math.max(1, P.targetFps);
        if (dt > frameBudget + 5) {
          slowFrames++;
          fastFrames = 0;
          if (slowFrames >= 6 && currentScale > 0.5) {
            currentScale = Math.max(0.5, Math.round((currentScale - 0.1) * 10) / 10);
            resize();
            slowFrames = 0;
          }
        } else if (dt < frameBudget - 8 && currentScale < 1) {
          fastFrames++;
          slowFrames = 0;
          if (fastFrames >= 30) {
            currentScale = Math.min(1, Math.round((currentScale + 0.1) * 10) / 10);
            resize();
            fastFrames = 0;
          }
        } else {
          slowFrames = 0;
          fastFrames = 0;
        }
      }

      renderer.render({ scene: mesh });
    };
    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ctnDom}
      className={className}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        position: 'relative',
      }}
    >
      {children ? (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>{children}</div>
      ) : null}
    </div>
  );
}

function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return new Vec3(r, g, b);
}

function hexToVec3(color: string) {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    return new Vec3(r, g, b);
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return new Vec3(parseInt(rgbMatch[1]) / 255, parseInt(rgbMatch[2]) / 255, parseInt(rgbMatch[3]) / 255);
  }
  const hslMatch = color.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]) / 360;
    const s = parseInt(hslMatch[2]) / 100;
    const l = parseInt(hslMatch[3]) / 100;
    return hslToRgb(h, s, l);
  }
  return new Vec3(0, 0, 0);
}
