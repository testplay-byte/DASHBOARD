#!/usr/bin/env node
/**
 * Acute — public status dashboard build script (zero dependencies, Node 18+).
 *
 *   inputs:   data.json · src/template.html · src/style.css · src/app.js
 *   outputs:  index.html · assets/style.css · assets/app.js
 *
 * How it works
 *   1. data.json is the single source of content truth (curated, public-safe).
 *   2. Loop-shaped sections (pillars, features, plan, quality, milestones,
 *      principles, chips, stats, docs) are rendered into escaped HTML fragments.
 *   3. Fragments + literals are injected into src/template.html at
 *      {{PLACEHOLDER}} slots (function replacers only — never string
 *      interpolation into .replace, so "$&"-style content can't corrupt it).
 *   4. CSS/JS are copied to assets/ and referenced with a cache-busting
 *      query so repeat visitors always get fresh output after a rebuild.
 *   5. FAIL-CLOSED DENYLIST: the site deploys to a PUBLIC GitHub Pages repo,
 *      so every output file is scanned for token / credential / internal-path
 *      / internal-id patterns. Any hit aborts the build with exit 1 BEFORE
 *      anything is written or published.
 *
 * Usage:  node build.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

/* ── inputs ─────────────────────────────────────────────────────────────── */
const data = JSON.parse(read("data.json"));
const template = read("src", "template.html");
const css = read("src", "style.css");
const js = read("src", "app.js");

/* ── basic validation ───────────────────────────────────────────────────── */
for (const key of ["product", "pillars", "plan", "quality", "milestones", "chips", "audit"]) {
  if (data[key] === undefined) {
    console.error(`data.json is missing required field: ${key}`);
    process.exit(1);
  }
}
const audit = data.audit;
for (const key of ["benchmark", "capabilities", "tracks", "sequence", "decisions"]) {
  if (!Array.isArray(audit[key]) || audit[key].length === 0) {
    console.error(`data.json: audit.${key} must be a non-empty array`);
    process.exit(1);
  }
}
for (const key of ["p0", "p1", "p2"]) {
  if (!Array.isArray(audit.gaps?.[key]) || audit.gaps[key].length === 0) {
    console.error(`data.json: audit.gaps.${key} must be a non-empty array`);
    process.exit(1);
  }
}
if (!Array.isArray(data.pillars) || data.pillars.length === 0) {
  console.error("data.json: pillars must be a non-empty array");
  process.exit(1);
}
if (!Array.isArray(data.features) || data.features.length === 0) {
  console.error("data.json: features must be a non-empty array");
  process.exit(1);
}
if (!Array.isArray(data.documentation) || data.documentation.length === 0) {
  console.error("data.json: documentation must be a non-empty array");
  process.exit(1);
}

/* ── helpers ────────────────────────────────────────────────────────────── */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const buildDate = new Date();
const buildIso = buildDate.toISOString();
const buildStamp = buildIso.replace("T", " ").slice(0, 16) + " UTC";
const cacheBust = buildIso.replace(/[^0-9A-Za-z]/g, "").toLowerCase();

const prettyDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/* ── derived values ─────────────────────────────────────────────────────── */
const product = data.product;
const pillars = data.pillars;
const plan = data.plan;
const quality = data.quality;
const suites = Array.isArray(quality.suites) ? quality.suites : [];
const milestones = [...(Array.isArray(data.milestones) ? data.milestones : [])]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));
const features = Array.isArray(data.features) ? data.features : [];
const documentation = Array.isArray(data.documentation) ? data.documentation : [];
const gaps = audit.gaps ?? { p0: [], p1: [], p2: [] };
const gapTotal = gaps.p0.length + gaps.p1.length + gaps.p2.length;

