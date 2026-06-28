"use client";

/**
 * Nav "Sign in" affordance.
 *
 * "Sign in" links STRAIGHT to the MSFG app's passwordless email-code login
 * (app.msfgco.com/signin) — that page sends the one-time code and drops the user
 * into app.msfgco.com. No msfg.us Hosted-UI hop, and it works even when msfg.us
 * Cognito isn't configured (previously an inert `#`).
 *
 * When the shared Cognito session IS configured and the visitor is already
 * signed in, it flips to "Sign out" (/auth/logout). Uses `/api/v1/auth/me` via
 * useAuth — never touches tokens.
 */
import { useAuth } from "@/lib/auth/useAuth";
import { APP_URL } from "@/lib/auth/appLink";

const LINK_CLASS =
  "hidden px-1.5 text-[15.5px] font-semibold text-white min-[981px]:inline";

/** app.msfgco.com passwordless sign-in — the page that sends the email one-time code. */
const SIGN_IN_HREF = `${APP_URL}/signin`;

export function NavAuthLink() {
  const auth = useAuth();

  if (auth.configured && auth.authenticated) {
    return (
      <a href="/auth/logout" className={LINK_CLASS}>
        Sign out
      </a>
    );
  }

  return (
    <a href={SIGN_IN_HREF} className={LINK_CLASS}>
      Sign in
    </a>
  );
}
