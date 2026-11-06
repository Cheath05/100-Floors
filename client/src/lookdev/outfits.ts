// Original outfit designs on the CC0 VRoid bases: repainted cloth (keeping the base model's fold
// shading) plus armor pieces modeled here and fitted to each character's skeleton.
import * as THREE from 'three';
import { MToonMaterial, MToonMaterialOutlineWidthMode, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';

// ---- Cloth repainting --------------------------------------------------------------------------

/** A paint step in image space (0..1 of the texture, origin top-left). */
interface Paint {
  rect?: [number, number, number, number];
  color: string;
  /** Vertical gradient end color (top -> bottom). */
  to?: string;
}

function repaint(mat: THREE.Material | undefined, steps: Paint[]): void {
  const m = mat as MToonMaterial | undefined;
  const src = m?.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!m || !src) return;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const g = canvas.getContext('2d')!;
  // Paint the design as flat colors on its own layer, then multiply it onto the original so the
  // fabric folds and seams stay.
  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const lg = layer.getContext('2d')!;
  lg.fillStyle = '#ffffff';
  lg.fillRect(0, 0, layer.width, layer.height);
  for (const s of steps) {
    const [x, y, w, h] = s.rect ?? [0, 0, 1, 1];
    const px = x * canvas.width;
    const py = y * canvas.height;
    const pw = w * canvas.width;
    const ph = h * canvas.height;
    if (s.to) {
      const grad = lg.createLinearGradient(0, py, 0, py + ph);
      grad.addColorStop(0, s.color);
      grad.addColorStop(1, s.to);
      lg.fillStyle = grad;
    } else {
      lg.fillStyle = s.color;
    }
    lg.fillRect(px, py, pw, ph);
  }
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(layer, 0, 0);
  // Keep the original alpha (cut-outs) intact.
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = m.map!.flipY;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = m.map!.wrapS;
  tex.wrapT = m.map!.wrapT;
  m.map = tex;
  // Shade the repainted cloth with a darker version of itself instead of the base's blue-grey.
  m.shadeMultiplyTexture = tex;
  m.shadeColorFactor = new THREE.Color(0.62, 0.6, 0.66);
  m.needsUpdate = true;
}

function materialsByName(vrm: VRM): Map<string, THREE.Material> {
  const out = new Map<string, THREE.Material>();
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!out.has(mat.name)) out.set(mat.name, mat);
    }
  });
  return out;
}

function find(mats: Map<string, THREE.Material>, part: string): THREE.Material[] {
  // Outline materials share the name with an "(Outline)" suffix; repaint only the base ones.
  return [...mats.entries()].filter(([n]) => n.includes(part) && !/outline/i.test(n)).map(([, m]) => m);
}

function tint(mats: THREE.Material[], color: string, shade?: string): void {
  for (const mat of mats) {
    const m = mat as MToonMaterial;
    m.color = new THREE.Color(color);
    if (shade) m.shadeColorFactor = new THREE.Color(shade);
  }
}

// ---- Armor modeling ----------------------------------------------------------------------------

type Finish = 'steel' | 'gold' | 'leather' | 'darkLeather' | 'cloth';

const FINISH: Record<Finish, { color: string; shade: string; rim: string }> = {
  steel: { color: '#aeb5c4', shade: '#4d5466', rim: '#f0f4ff' },
  gold: { color: '#e6c06a', shade: '#8c6424', rim: '#fff2c0' },
  leather: { color: '#8a5a36', shade: '#4a2c18', rim: '#c89a70' },
  darkLeather: { color: '#4a3226', shade: '#22150f', rim: '#806050' },
  cloth: { color: '#7a1f2b', shade: '#3e0d14', rim: '#d06070' },
};

function armorMaterial(finish: Finish, accent?: string): MToonMaterial[] {
  const f = FINISH[finish];
  const base = new MToonMaterial({
    color: new THREE.Color(accent ?? f.color),
    shadeColorFactor: new THREE.Color(f.shade),
    shadingToonyFactor: 0.85,
    shadingShiftFactor: -0.05,
    parametricRimColorFactor: new THREE.Color(f.rim),
    parametricRimFresnelPowerFactor: 3.5,
    rimLightingMixFactor: 0.6,
  });
  const outline = new MToonMaterial({
    isOutline: true,
    outlineWidthMode: MToonMaterialOutlineWidthMode.WorldCoordinates,
    outlineWidthFactor: 0.0025,
    outlineColorFactor: new THREE.Color('#1c1622'),
    outlineLightingMixFactor: 0,
    side: THREE.BackSide,
  });
  return [base, outline];
}

