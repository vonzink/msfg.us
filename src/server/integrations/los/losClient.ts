/**
 * Loan Origination System (LOS) hand-off client (SERVER-ONLY).
 *
 * Forwards a captured application to the app.msfgco.com LOS, authenticated with
 * the signed-in user's Cognito **id_token** as a Bearer — matching the existing
 * MSFG apps, whose access tokens omit the `email` claim the backend needs to
 * resolve/materialize the user (see mortgage-app/frontend apiClient.js).
 *
 * Design contract:
 *  - DISABLED unless `LOS_API_BASE` is set → returns `{ skipped: true }`, no
 *    network call. The wizard's lead/application capture is unaffected.
 *  - BEST-EFFORT: hard timeout, all failures are caught and returned as
 *    `{ ok: false }` (never thrown to the user). The hand-off must never block
 *    or break the apply flow — Postgres remains the system-of-record.
 *  - The exact endpoint/path is the single `LOS_PATH` constant below; the base
 *    is env-driven. Changing where applications land is a one-line edit.
 */
import { serverEnv, losConfigured } from "@/lib/env";
import type { IntakeDTO } from "@/lib/applyIntake";

/**
 * Path appended to `LOS_API_BASE` for the create-application call. Kept as a
 * lone constant so re-pointing the hand-off is a one-line change. If your LOS
 * base already includes the full path, set this to "".
 */
const LOS_PATH = "/api/loan-applications/intake";

/** Hard timeout for the hand-off call (ms). */
const TIMEOUT_MS = 8_000;

export type LosApplicationPayload = IntakeDTO;

/** Result of a hand-off attempt. */
export interface LosResult {
  ok: boolean;
  /** True when LOS is not configured and no call was made. */
  skipped?: boolean;
  /** Application/loan id echoed by the LOS, when available. */
  applicationId?: string;
  /** Non-2xx status, when applicable. */
  status?: number;
  /** Short error message for logs (never surfaced to the user). */
  error?: string;
}

/** Shapes the LOS might echo back (only the id we care about). */
interface LosCreateResponse {
  id?: string | number;
  applicationId?: string | number;
  application?: { id?: string | number };
}

/**
 * Create a loan application in the LOS. `idToken` is the verified Cognito
 * id_token of the signed-in user (sent as `Authorization: Bearer <id_token>`).
 * Returns `{ skipped: true }` when LOS_API_BASE is unset; otherwise a best-
 * effort result that NEVER throws.
 */
export async function createLoanApplication(
  idToken: string,
  payload: LosApplicationPayload,
): Promise<LosResult> {
  if (!losConfigured()) return { ok: false, skipped: true };
  if (!idToken) return { ok: false, error: "missing id_token" };

  const url = `${serverEnv.LOS_API_BASE}${LOS_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[los] create application responded ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, status: res.status, error: body.slice(0, 300) };
    }

    const data = (await res.json().catch(() => null)) as LosCreateResponse | null;
    const applicationId = data?.applicationId ?? data?.id ?? data?.application?.id;
    return { ok: true, applicationId: applicationId != null ? String(applicationId) : undefined };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `LOS hand-off timed out after ${TIMEOUT_MS}ms`
        : `LOS hand-off failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[los] ${message}`);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
