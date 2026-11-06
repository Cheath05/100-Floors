// Player avatars: VRM anime characters (VRoid samples, MToon) with real-world proportions, dressed
// in our original outfits and armor, holding a katana, animated with Quaternius' Universal
// Animation Library retargeted onto each VRM. Each player loads their own VRM (spring bones and
// expressions don't survive cloning); the files are cached by the browser after the first one.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { Anim, STARTER_MODELS } from '@floors/shared';
import { gltfLoader, PH } from './assets';
import { dressDuelist, dressVanguard } from './outfits';
import { retargetClip } from './retarget';

const vrmLoader = new GLTFLoader();
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

interface Look {
  file: string;
  dress?: (vrm: VRM) => void;
}
/** One entry per STARTER_MODELS name. */
const LOOKS: Record<(typeof STARTER_MODELS)[number], Look> = {
  Vanguard: { file: 'HairSample_Male.vrm', dress: dressVanguard },
  Duelist: { file: 'HairSample_Female.vrm', dress: dressDuelist },
  Wanderer: { file: 'pixiv_sample.vrm' },
  Fencer: { file: 'HairSample_Male.vrm', dress: dressDuelist },
};

/** Which library clip plays for each movement state. */
const CLIPS: Record<number, string> = {
  [Anim.Idle]: 'Sword_Idle',
  [Anim.Walk]: 'Walk_Loop',
  [Anim.Run]: 'Jog_Fwd_Loop',
  [Anim.Sprint]: 'Sprint_Loop',
  [Anim.Air]: 'Jump_Loop',
};

interface AnimLib {
  clips: { clip: THREE.AnimationClip; source: THREE.Object3D }[];
}
let animLib: Promise<AnimLib> | null = null;
function animations(): Promise<AnimLib> {
  animLib ??= Promise.all([gltfLoader.loadAsync('/assets/anim/UAL1.glb'), gltfLoader.loadAsync('/assets/anim/UAL2.glb')]).then((libs) => ({
    clips: libs.flatMap((g) => g.animations.map((clip) => ({ clip, source: g.scene }))),
  }));
  return animLib;
}

let katanaModel: Promise<THREE.Object3D> | null = null;
function katana(): Promise<THREE.Object3D> {
  katanaModel ??= gltfLoader.loadAsync(`${PH}/models/antique_katana_01/antique_katana_01_1k.gltf`).then((g) => {
    g.scene.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    return g.scene;
  });
  return katanaModel.then((k) => k.clone());
}

async function loadAvatar(model: number): Promise<{ vrm: VRM; mixer: THREE.AnimationMixer; actions: Map<number, THREE.AnimationAction> }> {
  const look = LOOKS[STARTER_MODELS[model] ?? STARTER_MODELS[0]];
  const [gltf, lib, blade] = await Promise.all([vrmLoader.loadAsync(`/assets/vrm/${look.file}`), animations(), katana()]);
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
  // Armor is fitted in the rest pose, before any animation plays.
  look.dress?.(vrm);
  const hand = vrm.humanoid.getRawBoneNode('rightHand');
  if (hand) {
    // Grip in the palm, blade out past the thumb.
    blade.rotation.set(0, 0, -Math.PI / 2);
    blade.position.set(-0.04, -0.02, 0);
    hand.add(blade);
  }
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const actions = new Map<number, THREE.AnimationAction>();
  for (const [anim, clipName] of Object.entries(CLIPS)) {
    const src = lib.clips.find((c) => c.clip.name === clipName);
    if (src) actions.set(Number(anim), mixer.clipAction(retargetClip(src.clip, src.source, vrm)));
    else console.warn('missing animation', clipName);
  }
  return { vrm, mixer, actions };
}

/** Start downloading the shared animation library and katana early. */
export function preloadCharacters(): Promise<unknown> {
  return Promise.all([animations(), katana()]).catch((err: unknown) => console.warn('could not preload characters (run npm run fetch-lookdev-assets?)', err));
}

function placeholder(): THREE.Object3D {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 12), new THREE.MeshStandardMaterial({ color: '#8fb3ff', roughness: 0.6, transparent: true, opacity: 0.5 }));
  body.position.y = 0.8;
  return body;
}

export class Avatar {
  readonly root = new THREE.Group();
  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<number, THREE.AnimationAction>();
  private current = -1;
  private label: CSS2DObject;
  private labelEl: HTMLDivElement;
  private disposed = false;

  constructor(
    model: number,
    name: string,
    private isLocal: boolean,
  ) {
    const fallback = placeholder();
    this.root.add(fallback);
    this.labelEl = document.createElement('div');
    this.labelEl.className = isLocal ? 'nametag local' : 'nametag';
    this.labelEl.innerHTML = `<span class="cursor"></span><span class="name"></span>`;
    this.setName(name);
    this.label = new CSS2DObject(this.labelEl);
    this.label.position.set(0, 2.0, 0);
    this.root.add(this.label);

    loadAvatar(model)
      .then(({ vrm, mixer, actions }) => {
        if (this.disposed) {
          VRMUtils.deepDispose(vrm.scene);
          return;
        }
        this.root.remove(fallback);
        this.root.add(vrm.scene);
        this.vrm = vrm;
        this.mixer = mixer;
        this.actions = actions;
        const want = this.current;
        this.current = -1;
        this.play(want < 0 ? Anim.Idle : want);
      })
      .catch((err: unknown) => console.warn('could not load avatar (run npm run fetch-lookdev-assets?)', err));
  }

  setName(name: string): void {
    this.labelEl.querySelector('.name')!.textContent = name;
  }

  play(anim: number): void {
    if (anim === this.current) return;
    const next = this.actions.get(anim);
    const prev = this.actions.get(this.current);
    this.current = anim;
    if (!next) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
    if (prev && prev !== next) prev.fadeOut(0.2);
  }

  update(dt: number, x: number, y: number, z: number, facing: number, anim: number, speed: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = facing;
    this.play(anim);
    const action = this.actions.get(this.current);
    if (action) {
      // Match leg speed to ground speed a little so feet slide less.
      if (anim === Anim.Walk) action.timeScale = Math.max(0.6, speed / 1.6);
      else if (anim === Anim.Run) action.timeScale = Math.max(0.8, speed / 4.2);
      else if (anim === Anim.Sprint) action.timeScale = Math.max(0.8, speed / 7.5);
      else action.timeScale = 1;
    }
    this.mixer?.update(dt);
    this.vrm?.update(dt);
  }

  dispose(): void {
    this.disposed = true;
    this.label.element.remove();
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
  }

  get local(): boolean {
    return this.isLocal;
  }
}
