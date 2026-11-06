// Renderer, camera, lights, sky with the underside of the floor above, and the post-processing chain
// (scene + ink outlines -> bloom -> output).
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { noiseTexture, setOutline } from './toon';

/** Renders the scene plus OutlineEffect's inverted-hull ink lines into the composer's buffer. */
class OutlineRenderPass extends Pass {
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private effect: OutlineEffect,
  ) {
    super();
    this.needsSwap = false;
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    renderer.clear();
    this.effect.render(this.scene, this.camera);
  }
}

export interface SceneKit {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  render(): void;
  resize(): void;
  /** Keep the shadow camera centred on the player. */
  followShadow(x: number, z: number): void;
  setAmbience(kind: 'day' | 'dungeon'): void;
}

const SKY_TOP = new THREE.Color('#5ea4e6');
const SKY_HORIZON = new THREE.Color('#d9ecf7');

function makeSky(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
  });
  setOutline(skyMat, 0);
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // The underside of the floor above: a vast stone ceiling with the sky only visible at the rim.
  const ceilingTex = noiseTexture('#4b4855', ['#3c3946', '#5a5766', '#35323e', '#625e6e'], 512, 5000, 3, 6);
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(620, 64),
    new THREE.MeshBasicMaterial({ map: ceilingTex, side: THREE.DoubleSide, fog: true }),
  );
  setOutline(ceiling.material, 0);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 160;
  group.add(ceiling);
  // Giant support columns far out at the floor's edge.
  const colMat = new THREE.MeshLambertMaterial({ color: '#7d7a86' });
  setOutline(colMat, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 170, 12), colMat);
    col.position.set(Math.sin(a) * 430, 80, Math.cos(a) * 430);
    group.add(col);
  }
  scene.add(group);
  return group;
}

export function createScene(container: HTMLElement): SceneKit {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(window.innerWidth, window.innerHeight);
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON, 90, 520);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

  const hemi = new THREE.HemisphereLight('#dfefff', '#6b7a4a', 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -40;
  sc.right = sc.top = 40;
  sc.near = 1;
  sc.far = 160;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const sky = makeSky(scene);

  const outline = new OutlineEffect(renderer, { defaultThickness: 0.004, defaultColor: [0.08, 0.06, 0.1] });
  const composer = new EffectComposer(renderer);
  composer.addPass(new OutlineRenderPass(scene, camera, outline));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const kit: SceneKit = {
    renderer,
    labels,
    scene,
    camera,
    sun,
    render() {
      composer.render();
      labels.render(scene, camera);
    },
    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      labels.setSize(w, h);
    },
    followShadow(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x + 30, 60, z + 20);
    },
    setAmbience(kind) {
      if (kind === 'dungeon') {
        sky.visible = false;
        scene.background = new THREE.Color('#0d0b12');
        scene.fog = new THREE.Fog('#0d0b12', 25, 90);
        hemi.intensity = 0.55;
        hemi.color.set('#8c86b8');
        sun.intensity = 0.6;
      } else {
        sky.visible = true;
        scene.background = null;
        scene.fog = new THREE.Fog(SKY_HORIZON, 90, 520);
        hemi.intensity = 1.4;
        hemi.color.set('#dfefff');
        sun.intensity = 2.4;
      }
    },
  };
  window.addEventListener('resize', () => kit.resize());
  return kit;
}
