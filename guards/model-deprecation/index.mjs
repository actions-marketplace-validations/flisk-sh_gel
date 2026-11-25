import modelsData from "./models.json" with { type: "json" };

export const name = "model-deprecation";

const SKIP_FILE = /\.(md|mdx|txt|rst|lock|svg|png|jpe?g|gif|ico|woff2?|map)$/i;
const isTestPath = (f) => /(^|\/)(tests?|__tests__|fixtures?|__fixtures__|testdata)(\/|$)|\.(test|spec)\.[a-z0-9_-]+$/i.test(f);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRules(models, now, days) {
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const active = [];
  for (const m of models) {
    if (!m.id) continue;
    if (m.retireOn) {
      const d = new Date(m.retireOn);
      if (!isNaN(d.getTime()) && d > horizon) continue;
    }
    const escaped = escapeRegex(m.id);
    const pattern = new RegExp(`(?<![a-zA-Z0-9_@.-])${escaped}(?![a-zA-Z0-9_.-])`);
    active.push({ model: m, regex: pattern });
  }
  active.sort((a, b) => b.model.id.length - a.model.id.length);
  return active;
}

export function hitsFor(file, text, rules) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (/^\s*(\/\/|\*|\/\*|#)/.test(line) && !line.includes("@cf/") && !line.includes("gpt-") && !line.includes("claude-")) return;
    const seen = new Set();
    for (const { model, regex } of rules) {
      if (regex.test(line)) {
        if (seen.has(model.id)) continue;
        seen.add(model.id);
        const repl = model.replacement ? `, use ${model.replacement}` : "";
        const ret = model.retireOn ? ` (${model.retireOn})` : "";
        out.push({
          file,
          line: i + 1,
          message: `hardcoded retired model "${model.id}"${ret}${repl}`,
        });
      }
    }
  });
  return out;
}

export function run({ files, cfg, read }) {
  const conf = cfg?.model_deprecation ?? {};
  const days = Number(conf.days ?? 30);
  const now = conf.now ? new Date(conf.now) : new Date();
  const models = conf.models ?? modelsData;
  const rules = compileRules(models, now, days);

  const findings = [];
  for (const f of files) {
    if (isTestPath(f) || SKIP_FILE.test(f)) continue;
    if (f.endsWith("guards/model-deprecation/models.json")) continue;
    const text = read(f);
    if (text == null) continue;
    const hits = hitsFor(f, text, rules);
    findings.push(...hits);
  }
  return { pass: findings.length === 0, findings };
}
