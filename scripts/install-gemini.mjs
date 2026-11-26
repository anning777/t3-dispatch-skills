// Installs the Gemini-orchestrator setup for Antigravity (Gemini) in T3 Code: copies the always-on rule into
// <gemini config>/rules/ and each skill into <gemini config>/skills/. T3 Code links its Antigravity provider's
// rules and skills folders to ~/.gemini/config, which is the default destination.
//
// Ownership is tracked in <gemini config>/.t3-dispatch-skills.json, a manifest of every file it wrote and that
// file's content hash. It only replaces or removes files listed there whose content is unchanged; files the user
// edited, added or copied elsewhere are kept. If anything it would write already exists and is not its own, or a
// manifest with that name is not one it wrote, it stops before writing anything. It never writes or deletes through
// a symbolic link or junction below <dest>/rules or <dest>/skills, so nothing outside those folders is touched.
// Usage: node scripts/install-gemini.mjs [--lang zh|en] [--dest <gemini config dir>]
//        node scripts/install-gemini.mjs --uninstall [--dest <gemini config dir>]
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST = '.t3-dispatch-skills.json';
const RULE = 'rules/t3-dispatch-skills.md';
export const DEFAULT_DEST = path.join(homedir(), '.gemini', 'config');

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// The manifest, or null when a file with that name exists but is not one this installer wrote.
function readManifest(dest) {
  const file = path.join(dest, MANIFEST);
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    return { files: {}, pending: {} }; // no manifest yet
  }
  if (!stat.isFile()) return null; // a link or folder: never read or write through it
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    // files: what each installed file held when written. pending: the new content of a file being replaced right now,
    // so a file replaced just before a failed manifest save is still recognised as ours.
    const map = (value) =>
      value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.entries(value).every(
        ([rel, sum]) => /^(rules|skills)\/[^\\]+$/.test(rel) && !rel.split('/').includes('..') && /^[0-9a-f]{64}$/.test(sum),
      );
    const valid = manifest?.package === 't3-dispatch-skills' && map(manifest.files) && (manifest.pending === undefined || map(manifest.pending));
    return valid ? { ...manifest, pending: manifest.pending ?? {} } : null;
  } catch {
    return null;
  }
}

