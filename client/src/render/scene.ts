// Renderer, camera, lights and post-processing in the look-test style: physically based materials
// lit by a sun and an HDRI sky, neutral tone mapping (keeps saturated anime colour), ambient
// occlusion, bloom and a light colour grade. Dungeons swap the sky for darkness and torchlight.
// URL options: ?ao=0 turns ambient occlusion off.
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PH } from './assets';
import { floorAbove, mountains } from './dressing';

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

const HAZE = new THREE.Color('#bcd0e2');
const DARK = new THREE.Color('#0b0a10');

/** Anime-fantasy grade: a little more saturation and warmth, gentle contrast, soft vignette. */
function gradePass(): ShaderPass {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, saturation: { value: 1.06 }, contrast: { value: 1.05 }, warmth: { value: 0.035 }, vignette: { value: 0.28 } },
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
}

export function createScene(container: HTMLElement): SceneKit {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(window.innerWidth, window.innerHeight);
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = HAZE.clone();
  scene.fog = new THREE.Fog(HAZE, 110, 720);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2500);

  // Fill light until the HDRI arrives (and the only fill in dungeons, which have no sky).
  const hemi = new THREE.HemisphereLight('#dfefff', '#6b7a4a', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe9c8', 3.4);
  const SUN_OFFSET = new THREE.Vector3(-18, 26, 14);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Far scenery for outdoor maps: mountains on the horizon and the underside of the floor above.
  const scenery = new THREE.Group();
  scenery.add(mountains(470), floorAbove(380, 1400));
  scene.add(scenery);

  let sky: THREE.Texture | null = null;
  let dungeon = false;
  const applySky = () => {
    if (dungeon || !sky) return;
    scene.background = sky;
    scene.environment = sky;
    scene.environmentIntensity = 0.9;
    hemi.intensity = 0;
  };
  new HDRLoader()
    .loadAsync(`${PH}/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr`)
    .then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      sky = hdr;
      applySky();
    })
    .catch((err: unknown) => console.warn('could not load the sky (run npm run fetch-lookdev-assets?)', err));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (params.get('ao') !== '0') {
    const ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.25, 0.5, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(gradePass());

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
      sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
    },
    setAmbience(kind) {
      dungeon = kind === 'dungeon';
      scenery.visible = !dungeon;
      if (dungeon) {
        scene.background = DARK;
        scene.environment = null;
        scene.fog = new THREE.Fog(DARK, 20, 75);
        hemi.intensity = 1.1;
        hemi.color.set('#a9a2d6');
        hemi.groundColor.set('#3a3040');
        sun.intensity = 0.4;
        bloom.strength = 0.6;
      } else {
        scene.background = HAZE.clone();
        scene.fog = new THREE.Fog(HAZE, 110, 720);
        hemi.intensity = 0.6;
        hemi.color.set('#dfefff');
        hemi.groundColor.set('#6b7a4a');
        sun.intensity = 3.4;
        bloom.strength = 0.25;
        applySky();
      }
    },
  };
  window.addEventListener('resize', () => kit.resize());
  // Size every pass in device pixels (GTAOPass is built at CSS size, which is wrong on HiDPI screens).
  kit.resize();
  return kit;
}
