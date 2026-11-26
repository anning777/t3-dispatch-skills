// Picks today's Codex reasoning effort from codexradar's measured scores: for each model, the effort with the
// highest total score (ultra excluded). Looked up once per day (Beijing time) and remembered in
// ~/.t3-dispatch-skills/codex-effort.json; later runs on the same day reuse that record.
// Usage: node codex-effort.mjs                 use today's record, or look it up
//        node codex-effort.mjs --refresh       look it up again
//        node codex-effort.mjs --models a,b    other models (default: gpt-6.2-astra, gpt-6.2-sol)
//        node codex-effort.mjs --lang en       English output (default: Chinese)
// With no data and no earlier record it prints the fallback effort (high) instead of failing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_URL = 'https://codexradar.com/data/codex-four-task-results.json';
export const MODELS = ['gpt-6.2-astra', 'gpt-6.2-sol'];
export const FALLBACK_EFFORT = 'high';
// Low to high; on a tie the earlier (lower, faster, cheaper) effort wins. ultra is not considered.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CACHE_FILE = path.join(homedir(), '.t3-dispatch-skills', 'codex-effort.json');

// Total score of one effort with the site's published weights (out of 150), rounded to two decimals like the site.
export function scoreRow(row, weights) {
  const parts = [
    [row.combined?.score, weights.combined],
    [row.pompeii?.score100, weights.pompeii],
    [row.pelican?.score, weights.pelican],
  ];
  if (parts.some(([value, weight]) => typeof value !== 'number' || typeof weight !== 'number')) {
    throw new Error(`codexradar 数据格式变了 / data format changed: ${row.model} / ${row.effort} 缺少分项分数 / missing part scores`);
  }
  if (typeof row.candy?.correct !== 'boolean' || typeof weights.candy !== 'number') {
    throw new Error(`codexradar 数据格式变了 / data format changed: ${row.model} / ${row.effort} 缺少糖果题结果 / missing candy result`);
  }
  const total = parts.reduce((sum, [value, weight]) => sum + (value / 100) * weight, 0) + (row.candy.correct ? weights.candy : 0);
  return Math.round(total * 100) / 100;
}

export function chooseEfforts(data, models = MODELS) {
  const choices = {};
  for (const model of models) {
    const rows = (data.rows ?? []).filter((candidate) => candidate.model === model);
    if (rows.length === 0) throw new Error(`codexradar 数据里没有 ${model} 的测试结果 / no results for ${model}`);
    // Exactly one row per effort: a missing or duplicated effort means the data is incomplete, so never pick silently.
    const scored = EFFORTS.map((effort) => {
      const matched = rows.filter((candidate) => candidate.effort === effort);
      if (matched.length !== 1) throw new Error(`codexradar 数据不完整 / incomplete data: ${model} / ${effort} 有 ${matched.length} 条结果 / has ${matched.length} rows`);
      return { effort, score: scoreRow(matched[0], data.task_weights ?? {}) };
    });
    const best = Math.max(...scored.map(({ score }) => score));
    const ties = scored.filter(({ score }) => score === best).map(({ effort }) => effort);
    choices[model] = { effort: ties[0], score: best, ties };
  }
  return choices;
}

// "Today" in Beijing time: codexradar publishes its rounds on Beijing time, whatever the local time zone.
function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); // YYYY-MM-DD
}

// A malformed record (say, edited by hand) counts as no record.
function readCache(models) {
  try {
    const record = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    const valid = typeof record.date === 'string' && models.every((model) => {
      const choice = record.choices?.[model];
      return EFFORTS.includes(choice?.effort) && typeof choice.score === 'number' && Array.isArray(choice.ties);
    });
    return valid ? record : null;
  } catch {
    return null;
  }
}

const TEXT = {
  zh: {
    title: (r) => `Codex 档位（${r.date}，数据来自 codexradar ${r.round_id}）：`,
    line: (model, effort, score, ties) => `  ${model} → ${effort}（${score.toFixed(2)} 分${ties.length > 1 ? `，与 ${ties.slice(1).join('、')} 并列，取较低档` : ''}）`,
    stale: (message, date) => `今天没查到 codexradar 的数据（${message}），沿用 ${date} 的选择。`,
    fallback: (message) => `查不到 codexradar 的数据（${message}），也没有之前的记录，先用默认档位：`,
  },
  en: {
    title: (r) => `Codex effort (${r.date}, codexradar ${r.round_id}):`,
    line: (model, effort, score, ties) => `  ${model} → ${effort} (${score.toFixed(2)} points${ties.length > 1 ? `, tied with ${ties.slice(1).join(', ')}; the lower one is used` : ''})`,
    stale: (message, date) => `No codexradar data today (${message}); reusing the choice from ${date}.`,
    fallback: (message) => `No codexradar data (${message}) and no earlier record; using the fallback effort:`,
  },
};

function describe(record, models, text) {
  const lines = [text.title(record)];
  for (const model of models) {
    const { effort, score, ties } = record.choices[model];
    lines.push(text.line(model, effort, score, ties));
  }
  return lines.join('\n');
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] ?? '' : null;
}

async function main() {
  const text = argValue('--lang') === 'en' ? TEXT.en : TEXT.zh;
  const refresh = process.argv.includes('--refresh');
  const listed = (argValue('--models') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  const models = listed.length > 0 ? listed : MODELS;
  const cached = readCache(models);
  if (!refresh && cached?.date === today()) {
    console.log(describe(cached, models, text));
    return;
  }
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const record = { date: today(), round_id: data.round_id, score_snapshot_at: data.score_snapshot_at, choices: chooseEfforts(data, models) };
    mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(record, null, 2));
    console.log(describe(record, models, text));
  } catch (err) {
    if (cached) {
      console.log(text.stale(err.message, cached.date));
      console.log(describe(cached, models, text));
      return;
    }
    console.log(text.fallback(err.message));
    for (const model of models) console.log(`  ${model} → ${FALLBACK_EFFORT}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
