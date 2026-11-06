// Art-direction look test: anime (VRM, MToon) characters with retargeted CC0 animations in a
// physically lit medieval town built from CC0 kits (Quaternius village kit, Poly Haven textures,
// rocks and sky, ez-tree procedural trees). Open /lookdev.html. Not part of the game yet.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { Tree } from '@dgreenheck/ez-tree';
import { retargetClip } from './retarget';
import { teleportGate, type Gate } from './gate';
import { createGrass } from './grass';
import { dressDuelist, dressVanguard } from './outfits';
import { banner, barrel, floorAbove, lampPost, marketStall, mountains, planter } from './props';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const params = new URL(location.href).searchParams;
const useAO = params.get('ao') !== '0';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Neutral keeps saturated anime colors and blue glows (AgX washes them toward white); ?tm=agx|aces to compare.
const toneMaps = { agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping } as const;
renderer.toneMapping = toneMaps[(params.get('tm') ?? 'neutral') as keyof typeof toneMaps] ?? THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bcd0e2', 110, 720);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2500);
camera.position.set(5.5, 2.4, 9.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
if (params.get('view') === 'gate') {
  camera.position.set(9, 4.5, 9);
  controls.target.set(0, 2.2, -7);
}
controls.maxPolarAngle = Math.PI * 0.49;
controls.enableDamping = true;

const sun = new THREE.DirectionalLight('#ffe9c8', 3.4);
sun.position.set(-18, 26, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);

const status = document.getElementById('status')!;
const log = (s: string) => (status.textContent = s);

const gltfLoader = new GLTFLoader();
gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
const texLoader = new THREE.TextureLoader();
const PH = '/assets/polyhaven';

function pbr(name: string, repeat: number): THREE.MeshStandardMaterial {
  const load = (suffix: string, srgb: boolean) => {
    const t = texLoader.load(`${PH}/textures/${name}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  return new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor', false), aoMap: arm, roughnessMap: arm, metalnessMap: arm });
}

async function loadSky(): Promise<void> {
  const hdr = await new HDRLoader().loadAsync(`${PH}/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = hdr;
  scene.environment = hdr;
  scene.environmentIntensity = 0.9;
  scene.backgroundIntensity = 1.0;
}

function buildGround(): void {
  const grass = new THREE.Mesh(new THREE.CircleGeometry(560, 96), pbr('leafy_grass', 280));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(15, 64), pbr('cobblestone_floor_01', 9));
  // Cobbles fade into moss at the plaza edge.
  const edge = new THREE.Mesh(new THREE.RingGeometry(15, 17.5, 64), pbr('mossy_cobblestone', 10));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.008;
  edge.receiveShadow = true;
  scene.add(edge);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  scene.add(plaza);
  // Stone rim around the plaza.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(15, 0.18, 6, 96), pbr('castle_brick_07', 20));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.04;
  rim.scale.z = 0.5;
  rim.receiveShadow = true;
  scene.add(rim);
}

// ---- Village kit (Quaternius, CC0) ---------------------------------------------------------
const kitCache = new Map<string, Promise<THREE.Object3D>>();
function kit(name: string): Promise<THREE.Object3D> {
  let p = kitCache.get(name);
  if (!p) {
    p = gltfLoader.loadAsync(`/assets/village/${name}.gltf`).then((g: GLTF) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = true;
      });
      return g.scene;
    });
    kitCache.set(name, p);
  }
  return p.then((s) => s.clone());
}

async function place(name: string, parent: THREE.Object3D, x: number, y: number, z: number, rotY = 0): Promise<void> {
  const o = await kit(name);
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  parent.add(o);
}