function shell(geo: THREE.BufferGeometry, finish: Finish, accent?: string): THREE.Mesh {
  geo.clearGroups();
  geo.addGroup(0, geo.index ? geo.index.count : geo.getAttribute('position').count, 0);
  geo.addGroup(0, geo.index ? geo.index.count : geo.getAttribute('position').count, 1);
  const mesh = new THREE.Mesh(geo, armorMaterial(finish, accent));
  mesh.castShadow = true;
  return mesh;
}

interface Rig {
  vrm: VRM;
  world(bone: VRMHumanBoneName): THREE.Vector3;
  node(bone: VRMHumanBoneName): THREE.Object3D;
  /** Forward (+Z of the character) in world space. */
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

function rigOf(vrm: VRM): Rig {
  vrm.scene.updateMatrixWorld(true);
  const node = (b: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(b) ?? vrm.humanoid.getRawBoneNode('hips')!;
  const q = vrm.scene.getWorldQuaternion(new THREE.Quaternion());
  // Characters face +Z after VRMUtils.rotateVRM0; their right side is -X.
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return {
    vrm,
    node,
    world: (b) => node(b).getWorldPosition(new THREE.Vector3()),
    fwd,
    right: new THREE.Vector3(-1, 0, 0).applyQuaternion(q),
    up: new THREE.Vector3(0, 1, 0),
  };
}

/** Place `obj` in world space, then parent it to `bone` keeping that transform. */
function mount(rig: Rig, bone: VRMHumanBoneName, obj: THREE.Object3D): void {
  // `obj` was positioned in world space; convert that into the model's space before parenting.
  const root = rig.vrm.scene;
  root.updateMatrixWorld(true);
  obj.updateMatrix();
  obj.matrix.premultiply(root.matrixWorld.clone().invert());
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  root.add(obj);
  obj.updateMatrixWorld(true);
  rig.node(bone).attach(obj);
}

/** Orient an object so its local +Y runs from a to b. */
function alongSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, t = 0.5): void {
  const dir = b.clone().sub(a).normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  obj.position.copy(a).lerp(b, t);
}

/** Tube around a limb segment (bracer, greave). */
function limbGuard(rig: Rig, from: VRMHumanBoneName, to: VRMHumanBoneName, start: number, end: number, rTop: number, rBottom: number, finish: Finish, trim?: Finish): void {
  const a = rig.world(from);
  const b = rig.world(to);
  const len = a.distanceTo(b);
  const g = new THREE.Group();
  // +Y runs toward `to`, so the cylinder's top radius is the one nearer `to` (rBottom).
  const tube = shell(new THREE.CylinderGeometry(rBottom, rTop, len * (end - start), 14, 1, true), finish);
  g.add(tube);
  if (trim) {
    for (const k of [-0.5, 0.5]) {
      const ring = shell(new THREE.TorusGeometry((k < 0 ? rTop : rBottom) + 0.004, 0.006, 6, 18), trim);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = k * len * (end - start);
      g.add(ring);
    }
  }
  alongSegment(g, a, b, (start + end) / 2);
  mount(rig, from, g);
}

/** Layered shoulder plates. */
function pauldron(rig: Rig, side: 'left' | 'right', finish: Finish, trim: Finish, scale = 1): void {
  const shoulder = rig.world(side === 'left' ? 'leftUpperArm' : 'rightUpperArm');
  const elbow = rig.world(side === 'left' ? 'leftLowerArm' : 'rightLowerArm');
  const out = elbow.clone().sub(shoulder).normalize();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = (0.095 - i * 0.012) * scale;
    const plate = shell(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), i === 0 ? finish : finish);
    plate.position.y = -i * 0.03 * scale;
    plate.position.x = i * 0.022 * scale;
    plate.scale.set(1.1, 0.55, 1.15);
    g.add(plate);
    const edge = shell(new THREE.TorusGeometry(r * Math.sin(Math.PI * 0.42), 0.005, 6, 24), trim);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = plate.position.y + r * Math.cos(Math.PI * 0.42) * 0.55;
    edge.position.x = plate.position.x;
    edge.scale.set(1.1, 1.15, 1);
    g.add(edge);
  }
  // Point the dome's top (+Y) outward-and-up from the shoulder.
  const dir = out.clone().multiplyScalar(0.55).add(rig.up.clone().multiplyScalar(0.85)).normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.position.copy(shoulder).addScaledVector(out, 0.03 * scale).addScaledVector(rig.up, -0.035 * scale);
  mount(rig, side === 'left' ? 'leftUpperArm' : 'rightUpperArm', g);
}

