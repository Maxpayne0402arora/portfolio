/* =============================================================
   Ally — Competitor Content Intelligence  ·  UI layer
   ============================================================= */

const S = {
  skus: [], rules: [], ruleset: null, cached: null,
  client: null, competitors: [], findings: [], top: [],
  edits: [], decisions: {}, filter: 'all'
};

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ruleById = id => S.rules.find(r => r.id === id);

/* ---------------- boot ---------------- */
async function boot() {
  const [skus, rulesDoc, cached] = await Promise.all([
    fetch('data/skus.json').then(r => r.json()),
    fetch('data/rules.json').then(r => r.json()),
    fetch('data/cached.json').then(r => r.json())
  ]);
  S.skus = skus; S.rules = rulesDoc.rules; S.ruleset = rulesDoc.ruleset; S.cached = cached;

  $('ruleset-chip').innerHTML =
    `Ruleset: <b>${escapeHtml(S.ruleset.name)} v${S.ruleset.version}</b> · ${S.rules.length} rules`;
  $('ruleset-chip').title = S.ruleset.note;

  renderSkuPicker();
  $('run-btn').addEventListener('click', generate);
  $('export-btn').addEventListener('click', exportMarkdown);
  $('approve-all').addEventListener('click', () => {
    S.edits.forEach((_, i) => { S.decisions[i] = 'approved'; });
    renderEdits(); syncExport();
  });
}

/* ---------------- step 1 ---------------- */
function renderSkuPicker() {
  const grid = $('sku-grid');
  grid.innerHTML = '';
  S.skus.filter(s => s.is_client).forEach(sku => {
    const comps = S.skus.filter(c => !c.is_client && c.competitor_group === sku.competitor_group);
    const b = el('button', 'sku-card');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `
      <div class="id">${escapeHtml(sku.sku_id)}</div>
      <div class="name">${escapeHtml(sku.brand)}</div>
      <div class="cat">${escapeHtml(sku.category.split('>').pop().trim())}</div>
      <div class="vs">Compared against ${comps.map(c => escapeHtml(c.brand)).join(', ')}</div>`;
    b.addEventListener('click', () => selectSku(sku, b));
    grid.appendChild(b);
  });
}

