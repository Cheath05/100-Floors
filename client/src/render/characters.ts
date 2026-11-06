// Player avatars: KayKit characters (CC0, Kay Lousberg) cloned per player, toon-shaded, animated.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Anim, STARTER_MODELS } from '@floors/shared';
import { toonMaterial, toonify } from './toon';

const BASE = '/assets/kaykit/adventurers/characters/';
const TARGET_HEIGHT = 1.75;

/** Which clip plays for each movement state. */
const CLIPS: Record<number, string> = {
  [Anim.Idle]: 'Idle',
  [Anim.Walk]: 'Walking_A',
  [Anim.Run]: 'Running_A',
  [Anim.Sprint]: 'Running_B',
  [Anim.Air]: 'Jump_Idle',
};

interface Template {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  scale: number;
}

const loader = new GLTFLoader();
const templates = new Map<number, Promise<Template | null>>();

function loadTemplate(model: number): Promise<Template | null> {
  let p = templates.get(model);
  if (!p) {
    const name = STARTER_MODELS[model] ?? STARTER_MODELS[0];
    p = loader
      .loadAsync(`${BASE}${name}.glb`)
      .then((gltf: GLTF) => {
        const scene = gltf.scene;
        // Keep one item per hand; the rest of the pack's held items are hidden until gear exists.
        // (GLTFLoader strips the "." from node names, so "handslot.r" arrives as "handslotr".)
        scene.traverse((o) => {
          const hand = /^handslot\.?([lr])$/.exec(o.name)?.[1];
          if (!hand) return;
          const items = o.children;
          const keep = hand === 'l' ? (items.find((c) => /shield/i.test(c.name)) ?? items[0]) : items[0];
          for (const c of items) c.visible = c === keep;
        });
        toonify(scene);
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const height = Math.max(0.1, box.max.y - box.min.y);
        return { scene, clips: gltf.animations, scale: TARGET_HEIGHT / height };
      })
      .catch((err: unknown) => {
        console.warn(`could not load ${name}.glb (run npm run fetch-assets?)`, err);
        return null;
      });
    templates.set(model, p);
  }
  return p;
}

/** Start downloading the starter models early. */
export function preloadCharacters(): Promise<unknown> {
  return Promise.all(STARTER_MODELS.map((_, i) => loadTemplate(i)));
}

function placeholder(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 12), toonMaterial({ color: '#8fb3ff' }));
  body.position.y = 0.8;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.3), toonMaterial({ color: '#333' }));
  nose.position.set(0, 1.25, 0.35);
  g.add(body, nose);
  return g;
}

export class Avatar {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<number, THREE.AnimationAction>();
  private current = -1;
  private label: CSS2DObject;
  private labelEl: HTMLDivElement;

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
    this.label.position.set(0, 2.05, 0);
    this.root.add(this.label);

    void loadTemplate(model).then((t) => {
      if (!t) return;
      const model3d = cloneSkinned(t.scene);
      model3d.scale.setScalar(t.scale);
      this.root.remove(fallback);
      this.root.add(model3d);
      this.mixer = new THREE.AnimationMixer(model3d);
      for (const [anim, clipName] of Object.entries(CLIPS)) {
        const clip = THREE.AnimationClip.findByName(t.clips, clipName);
        if (clip) this.actions.set(Number(anim), this.mixer.clipAction(clip));
      }
      const want = this.current;
      this.current = -1;
      this.play(want < 0 ? Anim.Idle : want);
    });
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
    next.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    if (prev && prev !== next) prev.fadeOut(0.15);
  }

  update(dt: number, x: number, y: number, z: number, facing: number, anim: number, speed: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = facing;
    this.play(anim);
    const action = this.actions.get(this.current);
    if (action) {
      // Match leg speed to ground speed a little so feet slide less.
      if (anim === Anim.Walk) action.timeScale = Math.max(0.6, speed / 2.2);
      else if (anim === Anim.Run) action.timeScale = Math.max(0.8, speed / 5.5);
      else action.timeScale = 1;
    }
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.label.element.remove();
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
  }

  get local(): boolean {
    return this.isLocal;
  }
}
