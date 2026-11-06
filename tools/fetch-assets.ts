// Downloads the CC0 KayKit art packs (by Kay Lousberg, www.kaylousberg.com) from their official
// GitHub repos into client/public/assets/kaykit/. Commits are pinned so every machine gets the
// same files. Files that already exist with the right size are skipped.
//
//   npm run fetch-assets
//
// Set GITHUB_TOKEN to raise the GitHub API rate limit if needed (3 API calls per run).
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Pack {
  /** Folder name under assets/kaykit/. */
  id: string;
  repo: string;
  sha: string;
  /** Repo path prefix -> destination subfolder. Only files directly inside the prefix are taken. */
  folders: Record<string, string>;
  /** File name filter. */
  match: RegExp;
}

const PACKS: Pack[] = [
  {
    id: 'adventurers',
    repo: 'KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
    sha: '672074b73ba276876a19e8816ecdc5241817ab47',
    folders: {
      'addons/kaykit_character_pack_adventures/Characters/gltf/': 'characters',
      'addons/kaykit_character_pack_adventures/Assets/gltf/': 'items',
    },
    match: /\.(glb|gltf|bin|png)$/,
  },
  {
    id: 'skeletons',
    repo: 'KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',
    sha: '15b62b9bad122f72926c10fb14d622c73819fa54',
    folders: {
      'addons/kaykit_character_pack_skeletons/Characters/gltf/': 'characters',
      'addons/kaykit_character_pack_skeletons/Assets/gltf/': 'items',
    },
    match: /\.(glb|gltf|bin|png)$/,
  },
  {
    id: 'dungeon',
    repo: 'KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0',
    sha: 'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07',
    folders: {
      'addons/kaykit_dungeon_remastered/Assets/gltf/': 'pieces',
    },
    match: /\.(glb|gltf|bin|png)$/,
  },
];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'client/public/assets/kaykit');

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

async function listTree(pack: Pack): Promise<TreeEntry[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': '100-floors-fetch-assets' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${pack.repo}/git/trees/${pack.sha}?recursive=1`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${pack.repo}: ${await res.text()}`);
  const body = (await res.json()) as { tree: TreeEntry[]; truncated: boolean };
  if (body.truncated) console.warn(`warning: tree listing for ${pack.repo} was truncated`);
  return body.tree;
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function download(url: string, dest: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      return;
    } catch (err) {
      if (attempt >= 3) throw new Error(`download failed: ${url}: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  let fetched = 0;
  let skipped = 0;
  let bytes = 0;
  const manifest: Record<string, string[]> = {};
  for (const pack of PACKS) {
    const tree = await listTree(pack);
    const jobs: { url: string; dest: string; size: number; rel: string }[] = [];
    for (const entry of tree) {
      if (entry.type !== 'blob') continue;
      for (const [prefix, sub] of Object.entries(pack.folders)) {
        if (!entry.path.startsWith(prefix)) continue;
        const name = entry.path.slice(prefix.length);
        if (name.includes('/') || !pack.match.test(name)) continue;
        const rel = `${pack.id}/${sub}/${name}`;
        jobs.push({
          url: `https://raw.githubusercontent.com/${pack.repo}/${pack.sha}/${entry.path}`,
          dest: join(OUT, rel),
          size: entry.size ?? -1,
          rel,
        });
      }
    }
    manifest[pack.id] = jobs.map((j) => j.rel).sort();
    await runPool(jobs, 6, async (job) => {
      if ((await sizeOf(job.dest)) === job.size) {
        skipped++;
        return;
      }
      await download(job.url, job.dest);
      fetched++;
      bytes += job.size;
    });
    console.log(`${pack.id}: ${jobs.length} files`);
  }
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`done: ${fetched} downloaded (${(bytes / 1e6).toFixed(1)} MB), ${skipped} already present -> ${OUT}`);
  console.log('KayKit packs by Kay Lousberg (www.kaylousberg.com), CC0.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