function selectSku(sku, btn) {
  document.querySelectorAll('.sku-card').forEach(c => c.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');

  S.client = sku;
  S.competitors = S.skus.filter(c => !c.is_client && c.competitor_group === sku.competitor_group);
  S.edits = []; S.decisions = {}; S.filter = 'all';

  const ruleFindings = AllyEngine.runRules(sku, S.rules);
  const compFindings = AllyEngine.competitiveFindings(sku, S.competitors);
  S.findings = [...ruleFindings, ...compFindings];
  S.top = AllyEngine.prioritise(S.findings).top;

  $('analysis').classList.remove('hidden');
  $('edits').innerHTML = '';
  $('src-note').textContent = '';
  $('md-out').classList.add('hidden');
  $('run-btn').disabled = false;
  $('run-btn').textContent = 'Generate recommendations';

  renderScorecard();
  renderFindings();
  renderNotTouching();
  syncExport();
  $('analysis').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- step 2 ---------------- */
function renderScorecard() {
  const rows = [S.client, ...S.competitors];
  const body = $('score-body');
  body.innerHTML = '';

  const all = rows.map(s => ({
    sku: s,
    m: AllyEngine.metrics(s),
    v: AllyEngine.runRules(s, S.rules).filter(f => f.severity === 'fail').length
  }));
  const compAvgBullet = AllyEngine.avg(all.slice(1).map(a => a.m.avgBullet));

  all.forEach(({ sku, m, v }) => {
    const tr = el('tr', sku.is_client ? 'is-client' : '');
    const thin = sku.is_client && m.avgBullet < compAvgBullet * 0.65;
    tr.innerHTML = `
      <td>${escapeHtml(sku.brand)}${sku.is_client ? '<span class="tag-client">CLIENT</span>' : ''}</td>
      <td class="num">${m.titleChars}</td>
      <td class="num">${m.bulletCount}</td>
      <td class="num ${thin ? 'worse' : ''}">${m.avgBullet}</td>
      <td class="num">${m.descChars}</td>
      <td class="num">${m.images}</td>
      <td><span class="viol-pill ${v === 0 ? 'ok' : ''}">${v}</span></td>`;
    body.appendChild(tr);
  });

  const cm = all[0].m;
  const compViolations = all.slice(1).filter(a => a.v > 0);
  const titleLimit = ruleById('AMZ-TITLE-01').check.limit;

  $('score-read').innerHTML = `
    <b>Read this before the findings.</b> ${escapeHtml(S.client.brand)}'s title is
    ${cm.titleChars} characters — inside the ${titleLimit}-character limit — and it carries the maximum
    ${cm.bulletCount} bullets. On a count-the-fields check this listing looks healthy. Its bullets average
    ${cm.avgBullet} characters against a competitor average of ${compAvgBullet}, so the gap is substance, not structure.
    ${compViolations.length
      ? `Note also that ${compViolations.map(a => escapeHtml(a.sku.brand)).join(' and ')}
         ${compViolations.length === 1 ? 'breaks' : 'break'} the ruleset too — competitors set the bar for depth,
         never for compliance.`
      : ''}`;
}

/* ---------------- step 3 ---------------- */
function renderFindings() {
  const counts = {
    all: S.findings.length,
    compliance: S.findings.filter(f => f.impact === 'compliance').length,
    discoverability: S.findings.filter(f => f.impact === 'discoverability').length,
    conversion: S.findings.filter(f => f.impact === 'conversion').length,
    competitive: S.findings.filter(f => f.kind === 'competitive').length
  };
  const tabs = $('finding-tabs');
  tabs.innerHTML = '';
  [['all', 'All findings'], ['compliance', 'Compliance risk'], ['discoverability', 'Discoverability'],
  ['conversion', 'Conversion'], ['competitive', 'Competitive only']].forEach(([key, label]) => {
    const t = el('button', 'tab', `${label}<span class="count">${counts[key]}</span>`);
    t.type = 'button';
    t.setAttribute('aria-selected', String(S.filter === key));
    t.addEventListener('click', () => { S.filter = key; renderFindings(); });
    tabs.appendChild(t);
  });

  const list = $('findings');
  list.innerHTML = '';
  const shown = S.findings.filter(f =>
    S.filter === 'all' ? true : S.filter === 'competitive' ? f.kind === 'competitive' : f.impact === S.filter);

  if (!shown.length) { list.appendChild(el('div', 'empty', 'Nothing in this category.')); return; }

  shown.sort((a, b) => (a.impact === 'compliance' ? -1 : 1) - (b.impact === 'compliance' ? -1 : 1));
  shown.forEach(f => {
    const tier = f.kind === 'competitive' ? 'benchmark' : (ruleById(f.rule_ids[0])?.tier || 'T1');
    const row = el('div', 'finding');
    row.innerHTML = `
      <div class="side">
        <span class="badge ${f.impact}">${f.impact === 'discoverability' ? 'discovery' : f.impact}</span>
        <span class="tier">${tier}</span>
      </div>
      <div>
        <div class="who">${escapeHtml(f.label)}</div>
        <div class="detail">${escapeHtml(f.detail)}</div>
        <div class="cites">${f.rule_ids.map(id => {
          const r = ruleById(id);
          return `<span class="cite ${f.kind === 'competitive' ? 'competitive' : ''}" title="${r ? escapeHtml(r.name + ' — ' + r.text) : ''}">${escapeHtml(id)}</span>`;
        }).join('')}</div>
        ${f.kind === 'competitive'
          ? '<div class="kind-flag">Benchmark, not a rule — no guideline is broken here. The listing is simply behind its shelf.</div>'
          : ''}
      </div>`;
    list.appendChild(row);
  });
}

/* ---------------- step 4 ---------------- */
async function generate() {
  const btn = $('run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Drafting and validating…';
  $('src-note').textContent = '';

  let payload = null, source = 'cached';
  try {
    const res = await fetch('/api/ally', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: S.client,
        competitors: S.competitors,
        findings: S.top.map(f => ({ field: f.field, detail: f.detail, rule_ids: f.rule_ids, impact: f.impact })),
        rules: S.rules.filter(r => r.tier !== 'T3')
          .map(r => ({ id: r.id, name: r.name, text: r.text, fields: r.fields }))
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.edits) && data.edits.length) { payload = data; source = 'live'; }
    }
  } catch (e) { /* offline or no function — fall through to cached */ }

  if (!payload) payload = S.cached[S.client.sku_id];

  S.edits = payload.edits.map(e => ({ ...e, working: e.after }));
  S.decisions = {};
  S.editSource = source;

  $('src-note').innerHTML = source === 'live'
    ? 'Drafted live, then re-validated in the browser against the same rules.'
    : 'Model call unavailable — showing pre-computed recommendations, re-validated in the browser against the same rules.';

  btn.disabled = false;
  btn.textContent = 'Regenerate';
  renderEdits();
  syncExport();
}

function splitBullets(t) { return t.split('|').map(s => s.trim()).filter(Boolean); }

function validateText(field, text) {
  const parts = field === 'bullets' ? splitBullets(text) : [text];
  let violations = [];
  parts.forEach(p => {
    const r = AllyEngine.validateEdit({ field: field === 'bullets' ? 'bullet' : field, after: p }, S.rules);
    violations = violations.concat(r.violations);
  });
  return { pass: violations.length === 0, violations };
}

function boxHtml(field, text, cls) {
  if (field === 'bullets') {
    return `<div class="box ${cls}"><ul>${splitBullets(text).map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>`;
  }
  return `<div class="box ${cls}">${escapeHtml(text)}</div>`;
}

function renderEdits() {
  const host = $('edits');
  host.innerHTML = '';
  if (!S.edits.length) return;

  S.edits.forEach((e, i) => {
    const decision = S.decisions[i];
    const v = validateText(e.field, e.working);
    const card = el('div', 'edit' + (decision === 'rejected' ? ' rejected' : ''));

    card.innerHTML = `
      <div class="edit-head">
        <span class="rank">${i + 1}</span>
        <span class="fld">${escapeHtml(e.field)}</span>
        <span class="spacer"></span>
        <span class="vstat ${v.pass ? 'pass' : 'fail'}">
          ${v.pass ? '✓ Validator passed' : '✕ Validator caught ' + v.violations.length + ' issue' + (v.violations.length === 1 ? '' : 's')}
        </span>
      </div>
      <div class="edit-body">
        <div class="ba">
          <div class="col"><h4>Current</h4>${boxHtml(e.field, e.before, 'before')}</div>
          <div class="col"><h4>Proposed</h4><div data-after="${i}">${boxHtml(e.field, e.working, 'after')}</div></div>
        </div>
        <div class="why"><b>Why this one:</b> ${escapeHtml(e.why)}</div>
        <div class="cites">${e.rule_ids.map(id => {
          const r = ruleById(id);
          return `<span class="cite" title="${r ? escapeHtml(r.name + ' — ' + r.text) : ''}">${escapeHtml(id)}</span>`;
        }).join('')}</div>
        ${e.competitor_reference ? `<div class="evidence"><b>Evidence from the shelf:</b> ${escapeHtml(e.competitor_reference)}</div>` : ''}
        ${e.needs_client_input ? `<div class="needs"><b>Needs the client, not the model</b>${escapeHtml(e.input_needed || '')}</div>` : ''}
        ${!v.pass ? `<div class="needs"><b>Validator</b>${v.violations.map(x => escapeHtml(x.detail)).join(' · ')}</div>` : ''}
      </div>
      <div class="edit-foot">
        <button class="btn sm ghost" data-act="approve" data-i="${i}">Approve</button>
        <button class="btn sm ghost" data-act="edit" data-i="${i}">Edit</button>
        <button class="btn sm ghost" data-act="reject" data-i="${i}">Reject</button>
        <span class="state ${decision || ''}">${decision ? (decision === 'approved' ? '✓ Approved' : '✕ Rejected') : ''}</span>
      </div>`;

    host.appendChild(card);
  });

  host.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.i;
      if (b.dataset.act === 'edit') return openEditor(i);
      S.decisions[i] = b.dataset.act === 'approve' ? 'approved' : 'rejected';
      renderEdits(); syncExport();
    });
  });
}