/** Curved plate on the chest. */
function breastplate(rig: Rig, finish: Finish, trim: Finish, width: number, height: number, depthOffset: number): void {
  const chest = rig.world('upperChest');
  const g = new THREE.Group();
  const span = Math.PI * 0.64;
  const top = Math.PI * 0.28;
  // Dome segment centred on +Z (phi = pi/2), from just below the collar down to the ribs.
  const plate = shell(new THREE.SphereGeometry(1, 28, 16, Math.PI / 2 - span / 2, span, top, Math.PI * 0.42), finish);
  plate.scale.set(width, height, 0.13);
  g.add(plate);
  // Trim along the top edge.
  const rimGeo = new THREE.TorusGeometry(1, 0.03, 6, 30, span);
  rimGeo.rotateZ(Math.PI / 2 - span / 2);
  rimGeo.rotateX(Math.PI / 2);
  const rim = shell(rimGeo, trim);
  rim.scale.set(width * Math.sin(top), 1, 0.13 * Math.sin(top));
  rim.position.y = height * Math.cos(top);
  g.add(rim);
  g.position.copy(chest).addScaledVector(rig.fwd, depthOffset).addScaledVector(rig.up, -0.08);
  g.lookAt(g.position.clone().add(rig.fwd));
  mount(rig, 'upperChest', g);
}

/** Belt with buckle and pouch around the hips. */
function belt(rig: Rig, radiusX: number, radiusZ: number, finish: Finish, buckle: Finish, height = 0.0): void {
  const hips = rig.world('hips');
  const g = new THREE.Group();
  const band = shell(new THREE.TorusGeometry(1, 0.11, 6, 40), finish);
  band.rotation.x = Math.PI / 2;
  band.scale.set(radiusX, radiusZ, 0.25);
  g.add(band);
  const b = shell(new THREE.BoxGeometry(0.06, 0.05, 0.015), buckle);
  b.position.set(0, 0, radiusZ + 0.01);
  g.add(b);
  const pouch = shell(new THREE.BoxGeometry(0.07, 0.08, 0.04), finish);
  pouch.position.set(radiusX * 0.75, -0.04, radiusZ * 0.6);
  pouch.rotation.y = 0.6;
  g.add(pouch);
  g.position.copy(hips).addScaledVector(rig.up, height);
  g.lookAt(g.position.clone().add(rig.fwd));
  mount(rig, 'hips', g);
}

/** A sheathed blade hanging from the left hip, tip down and back. */
function scabbard(rig: Rig, length: number, finish: Finish, fittings: Finish, slim = false): void {
  const hips = rig.world('hips');
  const g = new THREE.Group();
  const w = slim ? 0.022 : 0.04;
  const body = shell(new THREE.BoxGeometry(w, length, 0.022, 1, 1, 1), finish);
  g.add(body);
  const throat = shell(new THREE.BoxGeometry(w + 0.012, 0.06, 0.03), fittings);
  throat.position.y = length / 2 - 0.03;
  const chape = shell(new THREE.BoxGeometry(w + 0.01, 0.07, 0.03), fittings);
  chape.position.y = -length / 2 + 0.035;
  g.add(throat, chape);
  const grip = shell(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), 'darkLeather');
  grip.position.y = length / 2 + 0.1;
  const guard = shell(new THREE.BoxGeometry(slim ? 0.12 : 0.18, 0.02, 0.03), fittings);
  guard.position.y = length / 2 + 0.005;
  const pommel = shell(new THREE.SphereGeometry(0.022, 10, 8), fittings);
  pommel.position.y = length / 2 + 0.21;
  g.add(grip, guard, pommel);
  // Left hip is +X in the character's frame (right is -X). Hilt up and forward, tip down and back.
  const left = rig.right.clone().negate();
  const hiltDir = rig.up.clone().multiplyScalar(0.8).addScaledVector(rig.fwd, 0.55).addScaledVector(left, 0.08).normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hiltDir);
  g.position.copy(hips).addScaledVector(left, 0.19).addScaledVector(rig.fwd, -0.02).addScaledVector(rig.up, -0.12);
  mount(rig, 'hips', g);
}

/** Short cloth tabard panels hanging front and back from the belt. */
function tabard(rig: Rig, color: string, trim: string, length: number): void {
  const hips = rig.world('hips');
  for (const dir of [1, -1]) {
    const g = new THREE.Group();
    const cloth = shell(new THREE.PlaneGeometry(0.2, length, 1, 4), 'cloth', color);
    (cloth.material as MToonMaterial[])[0]!.side = THREE.DoubleSide;
    // Flare the panel out at the bottom.
    const pos = cloth.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = (length / 2 - y) / length;
      pos.setX(i, pos.getX(i) * (1 + k * 0.35));
      pos.setZ(i, k * k * 0.05);
    }
    cloth.geometry.computeVertexNormals();
    cloth.position.y = -length / 2;
    g.add(cloth);
    const hem = shell(new THREE.BoxGeometry(0.27, 0.015, 0.008), 'gold', trim);
    hem.position.y = -length + 0.01;
    hem.position.z = 0.05;
    g.add(hem);
    g.position.copy(hips).addScaledVector(rig.fwd, dir * 0.12).addScaledVector(rig.up, 0.03);
    g.lookAt(g.position.clone().addScaledVector(rig.fwd, dir));
    mount(rig, 'hips', g);
  }
}

