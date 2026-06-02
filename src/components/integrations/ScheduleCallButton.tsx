"use client";

/**
 * ScheduleCallButton — opens a GHL booking calendar in an accessible modal
 * dialog. Degrades gracefully: when no calendar is configured (no
 * `NEXT_PUBLIC_GHL_CALENDAR_ID` and no per-officer override) it renders a plain
 * link to `fallbackHref` (the existing apply-wizard `scheduleHref`, a `tel:`,
 * etc.), so nothing breaks with zero GHL credentials.
 *
 * Dialog a11y: role="dialog" + aria-modal, a labelled heading, opens with focus
 * moved inside, Esc closes, backdrop click closes, Tab is kept within the
 * dialog (lightweight focus containment), and body scroll is locked while open.
 * Reuses the shared <Button> for visual consistency.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  GhlCalendar,
  calendarConfigured,
} from "@/components/integrations/GhlCalendar";

type Variant = "green" | "ghostDark" | "white" | "dark" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ScheduleCallButtonProps {
  /** Per-officer calendar id override; falls back to the env default. */
  calendarId?: string;
  /** Where to send the user when no calendar is configured (required fallback). */
  fallbackHref: string;
  /** Button label. */
  children?: ReactNode;
  /** Accessible name for the dialog + iframe, e.g. "Schedule a call with …". */
  dialogLabel?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Forwarded to the trigger for screen-reader context. */
  "aria-label"?: string;
}

export function ScheduleCallButton({
  calendarId,
  fallbackHref,
  children = "Schedule",
  dialogLabel = "Schedule a call",
  variant = "green",
  size = "md",
  className,
  "aria-label": ariaLabel,
}: ScheduleCallButtonProps) {
  const [open, setOpen] = useState(false);
  const hasCalendar = calendarConfigured(calendarId);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Element focused before the dialog opened (the trigger), to restore on close.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const openDialog = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    restoreFocusRef.current = e.currentTarget;
    setOpen(true);
  }, []);

  // Lock body scroll, wire Esc + focus trap, and restore focus on close.
  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog (the close button is first focusable).
    const focusFirst = () => {
      const node = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], iframe, input, [tabindex]:not([tabindex="-1"])',
      );
      (node ?? dialogRef.current)?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab within the dialog.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], iframe, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      // Restore focus to the trigger that opened the dialog.
      restoreFocusRef.current?.focus();
    };
  }, [open, close]);

  // No calendar configured → plain link fallback; the dialog never mounts.
  if (!hasCalendar) {
    return (
      <Button
        href={fallbackHref}
        variant={variant}
        size={size}
        className={className}
        aria-label={ariaLabel}
      >
        {children}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={openDialog}
      >
        {children}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          // Backdrop click closes (only when the click lands on the backdrop).
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          {/* Backdrop */}
          <div
            aria-hidden
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          />

          {/* Dialog */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative z-[1] flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-pop outline-none"
          >
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
              <h2
                id={titleId}
                className="text-[16px] font-extrabold tracking-[-0.01em] text-ink"
              >
                {dialogLabel}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close scheduling dialog"
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <GhlCalendar
                calendarId={calendarId}
                title={dialogLabel}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
