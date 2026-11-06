// The town's teleport gate: a stepped stone dais with four carved obelisks, a low back wall bearing
// the town crest (a tower inside a ring), and a swirling blue sphere of light floating over a
// glowing rune ring. The stonework is a modelled asset (art/gate/gate.blend, exported to
// public/models/teleport_gate.glb); the orb, rune ring and sparks are shaders here.
// Original design; front faces +Z.
import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const GATE_MODEL = '/models/teleport_gate.glb';

const NOISE = `
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

function sphereMaterial(time: { value: number }, core: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // The shell is a solid-looking glowing orb; the inner core adds light on top.
    blending: core ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: core ? THREE.BackSide : THREE.FrontSide,
    uniforms: { time },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float time; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        // Twist the noise around the vertical axis so the light swirls and climbs.
        float ang = time * 0.55 + vP.y * 1.3;
        float c = cos(ang), s = sin(ang);
        vec3 p = vec3(c * vP.x - s * vP.z, vP.y, s * vP.x + c * vP.z) * 1.6;
        float n = fbm(p + vec3(0.0, -time * 0.35, 0.0));
        float swirl = fbm(p * 1.7 + n * 2.2 + vec3(time * 0.12));
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float fres = pow(1.0 - facing, 2.4);
        // Deep electric blue at the edge, a bright cyan-white heart, swirling light streaks.
        vec3 deep = vec3(0.0, 0.08, 0.75);
        vec3 mid = vec3(0.0, 0.42, 1.35);
        vec3 heart = vec3(0.7, 1.15, 1.6);
        float streak = smoothstep(0.52, 0.8, swirl);
        // Tone mapping washes bright blues toward white, so the body stays dark and saturated
        // and only the heart and the streaks go bright.
        vec3 col = mix(mid, deep, smoothstep(0.2, 0.9, fres + (0.5 - swirl) * 0.6)) * 0.6;
        col += heart * (pow(facing, 5.0) * 1.1 + streak * 0.6);
        col += vec3(0.05, 0.3, 1.0) * pow(fres, 1.5) * 0.7;
        ${core ? 'float a = 0.7 * pow(facing, 4.0); gl_FragColor = vec4(vec3(0.2, 0.5, 1.2) * a * 0.9, a);' : 'float a = 0.85 + 0.15 * fres; gl_FragColor = vec4(col, a);'}
      }`,
  });
}

function runeRingMaterial(time: { value: number }, inner: number, outer: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; varying vec2 vP;
      void main(){
        float r = length(vP);
        float t = (r - ${inner.toFixed(3)}) / ${(outer - inner).toFixed(3)};
        float ang = atan(vP.y, vP.x) / 6.2831853 + 0.5;
        // Two thin circles with a band of turning glyph dashes between them.
        float lines = smoothstep(0.1, 0.0, abs(t - 0.06)) + smoothstep(0.1, 0.0, abs(t - 0.94));
        float g = fract(ang * 36.0 + time * 0.04);
        float glyph = step(0.2, g) * step(g, 0.75) * step(0.3, t) * step(t, 0.7);
        float notch = step(0.9, fract(ang * 12.0 - time * 0.02)) * step(0.2, t) * step(t, 0.8);
        float pulse = 0.75 + 0.25 * sin(time * 2.0);
        float a = (lines * 0.9 + glyph * 0.55 + notch * 0.6) * pulse;
        gl_FragColor = vec4(vec3(0.3, 0.75, 1.0) * a * 2.6, a);
      }`,
  });
}

function motes(time: { value: number }, radius: number, height: number, count: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  let seed = 11;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radius;
    pos.set([Math.cos(a) * r, rnd() * height, Math.sin(a) * r], i * 3);
    speed[i] = 0.3 + rnd() * 0.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('speed', new THREE.BufferAttribute(speed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time },
    vertexShader: `uniform float time; attribute float speed; varying float vFade;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + time * speed, ${height.toFixed(2)});
        vFade = sin(3.14159 * p.y / ${height.toFixed(2)});
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 34.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vFade;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vFade;
        gl_FragColor = vec4(vec3(0.55, 0.9, 1.0) * a * 1.5, a);
      }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export interface Gate {
  group: THREE.Group;
  update(t: number): void;
}

/** Loads the modelled gate and adds the animated effects at its `Gate_Orb` / `Gate_Runes` anchors. */
export async function teleportGate(loader: GLTFLoader): Promise<Gate> {
  const time = { value: 0 };
  const g = (await loader.loadAsync(GATE_MODEL)).scene;
  const inlay = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 1.6) });
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshStandardMaterial[];
    if (mats.some((m) => m.name === 'GlowBlue')) {
      // The diamond inlays glow past the tone mapper so bloom picks them up.
      o.material = inlay;
      return;
    }
    o.castShadow = o.receiveShadow = true;
    for (const m of mats) for (const t of [m.map, m.normalMap]) if (t) t.anisotropy = 8;
  });
  g.updateMatrixWorld(true);
  const anchor = (name: string) => {
    const o = g.getObjectByName(name);
    if (!o) throw new Error(`${GATE_MODEL} has no ${name}`);
    return o.getWorldPosition(new THREE.Vector3());
  };

  // The gate itself: a floating sphere of swirling light over a rune circle.
  const center = anchor('Gate_Orb');
  const deck = anchor('Gate_Runes');
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.55, 64, 48), sphereMaterial(time, false));
  orb.position.copy(center);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 32), sphereMaterial(time, true));
  core.position.copy(center);
  orb.renderOrder = 2;
  core.renderOrder = 3;
  const runes = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.5, 96, 1), runeRingMaterial(time, 1.6, 2.5));
  runes.rotation.x = -Math.PI / 2;
  runes.position.set(deck.x, deck.y + 0.012, deck.z);
  const sparks = motes(time, 1.9, 4.2, 90);
  sparks.position.copy(deck);
  const light = new THREE.PointLight('#68c4ff', 28, 14, 1.6);
  light.position.copy(center);
  g.add(orb, core, runes, sparks, light);

  return {
    group: g,
    update(t) {
      time.value = t;
      const bob = Math.sin(t * 1.1) * 0.08;
      orb.position.y = core.position.y = center.y + bob;
      orb.rotation.y = t * 0.15;
      light.intensity = 26 + Math.sin(t * 2.0) * 4;
    },
  };
}