/** A 4 m x 4 m (or 6 x 6) two-storey house from modular pieces. */
async function house(x: number, z: number, rotY: number, size: 4 | 6, style: 'plaster' | 'brick', seed: number): Promise<void> {
  const g = new THREE.Group();
  const half = size / 2;
  const H = 3.12;
  const floors = 2;
  const jobs: Promise<void>[] = [];
  const sides: { dx: number; dz: number; rot: number }[] = [
    { dx: 0, dz: 1, rot: 0 },
    { dx: 1, dz: 0, rot: Math.PI / 2 },
    { dx: 0, dz: -1, rot: Math.PI },
    { dx: -1, dz: 0, rot: -Math.PI / 2 },
  ];
  const segs = size / 2;
  for (let f = 0; f < floors; f++) {
    sides.forEach((s, si) => {
      for (let i = 0; i < segs; i++) {
        const along = -half + 1 + i * 2;
        const px = s.dx !== 0 ? s.dx * half : along;
        const pz = s.dz !== 0 ? s.dz * half : along;
        let piece: string;
        const ground = f === 0;
        if (ground && si === 0 && i === Math.floor(segs / 2)) piece = style === 'brick' ? 'Wall_UnevenBrick_Door_Round' : 'Wall_Plaster_Door_Round';
        else if (ground) piece = style === 'brick' ? ((i + seed) % 2 ? 'Wall_UnevenBrick_Window_Wide_Round' : 'Wall_UnevenBrick_Straight') : (i + seed) % 2 ? 'Wall_Plaster_Window_Wide_Round' : 'Wall_Plaster_Straight';
        else piece = (i + si + seed) % 2 ? 'Wall_Plaster_Window_Wide_Flat' : 'Wall_Plaster_WoodGrid';
        jobs.push(place(piece, g, px, f * H, pz, s.rot));
      }
    });
    for (const [cx, cz] of [
      [half, half],
      [half, -half],
      [-half, half],
      [-half, -half],
    ] as const) {
      jobs.push(place(style === 'brick' && f === 0 ? 'Corner_Exterior_Brick' : 'Corner_Exterior_Wood', g, cx, f * H, cz, Math.atan2(cx, cz) - Math.PI / 4));
    }
  }
  jobs.push(place(size === 4 ? 'Roof_RoundTiles_4x4' : 'Roof_RoundTiles_6x6', g, 0, floors * H, 0, 0));
  const gable = size === 4 ? 'Roof_Front_Brick4' : 'Roof_Front_Brick6';
  jobs.push(place(gable, g, 0, floors * H, half, 0));
  jobs.push(place(gable, g, 0, floors * H, -half, Math.PI));
  jobs.push(place('Prop_Chimney', g, half - 0.8, floors * H + 1.2, -half + 1, 0));
  await Promise.all(jobs);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
}

const houseSpots: [number, number, number][] = [];
const clothTime = { value: 0 };

async function buildVillage(): Promise<void> {
  const ring: [number, number, 4 | 6, 'plaster' | 'brick'][] = [
    [-9, -13, 6, 'plaster'],
    [0, -17, 6, 'brick'],
    [9, -13, 4, 'plaster'],
    [-15, -3, 4, 'brick'],
    [16, -2, 6, 'plaster'],
    [-13, 9, 6, 'plaster'],
  ];
  for (const [x, z, sz] of ring) houseSpots.push([x, z, sz / 2 + 1.5]);
  // A street running south from the plaza, lined with houses facing it.
  const avenue: [number, number, 4 | 6, 'plaster' | 'brick'][] = [
    [-10, 24, 6, 'brick'],
    [10, 23, 4, 'plaster'],
    [-10, 32, 4, 'plaster'],
    [10, 31, 6, 'brick'],
    [-10.5, 40, 6, 'plaster'],
    [10.5, 40, 6, 'plaster'],
  ];
  for (const [x, z, sz] of avenue) houseSpots.push([x, z, sz / 2 + 1.5]);
  await Promise.all([
    ...ring.map(([x, z, s, st], i) => house(x, z, Math.atan2(-x, -z), s, st, i)),
    ...avenue.map(([x, z, s, st], i) => house(x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, s, st, i + 3)),
  ]);
  // Street dressing.
  const time = clothTime;
  const stallColors: [string, string][] = [
    ['#c0392b', '#f5e6c8'],
    ['#1f6f8b', '#f5e6c8'],
    ['#2e7d32', '#f5e6c8'],
    ['#8e44ad', '#f5e6c8'],
  ];
  stallColors.forEach((c, i) => {
    const a = -0.9 + i * 0.42;
    scene.add(marketStall(Math.sin(a + Math.PI / 2) * 11, Math.cos(a + Math.PI / 2) * 11, a + Math.PI / 2 + Math.PI, c, time, i + 1));
  });
  for (const [x, z] of [
    [-4.2, 14.5],
    [4.2, 14.5],
  ] as const) {
    scene.add(banner(x, z, x < 0 ? 0 : Math.PI, x < 0 ? '#8c1c2b' : '#1c3f8c', '#e8c36a', time));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const [x, z] = [Math.sin(a) * 9, Math.cos(a) * 9];
    if (Math.abs(x) < 6.5 && z < -1.5) continue; // the gate's dais is here
    scene.add(lampPost(x, z));
  }
  for (let z = 20; z <= 44; z += 8) {
    scene.add(lampPost(-5.2, z), lampPost(5.2, z + 4));
  }
  scene.add(planter(-3.2, -1.5, 0, 1), planter(3.2, -1.5, 0, 2), planter(-6.8, 9.8, 0.6, 3), planter(6.8, 9.8, -0.6, 4));
  scene.add(barrel(-6.4, 21, 1), barrel(-6.9, 21.6, 0.95), barrel(6.3, 27.5, 1.05), barrel(-12.5, -6.5, 1));
  const street = new THREE.Mesh(new THREE.PlaneGeometry(9, 34), pbr('cobblestone_floor_01', 1));
  for (const m of [street.material.map, street.material.normalMap, street.material.aoMap]) m?.repeat.set(5, 19);
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, 0.012, 31);
  street.receiveShadow = true;
  scene.add(street);
  await Promise.all([
    place('Prop_Wagon', scene, 9.8, 0, -3.2, 0.9),
    place('Prop_Crate', scene, 8.2, 0, -8.5, 0.3),
    place('Prop_Crate', scene, 8.9, 0, -7.6, 1.1),
    place('Prop_Crate', scene, 8.5, 1.06, -8.1, 0.6),
  ]);
}