// ---- The designs -------------------------------------------------------------------------------

/** "Vanguard": a front-line swordsman. Teal tunic with gold trim, steel and leather armor. */
export function dressVanguard(vrm: VRM): void {
  const mats = materialsByName(vrm);
  for (const m of find(mats, 'Tops')) {
    repaint(m, [
      { color: '#2f6f78' },
      { rect: [0.24, 0, 0.52, 0.42], color: '#24525a' },
      { rect: [0.09, 0.885, 0.82, 0.04], color: '#e8c36a' },
      { rect: [0.0, 0.385, 0.3, 0.04], color: '#e8c36a' },
      { rect: [0.7, 0.385, 0.3, 0.04], color: '#e8c36a' },
      { rect: [0.488, 0.46, 0.024, 0.43], color: '#e8c36a' },
    ]);
  }
  for (const m of find(mats, 'Bottoms')) repaint(m, [{ color: '#4a3a30' }]);
  for (const m of find(mats, 'Shoes')) repaint(m, [{ color: '#3a2a22' }]);
  tint(find(mats, 'HAIR'), '#b9a27a', '#6e5a40');
  tint(find(mats, 'EyeIris'), '#7fd0c0');
  const rig = rigOf(vrm);
  breastplate(rig, 'steel', 'gold', 0.19, 0.2, 0.1);
  pauldron(rig, 'left', 'steel', 'gold', 1.15);
  pauldron(rig, 'right', 'leather', 'gold', 0.85);
  limbGuard(rig, 'leftLowerArm', 'leftHand', 0.5, 0.98, 0.064, 0.054, 'darkLeather', 'gold');
  limbGuard(rig, 'rightLowerArm', 'rightHand', 0.5, 0.98, 0.064, 0.054, 'darkLeather', 'gold');
  limbGuard(rig, 'leftLowerLeg', 'leftFoot', 0.2, 0.72, 0.052, 0.044, 'steel', 'gold');
  limbGuard(rig, 'rightLowerLeg', 'rightFoot', 0.2, 0.72, 0.052, 0.044, 'steel', 'gold');
  belt(rig, 0.17, 0.12, 'leather', 'gold', 0.02);
  tabard(rig, '#7a1f2b', '#e8c36a', 0.32);
  scabbard(rig, 0.72, 'darkLeather', 'gold');
}

/** "Duelist": a fast fencer. Violet coat-dress with silver trim and light steel armor. */
export function dressDuelist(vrm: VRM): void {
  const mats = materialsByName(vrm);
  for (const m of find(mats, 'Tops')) {
    repaint(m, [
      { rect: [0, 0, 1, 0.52], color: '#5a3f8a' },
      { rect: [0, 0.52, 1, 0.46], color: '#4a3378', to: '#1f1a2e' },
      { rect: [0, 0.505, 1, 0.03], color: '#dfe4f0' },
      { rect: [0, 0.935, 1, 0.025], color: '#dfe4f0' },
      { rect: [0.0, 0.46, 0.27, 0.04], color: '#dfe4f0' },
      { rect: [0.74, 0.46, 0.26, 0.04], color: '#dfe4f0' },
    ]);
  }
  for (const m of find(mats, 'Shoes')) repaint(m, [{ color: '#2a2233' }]);
  tint(find(mats, 'HAIR'), '#d8d2e8', '#8a7fa8');
  tint(find(mats, 'EyeIris'), '#c49cff');
  const rig = rigOf(vrm);
  breastplate(rig, 'steel', 'gold', 0.15, 0.15, 0.085);
  pauldron(rig, 'left', 'steel', 'gold', 0.8);
  pauldron(rig, 'right', 'steel', 'gold', 0.8);
  limbGuard(rig, 'leftLowerArm', 'leftHand', 0.4, 0.95, 0.04, 0.034, 'steel', 'gold');
  limbGuard(rig, 'rightLowerArm', 'rightHand', 0.4, 0.95, 0.04, 0.034, 'steel', 'gold');
  belt(rig, 0.15, 0.11, 'darkLeather', 'gold', 0.06);
  scabbard(rig, 0.78, 'steel', 'gold', true);
}