function openEditor(i) {
  const slot = document.querySelector(`[data-after="${i}"]`);
  if (!slot || slot.querySelector('textarea')) return;
  const ta = el('textarea', 'after-edit');
  ta.value = S.edits[i].working;
  slot.innerHTML = '';
  slot.appendChild(ta);
  const hint = el('div', 'src-note', S.edits[i].field === 'bullets'
    ? 'Separate bullets with the | character. Re-validates as you type.' : 'Re-validates as you type.');
  hint.style.marginTop = '6px';
  slot.appendChild(hint);
  ta.focus();
  let t;
  ta.addEventListener('input', () => {
    S.edits[i].working = ta.value;
    clearTimeout(t);
    t = setTimeout(() => {
      const v = validateText(S.edits[i].field, ta.value);
      const badge = document.querySelectorAll('.edit')[i].querySelector('.vstat');
      badge.className = 'vstat ' + (v.pass ? 'pass' : 'fail');
      badge.textContent = v.pass ? '✓ Validator passed'
        : `✕ Validator caught ${v.violations.length} issue${v.violations.length === 1 ? '' : 's'}`;
    }, 250);
  });
}

/* ---------------- step 5 ---------------- */
function renderNotTouching() {
  const host = $('not-touching');
  host.innerHTML = '';
  const items = (S.cached[S.client.sku_id] || {}).not_touching || [];
  items.forEach(n => {
    const d = el('div', 'nt-item');
    d.innerHTML = `
      <h4>${escapeHtml(n.item)}
        ${n.rule_ids.map(id => `<span class="cite">${escapeHtml(id)}</span>`).join('')}
      </h4>
      <p>${escapeHtml(n.reason)}</p>`;
    host.appendChild(d);
  });
}

