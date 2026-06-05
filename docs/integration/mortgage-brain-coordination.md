# Mortgage Brain ↔ Website — go-live coordination

From: the **msfg.us website** team
To: the **MSFG Mortgage Brain** (`msfg-rag`) team
Status: website integration **built + merged**, gated off (`config.ai.brain.enabled=false`) until the brain has a reachable prod URL.

We implemented to your contract (`msfg-rag/docs/website-integration.md`). The website calls
`POST /api/ai/mortgage/ask` and renders your `{answer, citations, disclaimer,
humanEscalationRequired}` **verbatim** (disclaimer on every answer; prominent
loan-officer CTA when `humanEscalationRequired`; refusals shown as-is). One design
choice that matters for you: **we call the brain server-to-server (a proxy), not from
the browser.**

---

## What we need from you (blocks go-live)

1. **Production base URL.** The deployed brain URL behind Nginx, e.g.
   `https://api.<domain>`. We set `config.ai.brain.baseUrl` to this and flip
   `enabled:true`.

2. **Rate-limit handling for our proxy — important.** Because we proxy
   server-side, **every visitor's request reaches you from our single app-server
   IP.** Your documented limit is *10 questions/minute per IP* — applied to our
   server IP, that throttles the entire website to 10 q/min total. Pick one:
   - **(Preferred) Rate-limit on `X-Forwarded-For`.** We already send the real
     visitor IP as `X-Forwarded-For` on every call. If you trust our proxy and
     apply the per-IP limit to that header, per-visitor limiting works correctly.
   - **Or whitelist/exempt our app-server IP** (we also keep our own per-visitor
     limit on our side as a backstop).

3. **Network routing.** Our app server is an AWS EC2 instance
   (public IP **`52.203.186.217`** — please confirm whether you want public
   ingress from it, or, if the brain runs in the **same VPC**, an internal/private
   address so traffic stays off the public internet and latency drops). Tell us
   which hostname/URL to use accordingly.

4. **Auth.** Your contract says the public endpoints need no key. Confirm that
   holds in prod. If you later require one, give us the header name + scheme — we
   store it as an encrypted per-tenant secret (`brain_api_key`) and send it as
   `Authorization: Bearer <key>`; **we never put keys in the browser.**

---

## What we provide / already handle

- **Verbatim rendering.** We never rewrite, truncate, or paraphrase `answer`,
  `disclaimer`, or `citations`. Citations are display-formatted only (null fields
  skipped, newlines sanitized). Refusals/escalations are rendered as the compliant
  outcome — we do not substitute our own answer.
- **Request shape** matches your DTO: `{ sessionId, question, conversationId?,
  loanType?, state? }` (optional fields omitted when absent; `sessionId` is a
  stable per-visitor UUID; `conversationId` echoed back for follow-ups).
- **Timeouts:** 60s client timeout (we honor your "3–10s, don't time out below 60s").
- **`X-Forwarded-For`:** the real visitor IP on every request (see #2).
- **CORS is NOT on our critical path.** Since we proxy server-side, your
  `CORS_ALLOWED_ORIGINS` does not gate our traffic. For completeness / any future
  *direct* browser embedding, our origins are:
  `https://staging.msfg.us`, `https://msfg.us`, `https://www.msfg.us`,
  and `http://localhost:3000` (dev).

---

## Our flip-the-switch steps (once #1–#4 are answered)

1. Set MSFG `config.ai.brain = { enabled: true, baseUrl: "<your prod URL>" }`
   (via our `/admin/config` editor or seed).
2. (If required) seal `brain_api_key` as an encrypted tenant secret.
3. Redeploy + verify the homepage chat renders live, cited answers.

Our integration design + plan (in the `msfg.us` repo):
`docs/superpowers/specs/2026-06-05-mortgage-brain-chat-integration-design.md` and
`docs/superpowers/plans/2026-06-05-mortgage-brain-chat-integration.md`.
