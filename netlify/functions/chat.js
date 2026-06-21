const RESUME_CONTEXT = `
Mayank Arora
Email: mayank_arora2021@pgp.isb.edu | Phone: +91 9986195122 | Location: Bengaluru

EDUCATION
- Indian School of Business (ISB): PGP, Majors in Marketing and Finance, GPA 3.56/4.0 (Jun 2020 - Aug 2021)
  Experiential Learning Program: Formulated marketing strategy for entry into the Indian EV market
- National Institute of Technology Karnataka (NIT-K): B.Tech in Mechanical Engineering (Jun 2012 - Jun 2016)
  Secured AIR 5994 (99.6 percentile) in AIEEE 2012 and AIR 13871 (98 percentile) in JEE 2012

WORK EXPERIENCE

Plum — Senior Product Manager, Retail Health Insurance (Apr 2026 – Present)
- Agent-Assisted Purchase Journey: Defined product strategy for a multi-insurer resume flow enabling agents to seamlessly take over an in-progress user session and drive purchase to completion; projected GMV impact of ₹3 Cr

Tata CliQ — Senior Product Manager, CX, Payments & Conversions (Oct 2024 – Apr 2026)
- Refund Experience Improvement: Reduced social escalations and refund-related call volumes by 30% by introducing penny testing to eliminate COD refund failures and automating seller QC, cutting refund timelines by 3 days
- Auto ticket creation for social escalations: Led product strategy for direct ticket creation in Salesforce Cloud based on sentiment analysis, reducing escalation resolution TAT by 1 day and repeat escalations by 20%
- Request a callback: Envisioned callback feature allowing customers to request a call at their preferred slot, ensuring higher FTR of 73% (vs 65%)
- Seamless payments: Launched CVV-less payments, international card transactions, and Native OTP to improve payment success rate from 75% to 80% — 5% conversion uplift (₹80 Cr impact)
- Express checkout: Spearheaded auto-applicable bank offers, improving checkout CTR by 20% and overall conversion by 6%
- Reducing cart abandonment: Devised strategy to reduce cart abandonment from 86% to 80% by streamlining retry payment flows and providing failure alerts within 2 mins
- B2B2C Luxury Expansion: Enabled ₹50 Cr GMV by launching a global sourcing model with cross-border CX (easy returns/cancellations, end-to-end tracking, QC checks)
- Multi-Brand Cash: Built a wallet-based promotion system with PDP, cart, and account visibility; auto-applicable on checkout, driving ₹40 Cr additional GMV, 18% conversion uplift, and 10% reduction in burn per order

Acko General Insurance — PM-2, Customer Experience (Mar 2022 – Sep 2024)
- Conversion funnel: Envisioned lead scoring module using CDP data to predict customer propensity to buy, improving quote conversion rate by 15% for auto insurance
- Asko (Gen AI B2C Conversational Bot): Drafted product roadmap for chatbot across pre-sales and post-sales journeys; reduced customer support cost by 30% (₹2 Cr saving) and improved sales by 10% (₹10 Cr revenue)
- Intent prediction: Developed smart IVR system using user activity to route calls to the right agent, improving speed of answer by 30 seconds

Ola Electric Mobility — MDP, Product and Program Management (Aug 2021 – Mar 2022)
- Spearheaded end-to-end D2C buy journey for Ola scooter — delivered at home like an e-commerce product with in-app loan, registration, and onboarding, improving monthly sales by ₹4 Cr
- Funnel analysis: Improved loan conversion rate by 30%, boosting sales by ₹5 Cr

Volvo-Eicher CV India — Deputy Manager, Product & Business Strategy (Jun 2016 – Mar 2020)
- Market research: Conducted user interviews and competition benchmarking, devised mining truck improving availability by 10% and sales by 15% (₹15 Cr)
- Design thinking: Improved delivery and unloading TAT by 6 hours (from 60 hrs) and improved truck utilization by 15% by introducing tractor trailer in the Indian market

ADDITIONAL INFO
- Conceptualized and executed a product roadmap for a conversational-style partner, boosting average order value by ₹200
- Total experience: 8+ years in product management across B2C, insurance, e-commerce, and automotive sectors
`;

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { message } = JSON.parse(event.body || '{}');
  if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message is required' }) };

  const systemPrompt = `You are a helpful assistant on Mayank Arora's portfolio website. Answer questions about Mayank based strictly on his resume below. Be concise, friendly, and professional. If asked something not covered in the resume, say you don't have that information but suggest the visitor reach out to Mayank directly.

Resume:
${RESUME_CONTEXT}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.4 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to get response from AI' }) };
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
