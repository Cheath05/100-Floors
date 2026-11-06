// Builds the visible world for a map from the same data the server collides with.
import * as THREE from 'three';
import type { MapDef, Prop } from '@floors/shared';
import { noiseTexture, plazaTexture, setOutline, toonMaterial } from './toon';

function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const mats = {
  stone: () => toonMaterial({ color: '#a7a1b0' }),
  darkStone: () => toonMaterial({ color: '#5b5566' }),
  wood: () => toonMaterial({ color: '#7a5235' }),
  metal: () => toonMaterial({ color: '#3d3a44' }),
};

function shadowAll(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

/** Animated portal surface for the Teleport Gate. */
function portalMaterial(): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 9.0 - time * 2.4) * 0.5 + 0.5;
        float edge = smoothstep(1.0, 0.6, r);
        vec3 col = mix(vec3(0.25, 0.55, 0.95), vec3(0.85, 1.15, 1.35), swirl * (1.0 - r));
        gl_FragColor = vec4(col, edge * (0.35 + 0.3 * swirl));
      }`,
  });
  setOutline(mat, 0);
  return mat;
}

function buildGate(): { group: THREE.Group; portal: THREE.ShaderMaterial } {
  const g = new THREE.Group();
  const stone = mats.stone();
  for (const x of [-2.4, 2.4]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.7), mats.darkStone());
    base.position.set(x, 0.3, 0);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.4, 1.2), stone);
    pillar.position.set(x, 3.3, 0);
    g.add(base, pillar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.5, 8, 24, Math.PI), stone);
  arch.position.y = 6;
  g.add(arch);
  const keystone = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    toonMaterial({ color: '#7fd4ff', emissive: '#3aa8ff', emissiveIntensity: 2.2 }),
  );
  keystone.position.y = 8.9;
  g.add(keystone);
  const portal = portalMaterial();
  const plane = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), portal);
  plane.position.y = 3.6;
  plane.scale.y = 1.55;
  g.add(plane);
  shadowAll(g);
  plane.castShadow = false;
  return { group: g, portal };
}

function buildBuilding(p: Prop): THREE.Group {
  const r = seeded(p.seed);
  const g = new THREE.Group();
  const w = p.w ?? 6;
  const h = p.size;
  const walls = ['#efe2c8', '#e4d3b1', '#f3ead9', '#dccab0', '#e9d9c4'];
  const roofs = ['#b4463c', '#3f6aa8', '#7b4a8c', '#2f7d6b', '#c07a2c'];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), toonMaterial({ color: walls[Math.floor(r() * walls.length)]! }));
  body.position.y = h / 2;
  g.add(body);
  // Timber trim.
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.35, w + 0.2), mats.wood());
  trim.position.y = h * 0.45;
  g.add(trim);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(w * 0.82, 2.6 + r() * 1.6, 4),
    toonMaterial({ color: roofs[Math.floor(r() * roofs.length)]! }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + (roof.geometry as THREE.ConeGeometry).parameters.height / 2;
  g.add(roof);
  // Door and windows on the side facing the plaza.
  const face = new THREE.Group();
  const toCenter = Math.atan2(-p.x, -p.z);
  const side = Math.round(toCenter / (Math.PI / 2)) * (Math.PI / 2);
  face.rotation.y = side;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.12), mats.wood());
  door.position.set(0, 1.05, w / 2 + 0.05);
  face.add(door);
  const winMat = toonMaterial({ color: '#ffe7a3', emissive: '#ffc95a', emissiveIntensity: 0.5 });
  for (const wx of [-w * 0.3, w * 0.3]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), winMat);
    win.position.set(wx, h * 0.68, w / 2 + 0.05);
    face.add(win);
  }
  g.add(face);
  g.position.set(p.x, 0, p.z);
  shadowAll(g);
  return g;
}

function buildLamp(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8), mats.metal());
  post.position.y = 1.6;
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.55, 0.42),
    toonMaterial({ color: '#fff1c4', emissive: '#ffcf6b', emissiveIntensity: 1.6 }),
  );
  lantern.position.y = 3.4;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.3, 4), mats.metal());
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 3.82;
  g.add(post, lantern, cap);
  g.position.set(p.x, 0, p.z);
  shadowAll(g);
  return g;
}

function buildFountain(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.7, 24), mats.stone());
  basin.position.y = 0.35;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.95, 24),
    toonMaterial({ color: '#6cc6ff', emissive: '#2c8fd6', emissiveIntensity: 0.4, outline: 0 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.66;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.8, 10), mats.stone());
  column.position.y = 1.2;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.4, 0.35, 16), mats.stone());
  bowl.position.y = 2.1;
  g.add(basin, water, column, bowl);
  g.position.set(p.x, 0, p.z);
  shadowAll(g);
  return g;
}

function buildTree(p: Prop): THREE.Group {
  const r = seeded(p.seed + 11);
  const g = new THREE.Group();
  const s = p.size;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 2.4 * s, 7), mats.wood());
  trunk.position.y = 1.2 * s;
  g.add(trunk);
  const greens = ['#4f9a3e', '#5aa847', '#3f8a3a', '#6bb24f'];
  const layers = 2 + Math.floor(r() * 2);
  for (let i = 0; i < layers; i++) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry((1.5 - i * 0.3) * s, 0),
      toonMaterial({ color: greens[Math.floor(r() * greens.length)]! }),
    );
    blob.position.set((r() - 0.5) * 0.5 * s, (2.6 + i * 1.0) * s, (r() - 0.5) * 0.5 * s);
    blob.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(blob);
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rot;
  shadowAll(g);
  return g;
}

function buildRock(p: Prop): THREE.Mesh {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0 * p.size, 0), toonMaterial({ color: '#8d8a93' }));
  rock.scale.y = 0.65;
  rock.position.set(p.x, 0.35 * p.size, p.z);
  rock.rotation.y = p.rot;
  rock.castShadow = rock.receiveShadow = true;
  return rock;
}

function buildPillar(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 12, 10), mats.darkStone());
  shaft.position.y = 6;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2), mats.darkStone());
  base.position.y = 0.3;
  g.add(shaft, base);
  // Torch with a real light on every other pillar.
  const torch = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.5, 6),
    toonMaterial({ color: '#ffb347', emissive: '#ff7b1a', emissiveIntensity: 2.5, outline: 0 }),
  );
  const inward = p.x < 0 ? 1 : -1;
  torch.position.set(inward * 0.95, 3.2, 0);
  torch.rotation.z = Math.PI;
  g.add(torch);
  if (p.seed % 2 === 0) {
    const light = new THREE.PointLight('#ff9a4a', 18, 16, 1.6);
    light.position.set(inward * 1.3, 3.2, 0);
    g.add(light);
  }
  g.position.set(p.x, 0, p.z);
  shadowAll(g);
  return g;
}

export interface WorldView {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

export function buildWorld(map: MapDef): WorldView {
  const group = new THREE.Group();
  const animated: THREE.ShaderMaterial[] = [];

  // Ground.
  if (map.ground === 'stone') {
    const b = map.bounds.kind === 'rect' ? map.bounds : { halfX: 30, halfZ: 30 };
    const floorTex = noiseTexture('#57525f', ['#4a4652', '#625d6b', '#433f4b'], 256, 1600, 9, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.halfX * 2, b.halfZ * 2), toonMaterial({ map: floorTex, outline: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const wallMat = toonMaterial({ color: '#3f3a48', outline: 0 });
    const H = 14;
    const walls: [number, number, number, number][] = [
      [0, -b.halfZ - 0.5, b.halfX * 2 + 2, 1],
      [0, b.halfZ + 0.5, b.halfX * 2 + 2, 1],
      [-b.halfX - 0.5, 0, 1, b.halfZ * 2],
      [b.halfX + 0.5, 0, 1, b.halfZ * 2],
    ];
    for (const [x, z, w, d] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
      wall.position.set(x, H / 2, z);
      wall.receiveShadow = true;
      group.add(wall);
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(b.halfX * 2 + 2, b.halfZ * 2 + 2), toonMaterial({ color: '#25212b', outline: 0 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    group.add(ceiling);
  } else {
    const grassTex = noiseTexture('#6da84f', ['#5f9a43', '#7bb85a', '#58903e', '#86c063'], 256, 2200, 4, 60);
    const grass = new THREE.Mesh(new THREE.CircleGeometry(400, 64), toonMaterial({ map: grassTex, outline: 0 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    group.add(grass);
    if (map.ground === 'plaza') {
      const plazaR = 27;
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(plazaR, 64), toonMaterial({ map: plazaTexture(), outline: 0 }));
      plaza.rotation.x = -Math.PI / 2;
      plaza.position.y = 0.02;
      plaza.receiveShadow = true;
      group.add(plaza);
      // Streets out through the gaps in the building ring.
      const streetTex = noiseTexture('#a89f90', ['#988f80', '#b6ad9e'], 128, 500, 5, 4);
      for (let i = 0; i < 4; i++) {
        const street = new THREE.Mesh(new THREE.PlaneGeometry(7, 20), toonMaterial({ map: streetTex, outline: 0 }));
        street.rotation.x = -Math.PI / 2;
        const a = (i * Math.PI) / 2;
        street.rotation.z = a;
        street.position.set(Math.sin(a) * 34, 0.015, Math.cos(a) * 34);
        street.receiveShadow = true;
        group.add(street);
      }
    }
    if (map.bounds.kind === 'circle') {
      // A low ring of hedges/rocks marks the edge of the walkable area.
      const r = map.bounds.r;
      const n = Math.floor(r * 1.2);
      const edgeMat = toonMaterial({ color: map.ground === 'plaza' ? '#4f8a3d' : '#7c7a82' });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), edgeMat);
        m.position.set(Math.sin(a) * (r + 0.6), 0.5, Math.cos(a) * (r + 0.6));
        m.rotation.set(i, i * 2, i * 3);
        m.castShadow = true;
        group.add(m);
      }
    }
  }

  for (const p of map.props) {
    switch (p.kind) {
      case 'gate': {
        const gate = buildGate();
        gate.group.position.set(p.x, 0, p.z);
        gate.group.rotation.y = p.rot;
        animated.push(gate.portal);
        group.add(gate.group);
        break;
      }
      case 'building':
        group.add(buildBuilding(p));
        break;
      case 'lamp':
        group.add(buildLamp(p));
        break;
      case 'fountain':
        group.add(buildFountain(p));
        break;
      case 'tree':
        group.add(buildTree(p));
        break;
      case 'rock':
        group.add(buildRock(p));
        break;
      case 'pillar':
        group.add(buildPillar(p));
        break;
    }
  }

  return {
    group,
    update(time) {
      for (const m of animated) m.uniforms.time!.value = time;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material;
          (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
        }
      });
    },
  };
}