/* ---------------- export ---------------- */
function syncExport() {
  const approved = Object.values(S.decisions).filter(d => d === 'approved').length;
  const rejected = Object.values(S.decisions).filter(d => d === 'rejected').length;
  $('export-btn').disabled = approved === 0;
  $('export-status').textContent = !S.edits.length
    ? 'Generate recommendations to review and approve them.'
    : `${approved} approved · ${rejected} rejected · ${S.edits.length - approved - rejected} awaiting a decision.`;
}

function exportMarkdown() {
  const c = S.client;
  const cm = AllyEngine.metrics(c);
  const L = [];
  L.push(`# Content recommendation — ${c.brand} (${c.sku_id})`);
  L.push('');
  L.push(`**Category:** ${c.category}`);
  L.push(`**Compared against:** ${S.competitors.map(x => `${x.brand} (${x.sku_id})`).join(', ')}`);
  L.push(`**Ruleset:** ${S.ruleset.name} v${S.ruleset.version} — ${S.ruleset.source}`);
  L.push(`**Recommendations:** ${S.editSource === 'live' ? 'generated live' : 'pre-computed'}, validated against the ruleset in-browser`);
  L.push(`**Exported:** ${new Date().toISOString().slice(0, 10)}`);
  L.push('');
  L.push('## Where this listing sits');
  L.push('');
  L.push('| Brand | Title chars | Bullets | Avg bullet | Description | Images | Violations |');
  L.push('|---|---|---|---|---|---|---|');
  [c, ...S.competitors].forEach(s => {
    const m = AllyEngine.metrics(s);
    const v = AllyEngine.runRules(s, S.rules).filter(f => f.severity === 'fail').length;
    L.push(`| ${s.brand}${s.is_client ? ' **(client)**' : ''} | ${m.titleChars} | ${m.bulletCount} | ${m.avgBullet} | ${m.descChars} | ${m.images} | ${v} |`);
  });
  L.push('');
  L.push('## Approved changes');
  L.push('');

  let n = 0;
  S.edits.forEach((e, i) => {
    if (S.decisions[i] !== 'approved') return;
    n++;
    const edited = e.working !== e.after;
    L.push(`### ${n}. ${e.field.charAt(0).toUpperCase() + e.field.slice(1)}`);
    L.push('');
    L.push(`**Rules applied:** ${e.rule_ids.join(', ')}`);
    L.push('');
    L.push('**Current**');
    L.push('');
    if (e.field === 'bullets') splitBullets(e.before).forEach(b => L.push(`- ${b}`));
    else L.push(`> ${e.before.replace(/\n+/g, ' ')}`);
    L.push('');
    L.push(`**Approved${edited ? ' (edited by reviewer)' : ''}**`);
    L.push('');
    if (e.field === 'bullets') splitBullets(e.working).forEach(b => L.push(`- ${b}`));
    else L.push(e.working);
    L.push('');
    L.push(`**Why:** ${e.why}`);
    if (e.competitor_reference) { L.push(''); L.push(`**Competitor evidence:** ${e.competitor_reference}`); }
    if (e.needs_client_input) { L.push(''); L.push(`**⚠ Blocked on the brand:** ${e.input_needed}`); }
    const vv = validateText(e.field, e.working);
    if (!vv.pass) {
      L.push('');
      L.push(`**⚠ Approved over a validator warning:** ${vv.violations.map(x => x.detail + ' (' + x.rule_ids.join(', ') + ')').join('; ')}. The reviewer chose to proceed; the ruleset says otherwise.`);
    }
    L.push('');
  });

  const rejected = S.edits.filter((_, i) => S.decisions[i] === 'rejected');
  if (rejected.length) {
    L.push('## Rejected by reviewer');
    L.push('');
    rejected.forEach(e => L.push(`- ${e.field} — ${e.why.split('.')[0]}.`));
    L.push('');
  }

  L.push('## Not addressed, and why');
  L.push('');
  ((S.cached[c.sku_id] || {}).not_touching || []).forEach(x => {
    L.push(`- **${x.item}** (${x.rule_ids.join(', ')}) — ${x.reason}`);
  });
  L.push('');
  L.push('---');
  L.push('');
  L.push(`Open items needing a fact from the brand: ${S.edits.filter((e, i) => S.decisions[i] === 'approved' && e.needs_client_input).length}. ` +
    `Nothing above was published automatically; every change on this page was approved by a human first.`);

  const md = L.join('\n');
  const out = $('md-out');
  out.textContent = md;
  out.classList.remove('hidden');
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${c.sku_id}-content-recommendation.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

boot();
