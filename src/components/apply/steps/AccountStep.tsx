"use client";

import { useId } from "react";

/**
 * Final "account" step — a UI MOCK. The flow lands here to push account
 * creation / sign-in. Wire to MSFG's real auth + loan-origination system.
 */
export function AccountStep() {
  const emailId = useId();
  const pwId = useId();

  return (
    <>
      <p className="-mt-0.5 mb-7 text-[16px] text-muted">
        You can log in using your password or a secure access link.
      </p>

      <div className="relative mb-3.5 text-left">
        <label
          htmlFor={emailId}
          className="pointer-events-none absolute left-[18px] top-3 text-[12.5px] font-semibold text-muted"
        >
          Email
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>

      <div className="relative mb-3.5 text-left">
        <label
          htmlFor={pwId}
          className="pointer-events-none absolute left-[18px] top-3 text-[12.5px] font-semibold text-muted"
        >
          Password
        </label>
        <input
          id={pwId}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>

      <a
        href="#"
        className="mb-3.5 mt-1.5 block text-left text-[15px] font-bold text-green-600"
      >
        I forgot my password
      </a>

      <button
        type="button"
        className="mt-2 h-[66px] w-full rounded-lg bg-green-600 text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
      >
        Sign in with my password
      </button>

      <div className="my-[18px] flex items-center gap-3.5 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or
      </div>

      <button
        type="button"
        className="h-16 w-full rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
      >
        Send me a secure log in link
      </button>
    </>
  );
}
