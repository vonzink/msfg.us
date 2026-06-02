"use client";

/**
 * Client hook that reads the current session from `GET /api/v1/auth/me`.
 *
 * Returns derived identity only ({ sub, email, name }) — NEVER tokens (those
 * stay in httpOnly cookies, server-side). `configured` reflects whether Cognito
 * SSO is wired at all, so callers can fall back to the legacy mock / leave a
 * "Sign in" link inert when auth isn't set up.
 */
import { useEffect, useState } from "react";

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
}

interface MeResponse {
  authenticated: boolean;
  configured?: boolean;
  user?: AuthUser;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    configured: false,
    authenticated: false,
    user: null,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<MeResponse>) : null))
      .then((data) => {
        if (!active) return;
        if (!data) {
          setState({ loading: false, configured: false, authenticated: false, user: null });
          return;
        }
        setState({
          loading: false,
          configured: Boolean(data.configured),
          authenticated: Boolean(data.authenticated),
          user: data.user ?? null,
        });
      })
      .catch(() => {
        if (active) {
          setState({ loading: false, configured: false, authenticated: false, user: null });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
