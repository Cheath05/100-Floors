// The town's teleport gate: a stepped stone dais with four obelisks, a low back wall bearing the
// town crest, and a swirling blue sphere of light floating over a glowing rune ring.
// Original design; front faces +Z.
import * as THREE from 'three';

type MatFactory = (texture: string) => THREE.MeshStandardMaterial;

/** A box whose UVs are in world units / `tile`, so one texture keeps its scale at any size. */
function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], tile = 2): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z.
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]] as const;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f]![0]) / tile, (uv.getY(k) * dims[f]![1]) / tile);
    }
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Square-section tapered shaft (a 4-sided cylinder turned 45 degrees). `w` is the side length. */
function shaft(wBottom: number, wTop: number, h: number, mat: THREE.Material, tile = 2): THREE.Mesh {
  const g = new THREE.CylinderGeometry(wTop / Math.SQRT2, wBottom / Math.SQRT2, h, 4, 1, true);
  g.rotateY(Math.PI / 4);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * 4 * wBottom) / tile, (uv.getY(k) * h) / tile);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function pyramid(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.ConeGeometry(w / Math.SQRT2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

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

export function teleportGate(pbr: MatFactory): Gate {
  const time = { value: 0 };
  const blocks = pbr('large_sandstone_blocks_01');
  const paving = pbr('granite_tile');
  const carved = pbr('sandstone_cracks');
  carved.color.set('#c4ccd9'); // cool the warm sandstone toward pale grey
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a04a', metalness: 1, roughness: 0.32 });
  const inlay = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 1.6) });
  const g = new THREE.Group();

  // Three tiers: sandstone block sides, granite paving on top. Each tier is a step on every side.
  const tiers: [number, number][] = [
    [11, 9],
    [9.4, 7.6],
    [7.8, 6.2],
  ];
  const TIER_H = 0.32;
  tiers.forEach(([w, d], i) => {
    const t = box(w, TIER_H, d, [blocks, blocks, paving, blocks, blocks, blocks], 2.4);
    t.position.y = TIER_H * (i + 0.5);
    g.add(t);
  });
  const deckY = TIER_H * tiers.length;

  // Four obelisks on stepped plinths at the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const o = new THREE.Group();
      o.position.set(sx * 4.55, 0, sz * 3.55);
      const plinth = box(1.7, 1.5, 1.7, blocks, 1.6);
      plinth.position.y = 0.75;
      const ledge = box(1.95, 0.22, 1.95, carved, 1.2);
      ledge.position.y = 1.61;
      const step2 = box(1.3, 0.55, 1.3, blocks, 1.2);
      step2.position.y = 1.995;
      const band = box(1.12, 0.12, 1.12, gold);
      band.position.y = 2.33;
      const body = shaft(0.95, 0.62, 3.4, carved, 1.6);
      body.position.y = 2.39 + 1.7;
      const collar = box(0.74, 0.16, 0.74, gold);
      collar.position.y = 5.87;
      const tip = pyramid(0.7, 1.05, carved);
      tip.position.y = 5.95 + 0.525;
      o.add(plinth, ledge, step2, band, body, collar, tip);
      // A glowing diamond inlay on the two faces that look at the plaza and the sphere.
      for (const [nx, nz] of [
        [0, 1],
        [-sx, 0],
      ] as const) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), inlay);
        gem.scale.set(nx ? 0.3 : 1, 1.8, nz ? 0.3 : 1);
        gem.position.set(nx * 0.445, 3.2, nz * 0.445);
        o.add(gem);
      }
      g.add(o);
    }
  }

  // Low back wall with corner posts and the town crest (a tower inside a ring).
  const wallZ = -2.6;
  const wall = box(4.4, 1.5, 0.6, blocks, 1.6);
  wall.position.set(0, deckY + 0.75, wallZ);
  const coping = box(4.7, 0.18, 0.8, carved, 1.2);
  coping.position.set(0, deckY + 1.59, wallZ);
  g.add(wall, coping);
  for (const sx of [-1, 1]) {
    const post = box(0.75, 2.3, 0.75, blocks, 1.4);
    post.position.set(sx * 2.45, deckY + 1.15, wallZ);
    const cap = pyramid(0.85, 0.6, carved);
    cap.position.set(sx * 2.45, deckY + 2.6, wallZ);
    g.add(post, cap);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 40), gold);
  ring.position.set(0, deckY + 0.85, wallZ + 0.32);
  const tower = new THREE.Group();
  const towerBody = box(0.2, 0.46, 0.06, gold);
  towerBody.position.y = -0.03;
  tower.add(towerBody);
  for (const x of [-0.08, 0, 0.08]) {
    const merlon = box(0.05, 0.08, 0.06, gold);
    merlon.position.set(x, 0.24, 0);
    tower.add(merlon);
  }
  tower.position.copy(ring.position);
  g.add(ring, tower);

  // The gate itself: a floating sphere of swirling light over a rune circle.
  const center = new THREE.Vector3(0, deckY + 2.1, 0.3);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.55, 64, 48), sphereMaterial(time, false));
  orb.position.copy(center);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 32), sphereMaterial(time, true));
  core.position.copy(center);
  orb.renderOrder = 2;
  core.renderOrder = 3;
  const runes = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.5, 96, 1), runeRingMaterial(time, 1.6, 2.5));
  runes.rotation.x = -Math.PI / 2;
  runes.position.set(center.x, deckY + 0.012, center.z);
  const sparks = motes(time, 1.9, 4.2, 90);
  sparks.position.set(center.x, deckY, center.z);
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
