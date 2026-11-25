import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

async function judge(files, cfg = {}) {
  const m = await import("../guards/model-deprecation/index.mjs");
  return m.run({ files: Object.keys(files), cfg, read: (f) => files[f] });
}

const msgs = (r) => r.findings.map((f) => f.message).join("\n");

test("flags deprecated model in source code", async () => {
  const r = await judge({
    "src/ai.ts": "export const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';\n",
  });
  assert.equal(r.pass, false);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].file, "src/ai.ts");
  assert.equal(r.findings[0].line, 1);
  assert.match(msgs(r), /hardcoded retired model "@cf\/meta\/llama-3\.1-8b-instruct-fast"/);
  assert.match(msgs(r), /use @cf\/mistralai\/mistral-small-3\.1-24b-instruct/);
});

test("flags gpt-3.5-turbo with suggestion", async () => {
  const r = await judge({
    "app.py": "model = 'gpt-3.5-turbo'\n",
  });
  assert.equal(r.pass, false);
  assert.match(msgs(r), /hardcoded retired model "gpt-3\.5-turbo"/);
  assert.match(msgs(r), /use gpt-4o-mini/);
});

test("flags claude-2 with suggestion", async () => {
  const r = await judge({
    "bot.js": "const m = 'claude-2';\n",
  });
  assert.equal(r.pass, false);
  assert.match(msgs(r), /hardcoded retired model "claude-2"/);
  assert.match(msgs(r), /use claude-3-5-sonnet-20241022/);
});

test("skips markdown files", async () => {
  const r = await judge({
    "README.md": "Use gpt-3.5-turbo or claude-2 in migration docs.\n",
    "docs/migration.mdx": "Deprecated @cf/meta/llama-3.1-8b-instruct-fast\n",
  });
  assert.equal(r.pass, true);
  assert.equal(r.findings.length, 0);
});

test("skips test files and fixtures", async () => {
  const r = await judge({
    "tests/ai.test.ts": "assert.equal(model, 'gpt-3.5-turbo');\n",
    "__tests__/legacy.js": "const m = 'claude-2';\n",
    "fixtures/response.json": "{\"model\": \"@cf/meta/llama-3.1-8b-instruct-fast\"}\n",
  });
  assert.equal(r.pass, true);
});

test("active models pass", async () => {
  const r = await judge({
    "src/ai.ts": "const a = '@cf/mistralai/mistral-small-3.1-24b-instruct';\nconst b = 'gpt-4o-mini';\n",
  });
  assert.equal(r.pass, true);
});

test("custom days window ignores models retiring far in the future", async () => {
  const customModels = [
    {
      id: "future-retiring-model",
      provider: "Test",
      retireOn: "2030-01-01",
      replacement: "next-gen-model",
    },
  ];
  const r = await judge(
    { "src/config.ts": "const m = 'future-retiring-model';\n" },
    {
      model_deprecation: {
        now: "2026-11-24T00:00:00Z",
        days: 30,
        models: customModels,
      },
    }
  );
  assert.equal(r.pass, true);

  const rSoon = await judge(
    { "src/config.ts": "const m = 'future-retiring-model';\n" },
    {
      model_deprecation: {
        now: "2029-12-15T00:00:00Z",
        days: 30,
        models: customModels,
      },
    }
  );
  assert.equal(rSoon.pass, false);
});

test("the guard is registered in guards.mjs, templates/gel.json, docs/guards.md, and README.md", () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.match(read("lib/guards.mjs"), /"model-deprecation"/);
  assert.match(read("templates/gel.json"), /"model-deprecation"/);
  assert.match(read("docs/guards.md"), /`model-deprecation`/);
  assert.match(read("README.md"), /`model-deprecation`/);
});