// True when the target, or any folder between <dest>/rules or <dest>/skills and it, is a symbolic link or junction.
function linked(dest, rel) {
  const parts = rel.split('/');
  for (let i = 1; i < parts.length; i += 1) {
    try {
      if (lstatSync(path.join(dest, ...parts.slice(0, i + 1))).isSymbolicLink()) return true;
    } catch {
      return false; // does not exist yet
    }
  }
  return false;
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

// Package files as { target path relative to dest: source file }.
function packageFiles(root, lang) {
  const edition = path.join(root, lang);
  if (!['zh', 'en'].includes(lang) || !existsSync(path.join(edition, 'gemini-rules.md'))) throw new Error(`unknown edition / 未知版本: ${lang}`);
  const files = { [RULE]: path.join(edition, 'gemini-rules.md') };
  const skills = path.join(edition, 'skills');
  for (const name of readdirSync(skills).sort()) {
    if (!existsSync(path.join(skills, name, 'SKILL.md'))) continue;
    for (const rel of listFiles(path.join(skills, name))) files[`skills/${name}/${rel}`] = path.join(skills, name, rel);
  }
  return files;
}

// Writes a file whole or not at all: a failure leaves any earlier version in place and no partial file. The temporary
// file has a fresh random name and is created new, so no existing file is ever overwritten or moved through it.
export function writeWhole(file, data) {
  const temp = `${file}.${process.pid}-${randomBytes(6).toString('hex')}.t3ds-tmp`;
  let created = false;
  try {
    const fd = openSync(temp, 'wx');
    created = true;
    try {
      writeFileSync(fd, data);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  } catch (err) {
    if (created) rmSync(temp, { force: true });
    throw err;
  }
}

// Removes now-empty folders from a file's folder up to (not including) dest/skills or dest/rules.
function pruneEmpty(dest, rel) {
  let dir = path.dirname(path.join(dest, rel));
  const stops = new Set([path.join(dest, 'skills'), path.join(dest, 'rules'), dest]);
  while (!stops.has(dir) && existsSync(dir) && lstatSync(dir).isDirectory() && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

// write replaces writeWhole only in tests, to make a chosen write fail.
export function installGemini({ lang = 'zh', dest = DEFAULT_DEST, root = ROOT, write = writeWhole } = {}) {
  const files = packageFiles(root, lang);
  const manifest = readManifest(dest);
  if (!manifest) return [{ name: MANIFEST, status: 'conflict' }]; // nothing written
  const owned = manifest.files;
  const ours = (rel, file) => [owned[rel], manifest.pending[rel]].includes(hash(file));
  const plan = [];
  const conflicts = [];
  // A skill folder that exists but holds none of our files belongs to someone else.
  for (const name of new Set(Object.keys(files).filter((rel) => rel.startsWith('skills/')).map((rel) => rel.split('/')[1]))) {
    const dir = path.join(dest, 'skills', name);
    if (existsSync(dir) && !Object.keys(owned).some((rel) => rel.startsWith(`skills/${name}/`))) conflicts.push({ name: `skills/${name}`, status: 'conflict' });
  }
  for (const [rel, from] of Object.entries(files)) {
    const to = path.join(dest, rel);
    if (linked(dest, rel)) conflicts.push({ name: rel, status: 'conflict' });
    else if (!existsSync(to)) plan.push({ rel, from, status: 'installed' });
    else if (!(rel in owned)) conflicts.push({ name: rel, status: 'conflict' });
    else if (ours(rel, to)) plan.push({ rel, from, status: 'updated' });
    else plan.push({ rel, from, status: 'kept' }); // the user edited our file: leave it
  }
  if (conflicts.length > 0) return [...new Map(conflicts.map((c) => [c.name, c])).values()]; // nothing written

  // The manifest always lists every file that may be on disk, so a retry or --uninstall recognises everything even
  // after a write fails halfway: new files are recorded before anything is written, each file's new content is recorded
  // as pending before it is replaced, each file is written whole or not at all, and the manifest is saved again after
  // every file. The always-on rule is written last, after all the skills it refers to.
  const next = { ...owned };
  const pending = { ...manifest.pending };
  const save = () => write(path.join(dest, MANIFEST), JSON.stringify({ package: 't3-dispatch-skills', lang, files: next, pending }, null, 2));
  for (const { rel, from, status } of plan) if (status === 'installed') next[rel] = hash(from);
  mkdirSync(dest, { recursive: true });
  save();
  plan.sort((a, b) => Number(a.rel.startsWith('rules/')) - Number(b.rel.startsWith('rules/')));
  const results = [];
  for (const { rel, from, status } of plan) {
    if (status !== 'kept') {
      const to = path.join(dest, rel);
      pending[rel] = hash(from);
      save();
      mkdirSync(path.dirname(to), { recursive: true });
      write(to, readFileSync(from));
      next[rel] = hash(to);
      delete pending[rel];
      save();
    }
    results.push({ name: rel, status });
  }
  // Files we installed before that the package no longer has: remove if unchanged. Either way they leave the
  // manifest: a kept one now belongs to the user.
  for (const [rel, recorded] of Object.entries(owned)) {
    if (rel in files) continue;
    const to = path.join(dest, rel);
    if (linked(dest, rel)) {
      results.push({ name: rel, status: 'kept' }); // never delete through a link
    } else if (existsSync(to) && statSync(to).isFile() && [recorded, manifest.pending[rel]].includes(hash(to))) {
      rmSync(to);
      pruneEmpty(dest, rel);
      results.push({ name: rel, status: 'removed' });
    } else if (existsSync(to)) {
      results.push({ name: rel, status: 'kept' });
    }
    delete next[rel];
  }
  for (const rel of Object.keys(pending)) delete pending[rel];
  save();
  return results;
}

export function uninstallGemini({ dest = DEFAULT_DEST } = {}) {
  const manifestFile = path.join(dest, MANIFEST);
  if (!existsSync(manifestFile)) return [];
  const manifest = readManifest(dest);
  if (!manifest) return [{ name: MANIFEST, status: 'conflict' }]; // not ours: leave everything
  const results = [];
  for (const [rel, recorded] of Object.entries(manifest.files)) {
    const to = path.join(dest, rel);
    if (linked(dest, rel)) {
      results.push({ name: rel, status: 'kept' }); // never delete through a link
      continue;
    }
    if (!existsSync(to)) {
      pruneEmpty(dest, rel); // a folder left by an install that failed before this file was written
      continue;
    }
    if (!statSync(to).isFile()) continue;
    if (![recorded, manifest.pending[rel]].includes(hash(to))) {
      results.push({ name: rel, status: 'kept' }); // edited by the user
      continue;
    }
    rmSync(to);
    pruneEmpty(dest, rel);
    results.push({ name: rel, status: 'removed' });
  }
  rmSync(manifestFile);
  return results;
}

// Strict argument parsing: a flag that takes a value must have one, and unknown flags are refused.
export function parseArgs(argv) {
  const options = { lang: 'zh', dest: DEFAULT_DEST, uninstall: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--uninstall') options.uninstall = true;
    else if (flag === '--lang' || flag === '--dest') {
      const value = argv[i + 1];
      if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${flag} needs a value / ${flag} 后面要写值`);
      options[flag.slice(2)] = value;
      i += 1;
    } else throw new Error(`unknown option / 不认识的参数: ${flag}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const results = options.uninstall ? uninstallGemini(options) : installGemini(options);
  for (const { name, status } of results) console.log(`${status.padEnd(9)} ${path.join(options.dest, name)}`);
  if (results.some(({ status }) => status === 'conflict')) {
    console.error('Stopped, nothing was written: these already exist and were not installed by t3-dispatch-skills. / 已停止，什么都没写：上面这些已经存在，不是本技能包装的。');
    process.exit(1);
  }
  if (results.some(({ status }) => status === 'kept')) {
    console.log('"kept" files were edited after installation and were left as they are. / 标为 kept 的文件装好后被改过，原样保留。');
  }
}