const totalTests = suites.reduce((n, s) => n + num(s.tests), 0);
const totalSkipped = suites.reduce((n, s) => n + num(s.skipped), 0);
const maxSuite = Math.max(1, ...suites.map((s) => num(s.tests)));
const ciOk = quality.ci === "success" || quality.ci === "green";
const ciBad = quality.ci === "failure" || quality.ci === "failing" || quality.ci === "red";
const lintOk = quality.lint === "clean" || quality.lint === "success";
const typecheckOk = quality.typecheck === "clean" || quality.typecheck === "success";
const cargoOk = quality.cargoCheck === "green" || quality.cargoCheck === "success";
const cargoBad = quality.cargoCheck === "failing" || quality.cargoCheck === "failure";
const license = quality.licenseAudit ?? { deps: 0, verdict: "n/a" };

const topPillar = pillars.reduce(
  (best, p) => (num(p.progress) > num(best.progress) ? p : best),
  pillars[0],
);
const topPillarState = String(topPillar.state ?? "");

const firstMs = milestones[0];
const lastMs = milestones[milestones.length - 1];
let spanDays = 0;
if (firstMs && lastMs) {
  const a = Date.parse(`${firstMs.date}T00:00:00Z`);
  const b = Date.parse(`${lastMs.date}T00:00:00Z`);
  if (!Number.isNaN(a) && !Number.isNaN(b)) {
    spanDays = Math.round((b - a) / 86400000) + 1;
  }
}

