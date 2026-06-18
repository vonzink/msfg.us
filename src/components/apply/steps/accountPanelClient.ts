/**
 * Browser-side typed wrappers for the /api/v1/auth/* routes used by
 * AccountPanel. The fetch impl is injectable so the request shaping + response
 * parsing can be unit-tested without a DOM. A thrown fetch (offline) collapses
 * to { ok:false, error:"network" }.
 */

export type SignupResponse = { ok: true; status: "code_sent" | "exists" } | { ok: false; error: string };
export type ConfirmResponse = { ok: true } | { ok: false; error: string };
export type SigninResponse = { ok: true; status?: "unconfirmed" } | { ok: false; error: string };
export type ResendResponse = { ok: true } | { ok: false; error: string };

type Fetcher = typeof fetch;

async function postJson<T extends { ok: boolean }>(url: string, body: unknown, fetcher: Fetcher): Promise<T> {
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({ ok: false, error: "network" }))) as T;
  } catch {
    return { ok: false, error: "network" } as unknown as T;
  }
}

export function signup(
  input: { email: string; password: string; firstName?: string; lastName?: string },
  fetcher: Fetcher = fetch,
): Promise<SignupResponse> {
  return postJson<SignupResponse>("/api/v1/auth/signup", input, fetcher);
}

export function confirm(
  input: { email: string; password: string; code: string },
  fetcher: Fetcher = fetch,
): Promise<ConfirmResponse> {
  return postJson<ConfirmResponse>("/api/v1/auth/confirm", input, fetcher);
}

export function signin(
  input: { email: string; password: string },
  fetcher: Fetcher = fetch,
): Promise<SigninResponse> {
  return postJson<SigninResponse>("/api/v1/auth/signin", input, fetcher);
}

export function resend(input: { email: string }, fetcher: Fetcher = fetch): Promise<ResendResponse> {
  return postJson<ResendResponse>("/api/v1/auth/resend", input, fetcher);
}
