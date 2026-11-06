// Original town dressing modeled in code: market stalls, banners, lanterns, planters, barrels,
// distant mountains and the underside of the floor above. PBR materials so they sit with the kit.
import * as THREE from 'three';

const wood = new THREE.MeshStandardMaterial({ color: '#6b4a30', roughness: 0.8 });
const darkWood = new THREE.MeshStandardMaterial({ color: '#3f2b1d', roughness: 0.85 });
const iron = new THREE.MeshStandardMaterial({ color: '#2d2c30', roughness: 0.5, metalness: 0.7 });
const stone = new THREE.MeshStandardMaterial({ color: '#9a948c', roughness: 0.9 });
const soil = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 1 });

function shadows<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}

function stripes(a: string, b: string, n = 6): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * c.width) / n, 0, c.width / n + 1, c.height);
  }
  // Scalloped hem.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n * 2; i++) {
    g.beginPath();
    g.arc(((i + 0.5) * c.width) / (n * 2), c.height + 4, c.width / (n * 4), 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wind-blown cloth (banners, awnings) via a vertex sway. */
function clothMaterial(map: THREE.Texture, time: { value: number }, amp = 0.08): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.9, transparent: true, alphaTest: 0.5 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float k = clamp(1.0 - uv.y, 0.0, 1.0);
       transformed.z += sin(uTime * 2.2 + position.x * 3.0 + position.y * 2.0) * ${amp.toFixed(3)} * k;`,
    );
  };
  return mat;
}

export interface Dressing {
  group: THREE.Group;
  update(t: number): void;
}

export function marketStall(x: number, z: number, rotY: number, colors: [string, string], time: { value: number }, seed: number): THREE.Group {
  const g = new THREE.Group();
  const w = 2.6;
  const d = 1.6;
  for (const [px, pz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, pz < 0 ? 2.6 : 2.2, 0.1), wood);
    post.position.set(px, (pz < 0 ? 2.6 : 2.2) / 2, pz);
    g.add(post);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.7), darkWood);
  counter.position.set(0, 0.45, d / 2 - 0.35);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.06, 0.8), wood);
  top.position.set(0, 0.92, d / 2 - 0.35);
  g.add(counter, top);
  // Sloped striped awning with a scalloped front.
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, d + 0.7, 8, 4), clothMaterial(stripes(colors[0], colors[1]), time, 0.03));
  awning.rotation.x = -Math.PI / 2 + 0.28;
  awning.position.set(0, 2.45, 0.1);
  g.add(awning);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, 0.35, 8, 2), clothMaterial(stripes(colors[0], colors[1]), time, 0.04));
  valance.position.set(0, 2.05, d / 2 + 0.45);
  g.add(valance);
  // Goods: crates of produce, cloth bolts, jars.
  let s = seed * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const goods = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#8e44ad', '#d35400'];
  for (let i = 0; i < 5; i++) {
    const kind = rnd();
    let item: THREE.Mesh;
    if (kind < 0.4) {
      item = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: goods[i % goods.length], roughness: 0.6 }));
      item.position.y = 1.03;
    } else if (kind < 0.7) {
      item = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), new THREE.MeshStandardMaterial({ color: goods[(i + 2) % goods.length], roughness: 0.9 }));
      item.rotation.z = Math.PI / 2;
      item.position.y = 1.03;
    } else {
      item = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#c9b79c', roughness: 0.4 }));
      item.position.y = 1.06;
    }
    item.position.x = -w / 2 + 0.35 + i * ((w - 0.7) / 4);
    item.position.z = d / 2 - 0.35 + (rnd() - 0.5) * 0.3;
    g.add(item);
  }
  g.add(barrel(-w / 2 - 0.4, -0.2), barrel(w / 2 + 0.35, 0.1, 0.9));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return shadows(g);
}

export function barrel(x: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 16, 4), wood);
  // Bulge the middle.
  const pos = body.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + 0.12 * (1 - (y / 0.45) ** 2);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  body.geometry.computeVertexNormals();
  body.position.y = 0.45;
  g.add(body);
  for (const y of [0.15, 0.75]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.015, 6, 24), iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return shadows(g);
}

export function banner(x: number, z: number, rotY: number, color: string, emblem: string, time: { value: number }): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 8), darkWood);
  pole.position.y = 3.5;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.3 }));
  finial.position.y = 7.15;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), iron);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0.7, 6.6, 0);
  g.add(pole, finial, bar);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 384;
  const cg = c.getContext('2d')!;
  cg.fillStyle = color;
  cg.fillRect(0, 0, 128, 340);
  cg.beginPath();
  cg.moveTo(0, 340);
  cg.lineTo(64, 384);
  cg.lineTo(128, 340);
  cg.fill();
  cg.strokeStyle = '#e8c36a';
  cg.lineWidth = 6;
  cg.strokeRect(8, 8, 112, 320);
  // Original emblem: a stylised tower with a ring (the "100 Floors" crest).
  cg.fillStyle = emblem;
  cg.fillRect(54, 90, 20, 120);
  cg.beginPath();
  cg.moveTo(40, 90);
  cg.lineTo(64, 55);
  cg.lineTo(88, 90);
  cg.fill();
  cg.lineWidth = 7;
  cg.strokeStyle = emblem;
  cg.beginPath();
  cg.ellipse(64, 150, 42, 14, 0, 0, Math.PI * 2);
  cg.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.6, 4, 10), clothMaterial(tex, time, 0.12));
  cloth.position.set(0.7, 6.6 - 1.8, 0);
  g.add(cloth);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return shadows(g);
}

export function lampPost(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 8), stone);
  base.position.y = 0.2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), iron);
  post.position.y = 2.1;
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 6, 12, Math.PI / 2), iron);
  arm.position.set(0.35, 3.75, 0);
  arm.rotation.z = Math.PI / 2;
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.38, 6, 1, true), iron);
  cage.material = iron.clone();
  (cage.material as THREE.MeshStandardMaterial).wireframe = true;
  cage.position.set(0.7, 3.55, 0);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb347', emissiveIntensity: 3 }));
  glow.position.copy(cage.position);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 6), iron);
  cap.position.set(0.7, 3.84, 0);
  g.add(base, post, arm, cage, glow, cap);
  g.position.set(x, 0, z);
  return shadows(g);
}

export function planter(x: number, z: number, rotY: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.6), stone);
  box.position.y = 0.25;
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.5), soil);
  dirt.position.y = 0.49;
  g.add(box, dirt);
  const colors = ['#e84a5f', '#ffd166', '#f78fb3', '#ffffff', '#9b5de5', '#ff8c42'];
  const leaf = new THREE.MeshStandardMaterial({ color: '#3f7d2c', roughness: 0.8 });
  let s = seed * 104729 + 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const px = (rnd() - 0.5) * 1.6;
    const pz = (rnd() - 0.5) * 0.45;
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + rnd() * 0.06, 0), leaf);
    bush.position.set(px, 0.56, pz);
    g.add(bush);
    const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshStandardMaterial({ color: colors[Math.floor(rnd() * colors.length)], roughness: 0.6 }));
    flower.position.set(px + (rnd() - 0.5) * 0.08, 0.66 + rnd() * 0.08, pz + (rnd() - 0.5) * 0.08);
    g.add(flower);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return shadows(g);
}

/** A ring of hazy mountains on the far horizon. */
export function mountains(radius: number): THREE.Mesh {
  const seg = 160;
  const geo = new THREE.CylinderGeometry(radius, radius, 1, seg, 12, true);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i) + 0.5; // 0..1
    const a = Math.atan2(x, z);
    const h = 55 + 40 * Math.sin(a * 3 + 1) + 28 * Math.sin(a * 7 + 2) + 14 * Math.sin(a * 17) + 6 * Math.sin(a * 41);
    const peak = Math.max(10, h);
    const height = y * peak;
    // Lean the slopes inward so ridges read as mountains, not a wall.
    const inward = 1 - y * 0.18;
    pos.setXYZ(i, x * inward, height, z * inward);
  }
  geo.computeVertexNormals();
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    c.set(h > 72 ? '#f4f7fb' : h > 38 ? '#6f8aa6' : '#56745e');
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
  return mesh;
}

/** The underside of the next floor: a vast rock-and-iron ceiling high above, open at the rim. */
export function floorAbove(height: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const cg = c.getContext('2d')!;
  cg.fillStyle = '#5b5866';
  cg.fillRect(0, 0, 1024, 1024);
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    cg.fillStyle = `rgba(${40 + rnd() * 60},${38 + rnd() * 55},${50 + rnd() * 60},${0.25 + rnd() * 0.4})`;
    const r = 2 + rnd() * 18;
    cg.beginPath();
    cg.arc(rnd() * 1024, rnd() * 1024, r, 0, Math.PI * 2);
    cg.fill();
  }
  // Structural ribs radiating from the centre.
  cg.strokeStyle = 'rgba(30,28,38,0.6)';
  cg.lineWidth = 10;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    cg.beginPath();
    cg.moveTo(512, 512);
    cg.lineTo(512 + Math.cos(a) * 520, 512 + Math.sin(a) * 520);
    cg.stroke();
  }
  for (let r = 80; r < 512; r += 70) {
    cg.beginPath();
    cg.arc(512, 512, r, 0, Math.PI * 2);
    cg.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false, color: '#b9b6c8' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  g.add(ceiling);
  // Hanging rock formations under it.
  const rockMat = new THREE.MeshLambertMaterial({ color: '#8d89a0', flatShading: true, fog: false });
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * radius * 0.85;
    const size = 20 + rnd() * 45;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(size, size * (1.5 + rnd() * 2), 6), rockMat);
    rock.rotation.x = Math.PI;
    rock.position.set(Math.sin(a) * d, height - size, Math.cos(a) * d);
    g.add(rock);
  }
  return g;
}
