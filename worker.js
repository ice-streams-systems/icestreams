/**
 * ═════════════════════════════════════════════════════════════
 *  ICE STREAMS SYSTEMS — Contact Form Worker
 *  Receives POSTs from icestreams.io contact form,
 *  validates, rate-limits, and dispatches via Resend.
 * ═════════════════════════════════════════════════════════════
 *
 *  Required secrets (set via `wrangler secret put`):
 *    RESEND_API_KEY   — Resend API key
 *    DESTINATION      — where form submissions land (e.g. your Gmail)
 *    FROM_ADDRESS     — sender (e.g. noreply@icestreams.io)
 *    ALLOWED_ORIGIN   — https://icestreams.io
 */

export default {
  async fetch(request, env, ctx) {
    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'METHOD_NOT_ALLOWED' }, 405, env);
    }

    // ── Parse body ──
    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: 'INVALID_JSON' }, 400, env);
    }

    // ── Validate ──
    const name  = String(data.name  || '').trim();
    const org   = String(data.org   || '').trim();
    const email = String(data.email || '').trim();
    const type  = String(data.type  || '').trim();
    const brief = String(data.brief || '').trim();
    const hp    = String(data.hp    || '').trim(); // honeypot

    // Honeypot — bots fill this, humans don't see it
    if (hp) return json({ ok: true }, 200, env); // silently drop

    if (!name  || name.length  > 120) return json({ error: 'BAD_NAME' },  400, env);
    if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error: 'BAD_EMAIL' }, 400, env);
    if (!brief || brief.length < 10 || brief.length > 5000)
      return json({ error: 'BAD_BRIEF' }, 400, env);
    if (org.length   > 200)  return json({ error: 'BAD_ORG' },  400, env);
    if (type.length  > 60)   return json({ error: 'BAD_TYPE' }, 400, env);

    // ── Compose email ──
    const subject = `[ISS] New Transmission: ${type || 'Inquiry'} — ${name}`;
    const text    = [
      `NEW TRANSMISSION — icestreams.io`,
      ``,
      `DESIGNATION:    ${name}`,
      `ORGANIZATION:   ${org || '(not provided)'}`,
      `CHANNEL:        ${email}`,
      `ENGAGEMENT:     ${type || '(not specified)'}`,
      ``,
      `BRIEF:`,
      brief,
      ``,
      `---`,
      `Timestamp: ${new Date().toISOString()}`,
      `Source IP: ${request.headers.get('CF-Connecting-IP') || 'unknown'}`,
      `User-Agent: ${request.headers.get('User-Agent') || 'unknown'}`,
    ].join('\n');

    const html = `
<div style="font-family:monospace;background:#0E1014;color:#E8E8E8;padding:24px;border-left:3px solid #2E86AB;">
  <div style="color:#A8D8EA;font-size:14px;letter-spacing:2px;margin-bottom:16px;">
    NEW TRANSMISSION — icestreams.io
  </div>
  <table style="border-collapse:collapse;width:100%;">
    <tr><td style="color:#6B7B8D;padding:4px 12px 4px 0;width:140px;">DESIGNATION</td><td style="color:#F0F4F8;">${escapeHtml(name)}</td></tr>
    <tr><td style="color:#6B7B8D;padding:4px 12px 4px 0;">ORGANIZATION</td><td style="color:#F0F4F8;">${escapeHtml(org) || '<span style="color:#6B7B8D;">(not provided)</span>'}</td></tr>
    <tr><td style="color:#6B7B8D;padding:4px 12px 4px 0;">CHANNEL</td><td><a href="mailto:${escapeHtml(email)}" style="color:#A8D8EA;">${escapeHtml(email)}</a></td></tr>
    <tr><td style="color:#6B7B8D;padding:4px 12px 4px 0;">ENGAGEMENT</td><td style="color:#F0F4F8;">${escapeHtml(type) || '<span style="color:#6B7B8D;">(not specified)</span>'}</td></tr>
  </table>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #1C2028;">
    <div style="color:#6B7B8D;font-size:12px;letter-spacing:2px;margin-bottom:8px;">BRIEF</div>
    <div style="color:#D8D8D8;white-space:pre-wrap;line-height:1.6;">${escapeHtml(brief)}</div>
  </div>
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #1C2028;color:#6B7B8D;font-size:11px;">
    ${new Date().toISOString()} / ${escapeHtml(request.headers.get('CF-Connecting-IP') || 'unknown')}
  </div>
</div>`.trim();

    // ── Send via Resend ──
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:     env.FROM_ADDRESS,
          to:       [env.DESTINATION],
          reply_to: email,
          subject:  subject,
          text:     text,
          html:     html,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Resend error:', res.status, errText);
        return json({ error: 'DISPATCH_FAILED' }, 502, env);
      }

      return json({ ok: true }, 200, env);

    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'INTERNAL' }, 500, env);
    }
  }
};

// ── Helpers ──

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
    },
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}