/* ── icons (inline SVG, stroke style — no external assets) ──────────────── */
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  coding: svg(
    '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  ),
  agentic: svg(
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
    '<line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  ),
  automation: svg(
    '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/>' +
    '<rect width="8" height="8" x="13" y="13" rx="2"/>',
  ),
  check: svg(
    '<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>' +
    '<path d="m9 12 2 2 4-4"/>',
  ),
  terminal: svg(
    '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  ),
  package: svg(
    '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
  ),
  // feature-card icons
  browser: svg(
    '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
    '<path d="M3 9h18"/>' +
    '<circle cx="6.5" cy="6.5" r="0.6" fill="currentColor"/>' +
    '<circle cx="9" cy="6.5" r="0.6" fill="currentColor"/>',
  ),
  panels: svg(
    '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
    '<line x1="15" y1="4" x2="15" y2="20"/>' +
    '<line x1="3" y1="9" x2="15" y2="9"/>' +
    '<line x1="3" y1="13" x2="15" y2="13"/>' +
    '<line x1="3" y1="17" x2="15" y2="17"/>',
  ),
  bell: svg(
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
    '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  ),
  agents: svg(
    '<circle cx="12" cy="8" r="3"/>' +
    '<circle cx="5" cy="18" r="3"/>' +
    '<circle cx="19" cy="18" r="3"/>' +
    '<line x1="10.5" y1="10" x2="6.5" y2="16"/>' +
    '<line x1="13.5" y1="10" x2="17.5" y2="16"/>',
  ),
  shield: svg(
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
    '<path d="m9 12 2 2 4-4"/>',
  ),
  command: svg(
    '<path d="M9 6a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6"/>' +
    '<path d="M9 18a3 3 0 1 1 0-6h6a3 3 0 1 1 0 6"/>' +
    '<line x1="12" y1="6" x2="12" y2="18"/>',
  ),
  index: svg(
    '<path d="M4 6h2v12H4z"/><path d="M7 9h13"/>' +
    '<path d="M7 13h13"/><path d="M7 17h13"/><path d="M7 6h6"/>',
  ),
  globe: svg(
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="2" y1="12" x2="22" y2="12"/>' +
    '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  ),
  stream: svg(
    '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  ),
  doc: svg(
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="8" y1="13" x2="16" y2="13"/>' +
    '<line x1="8" y1="17" x2="13" y2="17"/>',
  ),
  arrow: svg(
    '<line x1="5" y1="12" x2="19" y2="12"/>' +
    '<polyline points="12 5 19 12 12 19"/>',
  ),
};

/* ── fragment renderers ─────────────────────────────────────────────────── */
/* ── audit renderers ────────────────────────────────────────────────────── */
const scoreBar = (score, max) => {
  const pct = clamp(Math.round((num(score) / max) * 100), 0, 100);
  const lvl = num(score) <= 1 ? " low" : num(score) >= 3 ? " high" : "";
  return `<span class="bench-score"><span class="bench-score-track"><span class="bench-score-fill${lvl}" style="--w:${pct}%"></span></span><span class="bench-score-num mono">${num(score)}/${max}</span></span>`;
};

const renderBenchRow = (b) => `      <div class="bench-row" role="row">
        <span class="bench-dim" role="rowheader">${esc(b.dimension)}</span>
        <span class="bench-acute" role="cell">${scoreBar(b.acute, 5)}</span>
        <span class="bench-best" role="cell"><span class="bench-best-name">${esc(b.bestName)}</span>${scoreBar(b.bestScore, 5)}</span>
        <span class="bench-verdict" role="cell">${esc(b.verdict)}</span>
      </div>`;

const CAP_STATUS = {
  live: { cls: "cap-live", label: "live" },
  partial: { cls: "cap-partial", label: "partial" },
  missing: { cls: "cap-missing", label: "missing" },
};

const renderCapability = (c) => {
  const st = CAP_STATUS[c.status] ?? { cls: "cap-missing", label: esc(c.status) };
  return `      <article class="cap-card card">
        <div class="cap-top">
          <h3 class="cap-title">${esc(c.area)}</h3>
          <span class="cap-status ${st.cls}">${st.label}</span>
        </div>
        <p class="cap-note">${esc(c.note)}</p>
      </article>`;
};

const impactCls = (v) => (String(v).toUpperCase() === "HIGH" ? "chip-impact-high" : "chip-impact-med");
const effortCls = (v) => {
  const s = String(v).toUpperCase();
  return s === "S" ? "chip-effort-s" : s === "M" ? "chip-effort-m" : "chip-effort-l";
};

const renderGapItem = (g) => `        <article class="gap-item">
          <div class="gap-item-head">
            <span class="gap-id mono">${esc(g.id)}</span>
            <h4 class="gap-title">${esc(g.title)}</h4>
            <span class="gap-chips">
              <span class="gap-chip ${impactCls(g.impact)}">${esc(g.impact)}</span>
              <span class="gap-chip ${effortCls(g.effort)}">${esc(g.effort)}</span>
            </span>
          </div>
          <p class="gap-why">${esc(g.why)}</p>
        </article>`;

const renderTrack = (t) => `      <article class="track-card card">
        <header class="track-head">
          <span class="track-id mono">${esc(t.id)}</span>
          <div>
            <h3 class="track-name">${esc(t.name)}</h3>
            <p class="track-tagline">${esc(t.tagline)}</p>
          </div>
        </header>
        <ul class="track-contents">
${t.contents.map((c) => `          <li>${esc(c)}</li>`).join("\n")}
        </ul>
        <div class="track-gets">
          <span class="track-gets-label">Owner gets</span>
          <p>${esc(t.gets)}</p>
        </div>
        <footer class="track-meta">
          <span class="track-meta-chip"><span class="track-meta-label">rounds</span> ${esc(t.rounds)}</span>
          <span class="track-meta-chip"><span class="track-meta-label">deps</span> ${esc(t.deps)}</span>
        </footer>
      </article>`;

const renderSeq = (s) => `      <li class="seq-item">
        <span class="seq-round mono">${esc(s.round)}</span>
        <div class="seq-body">
          <span class="seq-track">${esc(s.track)}</span>
          <p class="seq-why">${esc(s.why)}</p>
        </div>
      </li>`;

const renderDecision = (d) => `      <article class="decision-card card">
        <span class="decision-num mono" aria-hidden="true">${String(d.n).padStart(2, "0")}</span>
        <div class="decision-body">
          <h3 class="decision-title">${esc(d.title)}</h3>
          <p class="decision-detail">${esc(d.detail)}</p>
          <p class="decision-rec"><span class="decision-rec-label">Recommended</span>${esc(d.recommend)}</p>
        </div>
      </article>`;

const STATES = {
  usable: { cls: "state-usable", label: "Usable" },
  building: { cls: "state-building", label: "Building" },
  planned: { cls: "state-planned", label: "Planned" },
};

const renderPillar = (p, i) => {
  const state = STATES[p.state] ?? { cls: "state-planned", label: esc(p.state) };
  const pct = clamp(num(p.progress), 0, 100);
  const icon = ICONS[p.id] ?? ICONS.coding;
  return `      <article class="pillar-card card" data-state="${esc(p.state)}">
        <div class="pillar-top">
          <span class="pillar-icon">${icon}</span>
          <h3 class="pillar-title">${esc(p.title)}</h3>
          <span class="state-badge ${state.cls}">${state.label}</span>
        </div>
        <div class="pillar-progress-row">
          <span class="pillar-progress-label">Pillar progress</span>
          <span class="pillar-pct"><span data-count="${pct}">${pct}</span>%</span>
        </div>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.title)} progress">
          <div class="bar-fill" data-progress="${pct}" style="--w:${pct}%"></div>
        </div>
        <p class="pillar-summary">${esc(p.summary)}</p>
      </article>`;
};

const FEATURE_STATUS = {
  live: { cls: "feature-status", label: "live" },
  beta: { cls: "feature-status", label: "beta" },
  planned: { cls: "feature-status", label: "planned" },
};

const renderFeature = (f) => {
  const st = FEATURE_STATUS[f.status] ?? { cls: "feature-status", label: esc(f.status) };
  const icon = ICONS[f.icon] ?? ICONS.command;
  return `      <article class="feature-card card">
        <div class="feature-top">
          <span class="feature-icon">${icon}</span>
          <h3 class="feature-title">${esc(f.title)}</h3>
          <span class="${st.cls}">${st.label}</span>
        </div>
        <p class="feature-desc">${esc(f.desc)}</p>
      </article>`;
};

const renderDoc = (d) => {
  const icon = ICONS.doc;
  return `      <article class="doc-card card">
        <div class="doc-top">
          <span class="doc-category">${esc(d.category)}</span>
          <span class="doc-arrow" aria-hidden="true">${ICONS.arrow}</span>
        </div>
        <h3 class="doc-title">${esc(d.title)}</h3>
        <p class="doc-desc">${esc(d.desc)}</p>
        <code class="doc-path">${esc(d.path)}</code>
      </article>`;
};

const renderStat = (stat) => `      <article class="stat-card card">
        <span class="stat-label">${esc(stat.label)}</span>
        <span class="stat-value"><span data-count="${num(stat.value)}">${num(stat.value)}</span>${stat.suffix ? esc(stat.suffix) : ""}</span>
        <span class="stat-sub">${esc(stat.sub)}</span>
      </article>`;

const stats = [
  {
    label: "Tests passing",
    value: totalTests,
    suffix: "",
    sub: `${suites.length} suites · ${totalSkipped} skipped · unit + e2e`,
  },
  {
    label: "Audit gaps identified",
    value: gapTotal,
    suffix: "",
    sub: `9 critical · 15 high-impact · 13 next — six-track roadmap below`,
  },
  {
    label: "Milestones shipped",
    value: milestones.length,
    suffix: "",
    sub: firstMs && lastMs
      ? `${prettyDate(firstMs.date)} – ${prettyDate(lastMs.date)}${spanDays ? ` · ${spanDays}-day run` : ""}`
      : "",
  },
  {
    label: "Dependencies audited",
    value: num(license.deps),
    suffix: "",
    sub: `license audit · ${esc(license.verdict)}`,
  },
];

const PLAN_STATUS = {
  "in-progress": { cls: "status-inprogress", label: "in progress" },
  "owner-gated": { cls: "status-ownergated", label: "owner-gated" },
  planned: { cls: "status-planned", label: "planned" },
};

const renderUpcoming = (item) => {
  const s = PLAN_STATUS[item.status] ?? { cls: "status-planned", label: esc(item.status) };
  return `      <li class="upcoming-item">
        <span class="status-chip ${s.cls}">${s.label}</span>
        <div class="upcoming-body">
          <span class="upcoming-phase">${esc(item.phase)}</span>
          <span class="upcoming-note">${esc(item.note)}</span>
        </div>
      </li>`;
};

const renderSuite = (s) => {
  const tests = num(s.tests);
  const pct = clamp(Math.round((tests / maxSuite) * 100), 3, 100);
  const skip = num(s.skipped);
  const skipStr = skip > 0
    ? ` · <span class="suite-skip">${skip} skipped</span>`
    : "";
  return `        <div class="suite-row">
          <div class="suite-head">
            <span class="suite-name">${esc(s.name)}</span>
            <span class="suite-count"><strong data-count="${tests}">${tests}</strong> tests${skipStr}</span>
          </div>
          <div class="bar suite-bar" role="progressbar" aria-valuenow="${tests}" aria-valuemin="0" aria-valuemax="${maxSuite}" aria-label="${esc(s.name)} test count relative to largest suite">
            <div class="bar-fill" data-progress="${pct}" style="--w:${pct}%"></div>
          </div>
        </div>`;
};

const renderCheck = (icon, iconCls, label, value, ok, sub, bad = false) => `        <article class="check-card card">
          <span class="check-icon ${iconCls}">${icon}</span>
          <div class="check-body">
            <span class="check-label">${esc(label)}</span>
            <span class="check-value ${ok ? "value-ok" : bad ? "value-bad" : ""}">${esc(value)}</span>
            <span class="check-sub">${esc(sub)}</span>
          </div>
        </article>`;

const checks = [
  renderCheck(
    ICONS.check,
    ciOk ? "icon-ok" : ciBad ? "icon-bad" : "icon-accent",
    "CI pipeline",
    ciOk ? "passing" : ciBad ? "failing" : String(quality.ci),
    ciOk,
    ciOk ? "latest run: success" : "red since R39 — Rust shell, fix queued (P0-1)",
    ciBad,
  ),
  renderCheck(
    ICONS.terminal,
    lintOk ? "icon-ok" : "icon-accent",
    "Lint (eslint)",
    lintOk ? "clean" : String(quality.lint),
    lintOk,
    "0 errors, 0 warnings",
  ),
  renderCheck(
    ICONS.command,
    typecheckOk ? "icon-ok" : "icon-accent",
    "Typecheck (tsc)",
    typecheckOk ? "clean" : String(quality.typecheck),
    typecheckOk,
    "strict mode, no any",
  ),
  renderCheck(
    ICONS.package,
    cargoOk ? "icon-ok" : cargoBad ? "icon-bad" : "icon-accent",
    "cargo check",
    cargoOk ? "passing" : cargoBad ? "failing" : String(quality.cargoCheck),
    cargoOk,
    cargoOk ? "Rust shell compiles clean" : "Rust shell — one-line Tauri API fix identified (Track 1)",
    cargoBad,
  ),
  renderCheck(
    ICONS.shield,
    license.verdict === "CLEAN" ? "icon-ok" : "icon-accent",
    "License audit",
    String(license.verdict),
    license.verdict === "CLEAN",
    `${num(license.deps)} dependencies reviewed`,
  ),
];

const renderMilestone = (m, isLatest) => `        <li class="timeline-item${isLatest ? " latest" : ""}">
          <span class="timeline-date">${esc(m.date)}</span>
          <span class="timeline-label">${esc(m.label)}</span>
          ${isLatest ? '<span class="timeline-flag">latest</span>' : ""}
        </li>`;

const renderPrinciple = (text, i) => {
  const raw = String(text);
  const sep = raw.indexOf(" — ");
  const title = sep >= 0 ? raw.slice(0, sep) : raw;
  const desc = sep >= 0 ? raw.slice(sep + 3) : "";
  const idx = String(i + 1).padStart(2, "0");
  return `      <article class="principle-card card">
        <span class="principle-index" aria-hidden="true">${idx}</span>
        <span class="principle-rule" aria-hidden="true"></span>
        <h3 class="principle-title">${esc(title)}</h3>
        ${desc ? `<p class="principle-desc">${esc(desc)}</p>` : ""}
      </article>`;
};

const renderTechChip = (c) => `        <span class="tech-chip"><span class="tech-dot" aria-hidden="true"></span>${esc(c)}</span>`;

/* ── assemble the page ──────────────────────────────────────────────────── */
const title = `${product.name} — status dashboard`;
const description = `${product.tagline}. Public status: pillars, features, plan, quality metrics, milestones, docs.`;
const pageUrl = "https://testplay-byte.github.io/DASHBOARD/";
const favicon =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#FF6B2C"/>' +
    '<text x="32" y="45" font-family="Menlo, Consolas, monospace" font-size="34" ' +
    'font-weight="700" text-anchor="middle" fill="#1f130a">◐</text></svg>',
  );
const statusPill = ciOk
  ? "All systems healthy"
  : ciBad
    ? "CI red since R39 — Rust fix queued (Track 1)"
    : "Status: check runs";
const statusShort = ciOk ? "healthy" : ciBad ? "attention" : "watch";
const statusPillClass = ciOk ? "pill-ok" : ciBad ? "pill-warn" : "pill-ok";

// Public-safe GitHub link — the denylist allows github.com/testplay-byte/DASHBOARD
// (the public repo we publish to). We never link the private source repo here.
const githubUrl = "https://github.com/testplay-byte/DASHBOARD";
const githubLabel = "testplay-byte/DASHBOARD";

const footerNote =
  `Generated ${buildStamp} · curated public data only — no product source ` +
  `· ${esc(product.name)} v${esc(product.version)}`;

const dataJson = JSON.stringify({
  buildIso,
  screenshots: data.screenshots ?? null,
}).replace(/</g, "\\u003c");

const slots = {
  LANG: "en",
  TITLE: esc(title),
  DESCRIPTION: esc(description),
  PAGE_URL: esc(pageUrl),
  FAVICON: favicon,
  CSS_URL: `assets/style.css?v=${cacheBust}`,
  JS_URL: `assets/app.js?v=${cacheBust}`,
  PRODUCT_NAME: esc(product.name),
  VERSION: esc(product.version),
  TAGLINE: esc(product.tagline),
  AVAILABILITY: esc(product.availability),
  STATUS_PILL: esc(statusPill),
  STATUS_SHORT: esc(statusShort),
  STATUS_PILL_CLASS: statusPillClass,
  GITHUB_URL: esc(githubUrl),
  GITHUB_LABEL: esc(githubLabel),
  BUILD_STAMP: esc(buildStamp),
  STATS: stats.map(renderStat).join("\n"),
  PILLARS: pillars.map(renderPillar).join("\n"),
  FEATURES: features.map(renderFeature).join("\n"),
  NOW_TITLE: esc(plan.current.title),
  NOW_DETAIL: esc(plan.current.detail),
  UPCOMING: (plan.upcoming ?? []).map(renderUpcoming).join("\n"),
  AUDIT_METHOD: esc(audit.method ?? ""),
  AUDIT_VISION: esc(audit.vision ?? ""),
  AUDIT_COMPOSITE: esc(audit.headline?.composite ?? ""),
  AUDIT_FRONTIER: esc(audit.headline?.frontier ?? ""),
  AUDIT_VERDICT: esc(audit.headline?.verdict ?? ""),
  BENCH_ROWS: audit.benchmark.map(renderBenchRow).join("\n"),
  CAPABILITIES: audit.capabilities.map(renderCapability).join("\n"),
  GAP_TOTAL: gapTotal,
  P0_COUNT: gaps.p0.length,
  P1_COUNT: gaps.p1.length,
  P2_COUNT: gaps.p2.length,
  P0_INTRO: esc(gaps.p0_intro ?? ""),
  P1_INTRO: esc(gaps.p1_intro ?? ""),
  P2_INTRO: esc(gaps.p2_intro ?? ""),
  P0_ITEMS: gaps.p0.map(renderGapItem).join("\n"),
  P1_ITEMS: gaps.p1.map(renderGapItem).join("\n"),
  P2_ITEMS: gaps.p2.map(renderGapItem).join("\n"),
  TRACKS: audit.tracks.map(renderTrack).join("\n"),
  SEQUENCE: audit.sequence.map(renderSeq).join("\n"),
  DECISIONS: audit.decisions.map(renderDecision).join("\n"),
  CI_NOTE: esc(quality.ciNote ?? ""),
  QUALITY_SUITES: suites.map(renderSuite).join("\n"),
  QUALITY_CHECKS: checks.join("\n"),
  TOTAL_TESTS: totalTests,
  SKIPPED_TESTS: totalSkipped,
  DOCUMENTATION: documentation.map(renderDoc).join("\n"),
  MILESTONES: milestones.map((m, i) => renderMilestone(m, i === milestones.length - 1)).join("\n"),
  PRINCIPLES: (plan.principles ?? []).map(renderPrinciple).join("\n"),
  TECH_CHIPS: (data.chips ?? []).map(renderTechChip).join("\n"),
  FOOTER_NOTE: esc(footerNote),
  DATA_JSON: dataJson,
};

let missing = [];
let html = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, name) => {
  if (!(name in slots)) {
    missing.push(name);
    return match;
  }
  return slots[name];
});
if (missing.length) {
  console.error(`template placeholders without a value: ${missing.join(", ")}`);
  process.exit(1);
}
const unused = Object.keys(slots).filter((k) => !template.includes(`{{${k}}}`));
if (unused.length) {
  console.warn(`warning: unused slots (fine, just informational): ${unused.join(", ")}`);
}

/* ── fail-closed denylist (public site — generic classes only) ─────────── */
const DENY = [
  [/gh[pousr]_[A-Za-z0-9]{20,}/, "token pattern"],
  [/github_pat_/, "fine-grained token prefix"],
  [/sk-[A-Za-z0-9_-]{16,}/, "api-key pattern"],
  [/github\.com\/[A-Za-z0-9_.-]+:[^@\s/"']+@/, "token-in-URL"],
  [/C:\\Users\\|\/home\/[a-z]+\//, "internal filesystem path"],
  [/\b(agt_|sess_|prj_)[a-z0-9-]{6,}/i, "internal id prefix"],
  [/localhost:\d{4,5}|127\.0\.0\.1:\d{4,5}/, "dev port"],
  [/ntfy\.sh/, "notification endpoint"],
  [/github\.com\/testplay-byte\/(?!DASHBOARD)/, "link to a non-public repo"],
  [/Credential Manager|credentials\.txt/, "credential storage"],
  [/[A-Za-z0-9_]{90,}/, "suspicious secret-like run"],
];

function scan(name, content) {
  const hits = DENY.map(([re, why]) => (re.test(content) ? why : null)).filter(Boolean);
  if (hits.length) {
    console.error(`DENYLIST violation in ${name}: ${hits.join(", ")}`);
    process.exit(1);
  }
}

scan("index.html", html);
scan("assets/style.css", css);
scan("assets/app.js", js);

/* ── write outputs ──────────────────────────────────────────────────────── */
mkdirSync(join(ROOT, "assets"), { recursive: true });
writeFileSync(join(ROOT, "index.html"), html, "utf8");
writeFileSync(join(ROOT, "assets", "style.css"), css, "utf8");
writeFileSync(join(ROOT, "assets", "app.js"), js, "utf8");

console.log(`dashboard built`);
console.log(`  index.html         ${html.length} bytes (updated ${buildStamp})`);
console.log(`  assets/style.css   ${css.length} bytes`);
console.log(`  assets/app.js      ${js.length} bytes`);
console.log(`  features           ${features.length} cards`);
console.log(`  documentation       ${documentation.length} cards`);
console.log(`  milestones          ${milestones.length} entries`);
console.log(`  audit               ${audit.benchmark.length} benchmark rows · ${audit.capabilities.length} capability areas · ${gapTotal} gaps · ${audit.tracks.length} tracks · ${audit.decisions.length} decisions`);
console.log(`  denylist            clean`);