// ---- Gate -------------------------------------------------------------------------------------
let gate: Gate | null = null;
function buildGate(): void {
  gate = teleportGate((name) => pbr(name, 1));
  gate.group.position.set(0, 0, -7);
  scene.add(gate.group);
}

// ---- Nature: ez-tree trees and Poly Haven rocks/plants ---------------------------------------
function buildTrees(): Tree[] {
  const trees: Tree[] = [];
  const presets = ['Oak Large', 'Ash Large', 'Oak Medium', 'Pine Large', 'Aspen Medium'];
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 26 + rnd() * 40;
    // Keep the southern street clear.
    if (Math.abs(Math.sin(a) * d) < 17 && Math.cos(a) * d > 12) continue;
    const tree = new Tree();
    tree.loadPreset(presets[i % presets.length]!);
    tree.options.seed = 1000 + i;
    tree.generate();
    tree.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(tree);
    const height = box.max.y - box.min.y;
    tree.scale.setScalar((9 + rnd() * 6) / height);
    tree.position.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    tree.rotation.y = rnd() * Math.PI * 2;
    scene.add(tree);
    trees.push(tree);
  }
  return trees;
}

async function scatter(model: string, count: number, minR: number, maxR: number, scale: [number, number], seed: number): Promise<void> {
  const g = await gltfLoader.loadAsync(`${PH}/models/${model}/${model}_1k.gltf`);
  let s = seed;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const o = g.scene.clone();
    const a = rnd() * Math.PI * 2;
    const d = minR + rnd() * (maxR - minR);
    const px = Math.sin(a) * d;
    const pz = Math.cos(a) * d;
    // Nature stays out in the fields: not on the street, not inside the town ring.
    if ((Math.abs(px) < 16 && pz > 12) || houseSpots.some(([hx, hz, r]) => Math.abs(px - hx) < r + 1 && Math.abs(pz - hz) < r + 1)) continue;
    o.position.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    o.rotation.y = rnd() * Math.PI * 2;
    o.scale.setScalar(scale[0] + rnd() * (scale[1] - scale[0]));
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    scene.add(o);
  }
}

// ---- Characters --------------------------------------------------------------------------------
interface Actor {
  vrm: VRM;
  mixer: THREE.AnimationMixer;
}
const actors: Actor[] = [];

interface AnimLib {
  /** Each clip with the skeleton it was authored on. */
  clips: { clip: THREE.AnimationClip; source: THREE.Object3D }[];
}

async function loadAnimations(): Promise<AnimLib> {
  const libs = await Promise.all([gltfLoader.loadAsync('/assets/anim/UAL1.glb'), gltfLoader.loadAsync('/assets/anim/UAL2.glb')]);
  return { clips: libs.flatMap((g) => g.animations.map((clip) => ({ clip, source: g.scene }))) };
}

async function katana(): Promise<THREE.Object3D> {
  const g = await gltfLoader.loadAsync(`${PH}/models/antique_katana_01/antique_katana_01_1k.gltf`);
  g.scene.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return g.scene;
}

