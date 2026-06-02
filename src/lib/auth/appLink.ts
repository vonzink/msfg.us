/**
 * Client-safe link to the MSFG app (app.msfgco.com).
 *
 * `NEXT_PUBLIC_APP_URL` is a PUBLIC, client-exposed var (read at build time and
 * inlined into the bundle), so it is intentionally NOT in the server env module
 * (which forbids NEXT_PUBLIC_*). Used for the wizard's "Continue in the MSFG
 * app" deep link after a signed-in completion. The shared Cognito session means
 * the app silently SSO's the user in.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.msfgco.com";
