"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { signup, confirm, signin, resend } from "./accountPanelClient";

type Mode = "signup" | "code" | "signin";

const INPUT =
  "h-12 w-full rounded-lg border-[1.5px] border-line bg-white px-4 text-[16px] text-ink outline-none focus:border-green-600";
const PRIMARY =
  "flex h-[58px] w-full items-center justify-center gap-2 rounded-lg bg-green-600 text-[17px] font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-60";
const LINK = "font-semibold text-green-700 underline";

/**
 * Inline branded sign-up / sign-in for the apply-finish screen. Email is
 * pre-filled from the funnel and locked in signup/code mode so the LOS hand-off
 * ownership match (signed-in email === lead email) always holds. On confirm /
 * sign-in success it calls onAuthed() — the parent then refreshes useAuth and
 * the hand-off effect fires.
 */
export function AccountPanel({
  initialEmail,
  initialFirstName,
  initialLastName,
  onAuthed,
}: {
  initialEmail: string;
  initialFirstName?: string;
  initialLastName?: string;
  onAuthed: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailLocked = mode !== "signin" && Boolean(initialEmail);

  function reset() {
    setError(null);
    setNotice(null);
  }

  async function onSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    reset();
    const res = await signup({ email, password, firstName: initialFirstName, lastName: initialLastName });
    setPending(false);
    if (res.ok && res.status === "code_sent") {
      setMode("code");
      setNotice("We emailed you a 6-digit code.");
      return;
    }
    if (res.ok && res.status === "exists") {
      setMode("signin");
      setNotice("You already have an account — please sign in.");
      return;
    }
    if (!res.ok) setError(res.error === "network" ? "Network error — please try again." : res.error);
  }

  async function onConfirmSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    reset();
    const res = await confirm({ email, password, code });
    setPending(false);
    if (res.ok) {
      onAuthed();
      return;
    }
    setError(
      res.error === "code_mismatch"
        ? "That code didn't match. Check it and try again."
        : res.error === "expired"
          ? "That code expired. Tap “Resend code”."
          : res.error === "network"
            ? "Network error — please try again."
            : res.error,
    );
  }

  async function onSigninSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    reset();
    const res = await signin({ email, password });
    setPending(false);
    if (res.ok && res.status === "unconfirmed") {
      setMode("code");
      setNotice("Your email isn't verified yet — we sent a new code.");
      return;
    }
    if (res.ok) {
      onAuthed();
      return;
    }
    setError(
      res.error === "invalid_credentials"
        ? "Email or password is incorrect."
        : res.error === "network"
          ? "Network error — please try again."
          : res.error,
    );
  }

  async function onResend() {
    setPending(true);
    reset();
    const res = await resend({ email });
    setPending(false);
    setNotice(res.ok ? "A new code is on its way." : "Couldn't resend just now — try again.");
  }

  return (
    <div className="space-y-3">
      {mode === "signup" && (
        <form onSubmit={onSignupSubmit} className="space-y-3" aria-label="Create your account">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={emailLocked}
              required
              autoComplete="email"
              className={`${INPUT} ${emailLocked ? "bg-paper-2 text-muted" : ""}`}
            />
          </label>
          {emailLocked && <p className="text-[13px] text-muted">We&apos;ll use the email from your application.</p>}
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Create a password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className={INPUT}
            />
          </label>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Create account &amp; continue
          </button>
          <p className="text-center text-[14px] text-muted">
            Already have an account?{" "}
            <button
              type="button"
              className={LINK}
              onClick={() => {
                setMode("signin");
                reset();
              }}
            >
              Sign in
            </button>
          </p>
        </form>
      )}

      {mode === "code" && (
        <form onSubmit={onConfirmSubmit} className="space-y-3" aria-label="Enter your verification code">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Verification code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={INPUT}
            />
          </label>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Verify &amp; continue
          </button>
          <p className="text-center text-[14px] text-muted">
            Didn&apos;t get it?{" "}
            <button type="button" className={LINK} onClick={onResend} disabled={pending}>
              Resend code
            </button>
          </p>
        </form>
      )}

      {mode === "signin" && (
        <form onSubmit={onSigninSubmit} className="space-y-3" aria-label="Sign in">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={INPUT}
            />
          </label>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Sign in &amp; continue
          </button>
          <div className="flex items-center justify-between text-[14px]">
            <button
              type="button"
              className={LINK}
              onClick={() => {
                setMode("signup");
                reset();
              }}
            >
              Create an account
            </button>
            {/* Forgot-password is a v2 fast-follow (ForgotPassword + ConfirmForgotPassword). */}
            <span className="text-muted/70" aria-disabled="true" title="Coming soon">
              Forgot password?
            </span>
          </div>
        </form>
      )}

      {notice && (
        <p className="text-[14px] text-green-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-[14px] text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