async function addActor(file: string, x: number, z: number, faceY: number, clipName: string, anims: AnimLib, sword: THREE.Object3D | null, dress?: (vrm: VRM) => void): Promise<void> {
  const gltf = await gltfLoader.loadAsync(`/assets/vrm/${file}`);
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  const holder = new THREE.Group();
  holder.position.set(x, 0, z);
  holder.rotation.y = faceY;
  holder.add(vrm.scene);
  scene.add(holder);
  // Armor is fitted in the rest pose, before any animation plays.
  dress?.(vrm);
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const src = anims.clips.find((c) => c.clip.name === clipName);
  if (src) mixer.clipAction(retargetClip(src.clip, src.source, vrm)).play();
  else console.warn('missing clip', clipName);
  if (sword) {
    const hand = vrm.humanoid.getRawBoneNode('rightHand');
    if (hand) {
      const blade = sword.clone();
      // Hold the grip in the palm, blade out past the thumb.
      blade.rotation.set(0, 0, -Math.PI / 2);
      blade.position.set(-0.04, -0.02, 0.0);
      const fix = new THREE.Group();
      fix.add(blade);
      hand.add(fix);
      fix.userData.blade = blade;
    }
  }
  actors.push({ vrm, mixer });
}

// ---- Post-processing ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (useAO) {
  const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
}
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.25, 0.5, 0.95));
composer.addPass(new OutputPass());
// Anime-fantasy grade: a little more saturation and warmth, gentle contrast, soft vignette.
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, saturation: { value: renderer.toneMapping === THREE.NeutralToneMapping ? 1.06 : 1.22 }, contrast: { value: 1.05 }, warmth: { value: 0.035 }, vignette: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float warmth; uniform float vignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += vec3(warmth, warmth * 0.4, -warmth);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - vignette * smoothstep(0.45, 0.85, d);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
});
composer.addPass(grade);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

let trees: Tree[] = [];
let grassField: { update(t: number): void } | null = null;
let lastT = performance.now();
const t0 = lastT;
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = (now - t0) / 1000;
  controls.update();
  for (const a of actors) {
    a.mixer.update(dt);
    a.vrm.update(dt);
  }
  for (const tree of trees) tree.update(t);
  gate?.update(t);
  clothTime.value = t;
  grassField?.update(t);
  composer.render();
}

async function main(): Promise<void> {
  log('Loading sky and ground...');
  buildGround();
  buildGate();
  requestAnimationFrame(frame);
  await loadSky();
  scene.add(mountains(470));
  if (params.get('ceiling') === '1') scene.add(floorAbove(380, 1400));
  log('Building village...');
  await buildVillage();
  const field = createGrass({
    count: Number(params.get('grass') ?? 90000),
    innerRadius: 17,
    outerRadius: 75,
    seed: 3,
    allow: (x, z) => !(Math.abs(x) < 5.5 && z > 14) && houseSpots.every(([hx, hz, r]) => Math.abs(x - hx) > r || Math.abs(z - hz) > r),
  });
  scene.add(field.mesh);
  grassField = field;
  log('Growing trees...');
  trees = buildTrees();
  log('Placing rocks and plants...');
  await Promise.all([
    scatter('boulder_01', 14, 28, 70, [0.8, 1.6], 3),
    scatter('rock_moss_set_01', 18, 24, 60, [1, 2], 5),
    scatter('fern_02', 60, 20, 55, [1.5, 2.5], 7),
    scatter('grass_medium_01', 90, 18, 50, [1.4, 2.4], 9),
  ]);
  log('Loading characters and animations...');
  const [anims, sword] = await Promise.all([loadAnimations(), katana()]);
  const clips = params.get('clips')?.split(',') ?? ['Sword_Idle', 'Idle_Loop', 'Sword_Regular_Combo'];
  await Promise.all([
    addActor('HairSample_Male.vrm', -1.3, 1.2, 0.5, clips[0]!, anims, sword, dressVanguard),
    addActor('pixiv_sample.vrm', 1.0, 1.6, -0.3, clips[1]!, anims, null),
    addActor('HairSample_Female.vrm', 3.0, -0.4, -0.9, clips[2]!, anims, sword, dressDuelist),
  ]);
  log('');
  (window as unknown as { look: unknown }).look = { scene, camera, controls, actors, THREE, anims };
}

main().catch((err) => {
  console.error(err);
  log(`Error: ${String(err)}`);
});
