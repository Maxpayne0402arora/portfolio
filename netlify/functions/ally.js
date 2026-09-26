/* =============================================================
   /api/ally  —  drafting step for Competitor Content Intelligence

   This function does ONE job: write replacement copy for edits the
   deterministic engine has already identified and prioritised. It does
   not decide what is wrong (code did that), it does not count anything,
   and it does not get the last word — whatever it returns is re-checked
   against the same rules in the browser before a human sees it.

   Falls back cleanly: any failure returns a non-200 and the client
   renders pre-computed recommendations instead, so the demo never dies.
   ============================================================= */

const MODEL = 'gemini-2.0-flash';

/* ---- The prompt. Every constraint below exists for a named failure. ---- */
function buildPrompt({ client, competitors, findings, rules }) {
  const ruleLines = rules.map(r => `${r.id} | ${r.name} | ${r.text}`).join('\n');

  const competitorBlock = competitors.map(c => [
    `--- ${c.brand} (${c.sku_id})`,
    `title: ${c.title}`,
    ...c.bullets.map((b, i) => `bullet_${i + 1}: ${b}`),
    `description: ${c.description}`,
    `image_count: ${c.image_urls.length}`
  ].join('\n')).join('\n\n');

  const clientBlock = [
    `brand: ${client.brand}`,
    `sku_id: ${client.sku_id}`,
    `category: ${client.category}`,
    `title: ${client.title}`,
    ...client.bullets.map((b, i) => `bullet_${i + 1}: ${b}`),
    `description: ${client.description}`,
    `image_count: ${client.image_urls.length}`
  ].join('\n');

  const findingBlock = findings.map((f, i) =>
    `${i + 1}. field=${f.field} | impact=${f.impact} | rules=${f.rule_ids.join(',')} | ${f.detail}`
  ).join('\n');

  return `You are a content strategist for brands selling on Amazon. You rewrite listing copy so it is compliant with the retailer's guidelines AND competitive against the specific products it sits beside on the shelf.

<rules>
${ruleLines}
</rules>

<client_listing>
${clientBlock}
</client_listing>

<competitor_listings>
${competitorBlock}
</competitor_listings>

<prioritised_findings>
${findingBlock}
</prioritised_findings>

TASK
Write exactly one edit for each of the ${findings.length} findings above, in the same order, for the field each names.

HARD CONSTRAINTS — each of these prevents a specific failure:
1. Use ONLY product facts that appear in <client_listing>. If an improvement needs a fact that is not there — a flavour name, a size or weight range, a material, a certification, a nutrition figure — do NOT invent it, do NOT borrow it from a competitor, and do NOT hedge it with vague wording. Write the best edit possible without it, set "needs_client_input": true, and say in "input_needed" exactly which fact is missing and why it matters.
2. Where the client listing contradicts itself, say so in "input_needed" rather than silently picking one version.
3. Competitor copy is EVIDENCE OF A GAP, never a template. Never reuse a competitor's phrasing, and never assume a competitor's claim is true of this product. Some competitor listings break the rules above — do not copy a violation just because a competitor shipped it.
4. Every edit must satisfy every rule in <rules> that applies to its field. Remove a non-compliant claim rather than softening it.
5. Never name another brand in the copy itself.
6. For the "bullets" field, return all bullets as ONE string with " | " between them, each formatted "Header: benefit sentence".
7. Write in third person, customer-facing. No first-person seller voice, no promotional or urgency language, no guarantees, no ratings or testimonial references, no price or shipping mentions.

Return ONLY valid JSON, no markdown fence, in exactly this shape:
{"edits":[{"field":"title|bullets|description","before":"<current copy, bullets joined with | >","after":"<replacement copy>","why":"<2-3 sentences: what this fixes and what it wins, referencing the measured gap>","rule_ids":["AMZ-..."],"competitor_reference":"<what a named competitor does better on this field, as evidence — not copy to reuse>","needs_client_input":true|false,"input_needed":"<the missing fact and why it matters, or empty string>"}]}`;
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.Gemini_Key;
  // No key configured: tell the client to fall back rather than erroring loudly.
  if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: 'model_unavailable' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'bad_json' }) }; }

  const { client, competitors, findings, rules } = payload;
  if (!client || !Array.isArray(competitors) || !Array.isArray(findings) || !findings.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_fields' }) };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt({ client, competitors, findings, rules: rules || [] }) }] }],
          generationConfig: {
            // Low temperature: this is a constrained rewrite, not a creative task.
            temperature: 0.25,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error('Gemini error:', JSON.stringify(data).slice(0, 500));
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'model_error' }) };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
    } catch {
      console.error('Unparseable model output:', text.slice(0, 300));
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'unparseable' }) };
    }

    // Shape guard: the browser re-validates content, but the envelope is checked here.
    const edits = (parsed.edits || []).filter(e => e && e.field && typeof e.after === 'string' && e.after.trim())
      .map(e => ({
        field: String(e.field),
        before: String(e.before || ''),
        after: String(e.after).trim(),
        why: String(e.why || ''),
        rule_ids: Array.isArray(e.rule_ids) ? e.rule_ids.map(String) : [],
        competitor_reference: String(e.competitor_reference || ''),
        needs_client_input: Boolean(e.needs_client_input),
        input_needed: String(e.input_needed || '')
      }));

    if (!edits.length) return { statusCode: 502, headers, body: JSON.stringify({ error: 'no_edits' }) };

    return { statusCode: 200, headers, body: JSON.stringify({ source: 'live', model: MODEL, edits }) };
  } catch (err) {
    console.error('ally handler error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'internal' }) };
  }
};
