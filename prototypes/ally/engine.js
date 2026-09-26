/* =============================================================
   Ally — Competitor Content Intelligence
   Rules engine (T1 deterministic checks) + competitive benchmarks

   Design principle: anything that can be decided by counting or
   matching is decided here, in code — never by the model. The model
   is reserved for judgment (T2) and for writing replacement copy.
   ============================================================= */

const STOPWORDS = new Set(`a an and are as at be been but by can for from has have in into is it its of on or our so than that the their them these they this to up was were what when which who will with you your all any each more most other some such only own same too very just also
is was has have do does did been being`.split(/\s+/));

// Filtered out of THEME-GAP analysis only (generic verbs/adjectives and the
// category words every listing shares). Deliberately NOT applied to the
// keyword-repetition check, where "toy" appearing three times is the finding.
const NOISE_TERMS = new Set(`water toy toys dog dogs pack cans can bottle flavor flavour sparkling made make makes get like
designed design using include includes included available perfect great really always first every keeps helps
offers delivers comes turn time need want find your with while over each more your them this that
product products your also just even much many while when
`.split(/\s+/));

const singular = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) ? w.slice(0, -1) : w;
const words = t => (t || '').toLowerCase().match(/[a-z0-9#'-]+/g) || [];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- field access ---------- */
function fieldValues(sku, field) {
  if (field === 'title') return [{ label: 'Title', text: sku.title }];
  if (field === 'description') return [{ label: 'Description', text: sku.description }];
  if (field === 'bullets') return sku.bullets.map((b, i) => ({ label: `Bullet ${i + 1}`, text: b }));
  return [];
}

/* ---------- individual check types ---------- */

function checkBannedTerms(rule, label, text) {
  const hits = [];
  (rule.check.terms || []).forEach(term => {
    const re = new RegExp(`(^|[^a-z0-9])(${esc(term)})(?![a-z0-9])`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) { hits.push(m[2]); if (hits.length > 6) break; }
  });
  (rule.check.patterns || []).forEach(p => {
    const re = new RegExp(p, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) { hits.push(m[0]); if (hits.length > 6) break; }
  });
  if (!hits.length) return null;
  const uniq = [...new Set(hits.map(h => h.trim()))];
  return { evidence: uniq, detail: `${label} contains ${uniq.map(u => `“${u}”`).join(', ')}` };
}

function checkMaxLength(rule, label, text) {
  const n = text.length;
  if (n > rule.check.limit) return { evidence: [`${n} chars`], detail: `${label} is ${n} characters, over the ${rule.check.limit} limit`, severity: 'fail' };
  if (rule.check.advisory_max && n > rule.check.advisory_max) {
    return { evidence: [`${n} chars`], detail: `${label} is ${n} characters — inside the ${rule.check.limit} limit but past the ~${rule.check.advisory_max} the rule recommends for mobile`, severity: 'advisory' };
  }
  return null;
}

function checkCapsRun(rule, label, text) {
  const toks = text.split(/\s+/);
  let run = [], best = [];
  toks.forEach(t => {
    const clean = t.replace(/[^A-Za-z]/g, '');
    if (clean.length >= 2 && clean === clean.toUpperCase()) run.push(t);
    else { if (run.length > best.length) best = run; run = []; }
  });
  if (run.length > best.length) best = run;
  if (best.length < (rule.check.min_run_words || 2)) return null;
  return { evidence: [best.join(' ')], detail: `${label} uses all caps: “${best.join(' ')}”` };
}

function checkCapsRatio(rule, label, text) {
  let body = text;
  if (rule.check.ignore_header) body = body.replace(/^[^:]{2,40}:\s*/, '');
  const toks = body.split(/\s+/).filter(t => t.replace(/[^A-Za-z]/g, '').length > 1);
  if (toks.length < 3) return null;
  const caps = toks.filter(t => { const c = t.replace(/[^A-Za-z]/g, ''); return c && c === c.toUpperCase(); });
  const ratio = caps.length / toks.length;
  if (ratio <= (rule.check.max_ratio || 0.4)) return null;
  return { evidence: [`${Math.round(ratio * 100)}% caps`], detail: `${label} is ${Math.round(ratio * 100)}% capitalised outside the header` };
}

function checkRepetition(rule, label, text) {
  const counts = {};
  words(text).filter(w => w.length >= (rule.check.min_word_length || 3) && !STOPWORDS.has(w))
    .forEach(w => { const s = singular(w); counts[s] = (counts[s] || 0) + 1; });
  const over = Object.entries(counts).filter(([, c]) => c > (rule.check.max_occurrences || 2))
    .sort((a, b) => b[1] - a[1]);
  if (!over.length) return null;
  return {
    evidence: over.map(([w, c]) => `${w} ×${c}`),
    detail: `${label} repeats ${over.map(([w, c]) => `“${w}” ${c} times`).join(', ')}`
  };
}

function checkHeaderFormat(rule, label, text) {
  if (new RegExp(rule.check.pattern).test(text)) return null;
  return { evidence: [text.slice(0, 40) + (text.length > 40 ? '…' : '')], detail: `${label} has no “HEADER: benefit” structure` };
}

/* ---------- field-level checks that run once per SKU ---------- */

function bulletCountCheck(rule, sku) {
  const n = sku.bullets.length;
  if (rule.check.type === 'max_count' && n > rule.check.limit) {
    return [{ field: 'bullets', evidence: [`${n} bullets`], detail: `${n} bullets, over the ${rule.check.limit} allowed`, severity: 'fail' }];
  }
  return [];
}

function imageCountCheck(rule, sku) {
  const n = sku.image_urls.length;
  const bp = rule.check.best_practice || 5;
  if (n < (rule.check.minimum || 1)) {
    return [{ field: 'images', evidence: [`${n} images`], detail: `No main image`, severity: 'fail' }];
  }
  if (n < bp) {
    return [{ field: 'images', evidence: [`${n} images`], detail: `${n} image${n === 1 ? '' : 's'} against the ${bp}–7 the rule calls best practice`, severity: 'advisory' }];
  }
  return [];
}

/* ---------- the runner ---------- */

const DISPATCH = {
  banned_terms: checkBannedTerms,
  max_length: checkMaxLength,
  caps_run: checkCapsRun,
  caps_ratio: checkCapsRatio,
  repetition: checkRepetition,
  header_format: checkHeaderFormat
};

function runRules(sku, rules) {
  const raw = [];
  rules.forEach(rule => {
    if (rule.tier !== 'T1') return;
    const t = rule.check.type;

    if (t === 'max_count') { bulletCountCheck(rule, sku).forEach(r => raw.push({ ...r, rule })); return; }
    if (t === 'min_count') { imageCountCheck(rule, sku).forEach(r => raw.push({ ...r, rule })); return; }

    const fn = DISPATCH[t];
    if (!fn) return;

    rule.fields.forEach(field => {
      const hits = [];
      fieldValues(sku, field).forEach(({ label, text }) => {
        if (!text) return;
        const res = fn(rule, label, text);
        if (res) hits.push({ field, label, rule, severity: res.severity || 'fail', ...res });
      });

      // One rule failing on most bullets is one systemic problem, not five
      // findings. Collapse it so the report reads like a person wrote it.
      if (field === 'bullets' && hits.length >= 3) {
        raw.push({
          field, label: `Bullets (${hits.length} of ${sku.bullets.length})`, rule,
          severity: hits[0].severity,
          evidence: hits.map(h => h.label),
          detail: `${hits.length} of ${sku.bullets.length} bullets: ${hits[0].detail.replace(/^Bullet \d+ /, '')}`,
          systemic: true
        });
      } else {
        hits.forEach(h => raw.push(h));
      }
    });
  });

  // Dedupe: one phrase flagged by several rules becomes ONE finding with
  // multiple citations, instead of the same violation reported five times.
  const byKey = new Map();
  raw.forEach(f => {
    const key = `${f.label || f.field}::${(f.evidence || []).join('|').toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...f, rule_ids: [f.rule.id], rules: [f.rule] });
    } else {
      const ex = byKey.get(key);
      if (!ex.rule_ids.includes(f.rule.id)) { ex.rule_ids.push(f.rule.id); ex.rules.push(f.rule); }
    }
  });

  return [...byKey.values()].map(f => ({
    field: f.field,
    label: f.label || f.field,
    detail: f.detail,
    evidence: f.evidence,
    severity: f.severity,
    rule_ids: f.rule_ids,
    impact: f.rules.some(r => r.impact === 'compliance') ? 'compliance'
      : f.rules.some(r => r.impact === 'discoverability') ? 'discoverability' : 'conversion',
    kind: 'rule'
  }));
}

/* ---------- metrics + competitive benchmark ---------- */

function metrics(sku) {
  const bl = sku.bullets.map(b => b.length);
  return {
    titleChars: sku.title.length,
    bulletCount: sku.bullets.length,
    avgBullet: bl.length ? Math.round(bl.reduce((a, b) => a + b, 0) / bl.length) : 0,
    descChars: sku.description.length,
    images: sku.image_urls.length
  };
}

const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;

function themeGaps(client, competitors) {
  const clientTerms = new Set(
    words(`${client.title} ${client.bullets.join(' ')} ${client.description}`)
      .map(singular)
  );
  const freq = {};
  competitors.forEach(c => {
    const seen = new Set(
      words(`${c.bullets.join(' ')} ${c.description}`)
        .filter(w => w.length > 4 && !STOPWORDS.has(w) && !NOISE_TERMS.has(w))
        .map(singular)
    );
    seen.forEach(w => { if (!clientTerms.has(w) && !NOISE_TERMS.has(w)) (freq[w] = freq[w] || []).push(c.brand); });
  });
  return Object.entries(freq)
    .filter(([, brands]) => brands.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([term, brands]) => ({ term, brands: [...new Set(brands)] }));
}

function competitiveFindings(client, competitors) {
  const cm = metrics(client);
  const comp = competitors.map(metrics);
  const out = [];

  const compAvgBullet = avg(comp.map(m => m.avgBullet));
  if (compAvgBullet && cm.avgBullet < compAvgBullet * 0.65) {
    out.push({
      field: 'bullets', label: 'Bullets', kind: 'competitive', impact: 'conversion', severity: 'gap',
      detail: `Bullets average ${cm.avgBullet} characters against a competitor average of ${compAvgBullet} — the count is at the maximum, the substance is not`,
      evidence: [`${cm.avgBullet} vs ${compAvgBullet} chars`], rule_ids: ['AMZ-BULLET-04']
    });
  }

  const compAvgDesc = avg(comp.map(m => m.descChars));
  if (compAvgDesc && cm.descChars < compAvgDesc * 0.8) {
    out.push({
      field: 'description', label: 'Description', kind: 'competitive', impact: 'conversion', severity: 'gap',
      detail: `Description is ${cm.descChars} characters against a competitor average of ${compAvgDesc}, with the space spent on promotion rather than product detail`,
      evidence: [`${cm.descChars} vs ${compAvgDesc} chars`], rule_ids: ['AMZ-DESC-02']
    });
  }

  const compAvgImg = avg(comp.map(m => m.images));
  if (cm.images < compAvgImg) {
    out.push({
      field: 'images', label: 'Images', kind: 'competitive', impact: 'conversion', severity: 'gap',
      detail: `${cm.images} image${cm.images === 1 ? '' : 's'} against a competitor average of ${compAvgImg}`,
      evidence: [`${cm.images} vs ${compAvgImg}`], rule_ids: ['AMZ-IMG-01']
    });
  }

  const gaps = themeGaps(client, competitors);
  if (gaps.length) {
    out.push({
      field: 'bullets', label: 'Content themes', kind: 'competitive', impact: 'discoverability', severity: 'gap',
      detail: `Competitors cover ground this listing never mentions: ${gaps.slice(0, 5).map(g => `${g.term} (${g.brands.join(', ')})`).join('; ')}`,
      evidence: gaps.slice(0, 5).map(g => g.term), rule_ids: ['AMZ-BULLET-04', 'AMZ-TITLE-06'],
      themes: gaps
    });
  }

  return out;
}

/* ---------- prioritisation ---------- */

const IMPACT_WEIGHT = { compliance: 100, discoverability: 60, conversion: 40 };
const SEVERITY_WEIGHT = { fail: 25, gap: 15, advisory: 5 };
const FIELD_WEIGHT = { title: 12, bullets: 8, description: 6, images: 2 };

function prioritise(findings) {
  const scored = findings.map(f => ({
    ...f,
    score: (IMPACT_WEIGHT[f.impact] || 40) + (SEVERITY_WEIGHT[f.severity] || 10) + (FIELD_WEIGHT[f.field] || 0)
  })).sort((a, b) => b.score - a.score);

  // Spread the top 3 across fields: three fixes to one field is one fix.
  const top = [], usedFields = new Set();
  scored.forEach(f => {
    if (top.length >= 3) return;
    if (f.field === 'images') return;            // not editable from text — stays in "not touching"
    if (usedFields.has(f.field) && top.length < 3 && scored.some(s => !usedFields.has(s.field) && s.field !== 'images' && !top.includes(s))) return;
    top.push(f); usedFields.add(f.field);
  });
  scored.forEach(f => { if (top.length < 3 && !top.includes(f) && f.field !== 'images') top.push(f); });

  return { top: top.slice(0, 3), all: scored };
}

/* ---------- validator: re-run T1 checks over PROPOSED copy ---------- */

function validateEdit(edit, rules) {
  const fakeSku = {
    title: edit.field === 'title' ? edit.after : '',
    bullets: edit.field.startsWith('bullet') ? [edit.after] : [],
    description: edit.field === 'description' ? edit.after : '',
    image_urls: []
  };
  const fieldName = edit.field === 'title' ? 'title' : edit.field === 'description' ? 'description' : 'bullets';
  const violations = runRules(fakeSku, rules.filter(r =>
    r.tier === 'T1' && r.fields.includes(fieldName) && r.check.type !== 'min_count' && r.check.type !== 'max_count'
  )).filter(v => v.severity === 'fail');
  return { pass: violations.length === 0, violations };
}

window.AllyEngine = { runRules, metrics, competitiveFindings, prioritise, validateEdit, themeGaps, avg };
