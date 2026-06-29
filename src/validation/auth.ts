import { z } from "zod";

/** Shared field rules. Email is normalized exactly like the lead schema
 *  (`@/validation/lead`) so the hand-off ownership match stays case-stable.
 *
 *  NOTE: Zod v4 applies checks left-to-right as a pipeline, so `.trim()` and
 *  `.toLowerCase()` must precede `.email()` — otherwise the email validator
 *  runs before whitespace is stripped and rejects inputs like "  A@B.COM ".
 *  The plan listed `z.email(...).trim().toLowerCase()` (which mirrors lead.ts)
 *  but that order fails in v4 on untrimmed input; the order below is correct. */
const email = z.string().trim().toLowerCase().email("A valid email is required");
const password = z.string().min(8, "Password must be at least 8 characters").max(256);
const code = z.string().trim().regex(/^\d{4,8}$/, "Enter the code from your email");

export const signupSchema = z.object({
  email,
  password,
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

/** Confirm carries the password so the route can confirm + sign in in one call. */
export const confirmSchema = z.object({ email, password, code });
export type ConfirmInput = z.infer<typeof confirmSchema>;

export const signinSchema = z.object({ email, password });
export type SigninInput = z.infer<typeof signinSchema>;

export const resendSchema = z.object({ email });
export type ResendInput = z.infer<typeof resendSchema>;
