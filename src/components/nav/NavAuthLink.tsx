"use client";

/**
 * Nav "Sign in" affordance.
 *
 * - Auth NOT configured → renders the original inert "Sign in" link (href="#"),
 *   so nothing changes visually in a no-Cognito deploy.
 * - Auth configured + signed out → links to `/auth/login` (Hosted UI), with a
 *   `returnTo` of the current path so the user lands back where they were.
 * - Auth configured + signed in → shows "Sign out" → `/auth/logout`.
 *
 * Uses `/api/v1/auth/me` (via useAuth) — never touches tokens. During the brief
 * initial probe it shows the inert link to avoid layout shift / flashes.
 */
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { safeReturnTo } from "@/lib/auth/returnTo";

const LINK_CLASS =
  "hidden px-1.5 text-[15.5px] font-semibold text-white min-[981px]:inline";

export function NavAuthLink() {
  const auth = useAuth();
  const pathname = usePathname();

  if (auth.loading || !auth.configured) {
    return (
      <a href="#" className={LINK_CLASS}>
        Sign in
      </a>
    );
  }

  if (auth.authenticated) {
    return (
      <a href="/auth/logout" className={LINK_CLASS}>
        Sign out
      </a>
    );
  }

  const returnTo = safeReturnTo(pathname, "/");
  return (
    <a href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`} className={LINK_CLASS}>
      Sign in
    </a>
  );
}
