// Downloads the art used by the look test (client/lookdev.html) into client/public/assets/.
// Everything here is free to use in the game:
//   - vrm/: VRoid HairSample_Male/Female (CC0, via madjin/vrm-samples) and pixiv's
//     VRM1_Constraint_Twist_Sample (VRM Public License 1.0: commercial use and redistribution OK).
//   - anim/: Quaternius Universal Animation Library 1 and 2 (CC0, opengameart.org).
//   - village/: Quaternius Medieval Village MegaKit (CC0, opengameart.org).
//   - polyhaven/: textures, models and the sky HDRI from Poly Haven (CC0).
// Files that already exist are skipped. Needs `unzip` on PATH (macOS and Linux have it).
//
//   npm run fetch-lookdev-assets
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.ASSETS_OUT ? resolve(process.env.ASSETS_OUT) : join(ROOT, 'client/public/assets');
const UA = { 'User-Agent': '100-floors-fetch-assets' };

interface PinnedFile {
  url: string;
  dest: string;
  sha256: string;
}

const VRM: PinnedFile[] = [
  {
    url: 'https://raw.githubusercontent.com/madjin/vrm-samples/e16eb187100149a315ad92c3c9968f1d5baa6c7d/vroid/beta/HairSample_Male.vrm',
    dest: 'vrm/HairSample_Male.vrm',
    sha256: '7aeca142dabbc26ba0f5b9c998c8f3cb6df341287d67788427ac837223785a3f',
  },
  {
    url: 'https://raw.githubusercontent.com/madjin/vrm-samples/e16eb187100149a315ad92c3c9968f1d5baa6c7d/vroid/beta/HairSample_Female.vrm',
    dest: 'vrm/HairSample_Female.vrm',
    sha256: 'adfd242317aaabc773f31f7fff7b013979fbb5baa47e97427a78913d9cb4e979',
  },
  {
    url: 'https://raw.githubusercontent.com/pixiv/three-vrm/3caf7a21ee68f0d5dfa363ab3d577450bbf60136/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
    dest: 'vrm/pixiv_sample.vrm',
    sha256: '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2',
  },
];

interface ZipPack {
  url: string;
  /** Path inside the zip (file, or folder ending in "/") -> destination under assets/. */
  take: Record<string, string>;
  /** Expected hashes of extracted files, by destination. */
  sha256?: Record<string, string>;
}

const OGA = 'https://opengameart.org/sites/default/files';
const ZIPS: ZipPack[] = [
  {
    url: `${OGA}/universal_animation_librarystandard.zip`,
    take: { 'Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb': 'anim/UAL1.glb' },
    sha256: { 'anim/UAL1.glb': '1b7bf67866360665426bb99e4c71bd619f19b408453c24e30f0c3071601eee5c' },
  },
  {
    url: `${OGA}/universal_animation_library_2standard.zip`,
    take: { 'Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb': 'anim/UAL2.glb' },
    sha256: { 'anim/UAL2.glb': '0815dd05531cae9bc313fc9c0ba81330bc72f8e19ec45f73738e74ddc5796a43' },
  },
  {
    url: `${OGA}/medieval_village_megakitstandard.zip`,
    take: { 'glTF/': 'village/', 'License_Standard.txt': 'village/LICENSE.txt' },
  },
];

const POLYHAVEN = {
  textures: [
    'cobblestone_floor_01',
    'grass_path_2',
    'forest_ground_04',
    'castle_brick_07',
    'leafy_grass',
    'grass_ground',
    'mossy_cobblestone',
    'large_sandstone_blocks_01',
    'sandstone_cracks',
    'granite_tile',
  ],
  models: ['boulder_01', 'rock_moss_set_01', 'fern_02', 'grass_medium_01', 'antique_katana_01'],
  hdri: { name: 'kloofendal_48d_partly_cloudy_puresky', res: '2k' },
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function save(dest: string, data: Buffer): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, data);
}

async function fetchVrm(): Promise<void> {
  for (const f of VRM) {
    const dest = join(OUT, f.dest);
    if (await exists(dest)) continue;
    const data = await download(f.url);
    if (sha256(data) !== f.sha256) throw new Error(`checksum mismatch for ${f.dest}`);
    await save(dest, data);
    console.log('vrm', f.dest);
  }
}

async function fetchZips(): Promise<void> {
  for (const z of ZIPS) {
    const dests = Object.values(z.take).map((d) => join(OUT, d));
    if ((await Promise.all(dests.map(exists))).every(Boolean)) continue;
    const tmp = await mkdtemp(join(tmpdir(), 'floors-assets-'));
    try {
      const zip = join(tmp, basename(z.url));
      await writeFile(zip, await download(z.url));
      execFileSync('unzip', ['-q', '-o', zip, '-d', join(tmp, 'x')]);
      for (const [from, to] of Object.entries(z.take)) {
        const src = join(tmp, 'x', from);
        const dest = join(OUT, to);
        await mkdir(from.endsWith('/') ? dest : dirname(dest), { recursive: true });
        if (from.endsWith('/')) {
          for (const name of await readdir(src)) await cp(join(src, name), join(dest, name), { recursive: true });
        } else {
          await cp(src, dest);
        }
        const want = z.sha256?.[to];
        if (want && sha256(await readFile(dest)) !== want) throw new Error(`checksum mismatch for ${to}`);
      }
      console.log('pack', basename(z.url));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}

async function phJson<T>(id: string): Promise<T> {
  return JSON.parse((await download(`https://api.polyhaven.com/files/${id}`)).toString()) as T;
}

type PhFile = { url: string };
async function fetchPolyHaven(): Promise<void> {
  const base = join(OUT, 'polyhaven');
  for (const tex of POLYHAVEN.textures) {
    const kinds = [
      ['Diffuse', 'diff'],
      ['nor_gl', 'nor'],
      ['arm', 'arm'],
    ] as const;
    const dests = kinds.map(([, key]) => join(base, 'textures', `${tex}_${key}.jpg`));
    if ((await Promise.all(dests.map(exists))).every(Boolean)) continue;
    const files = await phJson<Record<string, Record<string, Record<string, PhFile>>>>(tex);
    for (const [i, [kind]] of kinds.entries()) await save(dests[i]!, await download(files[kind]!['1k']!['jpg']!.url));
    console.log('texture', tex);
  }
  for (const model of POLYHAVEN.models) {
    const dir = join(base, 'models', model);
    if (await exists(dir)) continue;
    type Gltf = { url: string; include: Record<string, PhFile> };
    const g = (await phJson<{ gltf: Record<string, { gltf: Gltf }> }>(model)).gltf['1k']!.gltf;
    await save(join(dir, basename(g.url)), await download(g.url));
    for (const [rel, info] of Object.entries(g.include)) await save(join(dir, rel), await download(info.url));
    console.log('model', model);
  }
  const { name, res } = POLYHAVEN.hdri;
  const hdr = join(base, 'hdri', `${name}_${res}.hdr`);
  if (!(await exists(hdr))) {
    const files = await phJson<{ hdri: Record<string, Record<string, PhFile>> }>(name);
    await save(hdr, await download(files.hdri[res]!['hdr']!.url));
    console.log('hdri', name);
  }
}

await fetchVrm();
await fetchZips();
await fetchPolyHaven();
console.log('look-test assets ready in', OUT);
