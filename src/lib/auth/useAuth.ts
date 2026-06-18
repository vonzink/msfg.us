"use client";

/**
 * Client hook that reads the current session from `GET /api/v1/auth/me`.
 *
 * Returns derived identity only ({ sub, email, name }) — NEVER tokens (those
 * stay in httpOnly cookies, server-side). `configured` reflects whether Cognito
 * SSO is wired at all. `refresh()` re-reads /me — call it after an inline
 * sign-in (AccountPanel) so dependent effects (e.g. the LOS hand-off) re-fire.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
}

export interface AuthState {
  /** True until the first /me response resolves. */
  loading: boolean;
  /** Whether Cognito SSO is configured on the server. */
  configured: boolean;
  /** Whether there is a valid session. */
  authenticated: boolean;
  user: AuthUser | null;
  /** Re-read /api/v1/auth/me (e.g. after an inline sign-in). */
  refresh: () => void;
}

interface MeResponse {
  authenticated: boolean;
  configured?: boolean;
  user?: AuthUser;
}

type ResolvedState = Omit<AuthState, "refresh">;

const SIGNED_OUT: ResolvedState = { loading: false, configured: false, authenticated: false, user: null };

export function useAuth(): AuthState {
  const [state, setState] = useState<ResolvedState>({
    loading: true,
    configured: false,
    authenticated: false,
    user: null,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store" });
      const data = res.ok ? ((await res.json()) as MeResponse) : null;
      if (!mounted.current) return;
      setState(
        data
          ? {
              loading: false,
              configured: Boolean(data.configured),
              authenticated: Boolean(data.authenticated),
              user: data.user ?? null,
            }
          : SIGNED_OUT,
      );
    } catch {
      if (mounted.current) setState(SIGNED_OUT);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { ...state, refresh: () => void load() };
}
