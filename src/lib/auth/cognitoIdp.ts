import "server-only";
import crypto from "node:crypto";
import { getCognitoConfig } from "@/lib/auth/cognito";

/**
 * Fetch-based Cognito IDP client for the branded apply-finish auth flow.
 *
 * Hits the IDP control-plane JSON API directly
 * (`https://cognito-idp.{region}.amazonaws.com/`, `X-Amz-Target`) — these are
 * UNAUTHENTICATED user-pool ops keyed by ClientId, so there is no SigV4. No AWS
 * SDK dependency. Each op returns a typed { ok } result and NEVER throws on a
 * Cognito error — the caller branches on `code`. Server-only; passwords are
 * forwarded over TLS and never logged.
 */

const IDP_TIMEOUT_MS = 8000;

export type IdpResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export interface IdpTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

/** base64(HMAC-SHA256(clientSecret, username + clientId)) — required when the
 *  app client is confidential. undefined for a public client. */
function secretHash(username: string): string | undefined {
  const { clientId, clientSecret } = getCognitoConfig();
  if (!clientSecret) return undefined;
  return crypto.createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

/** Strip the optional `prefix#` Cognito sometimes prepends to __type. */
function errorCode(type: unknown): string {
  if (typeof type !== "string" || !type) return "UnknownError";
  const hash = type.lastIndexOf("#");
  return hash >= 0 ? type.slice(hash + 1) : type;
}

async function idp<T>(target: string, body: Record<string, unknown>): Promise<IdpResult<T>> {
  const { region } = getCognitoConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, code: errorCode(json.__type), message: String(json.message ?? "") };
    }
    return { ok: true, data: json as unknown as T };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "Timeout", message: `IDP ${target} timed out` };
    }
    return { ok: false, code: "NetworkError", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function signUp(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<IdpResult<void>> {
  const { clientId } = getCognitoConfig();
  const attrs: { Name: string; Value: string }[] = [{ Name: "email", Value: input.email }];
  if (input.firstName) attrs.push({ Name: "given_name", Value: input.firstName });
  if (input.lastName) attrs.push({ Name: "family_name", Value: input.lastName });
  const hash = secretHash(input.email);
  return idp<void>("SignUp", {
    ClientId: clientId,
    Username: input.email,
    Password: input.password,
    UserAttributes: attrs,
    ...(hash ? { SecretHash: hash } : {}),
  });
}

export function confirmSignUp(input: { email: string; code: string }): Promise<IdpResult<void>> {
  const { clientId } = getCognitoConfig();
  const hash = secretHash(input.email);
  return idp<void>("ConfirmSignUp", {
    ClientId: clientId,
    Username: input.email,
    ConfirmationCode: input.code,
    ...(hash ? { SecretHash: hash } : {}),
  });
}

export async function initiateAuth(input: {
  email: string;
  password: string;
}): Promise<IdpResult<IdpTokens>> {
  const { clientId } = getCognitoConfig();
  const hash = secretHash(input.email);
  const res = await idp<{
    AuthenticationResult?: { IdToken?: string; AccessToken?: string; RefreshToken?: string };
    ChallengeName?: string;
  }>("InitiateAuth", {
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: input.email,
      PASSWORD: input.password,
      ...(hash ? { SECRET_HASH: hash } : {}),
    },
  });
  if (!res.ok) return res;
  const r = res.data.AuthenticationResult;
  if (!r?.IdToken || !r.AccessToken) {
    // A challenge (MFA, etc.) or empty result — unsupported in v1.
    return {
      ok: false,
      code: res.data.ChallengeName ? "ChallengeNotSupported" : "NoAuthResult",
      message: "Authentication did not return tokens",
    };
  }
  return { ok: true, data: { idToken: r.IdToken, accessToken: r.AccessToken, refreshToken: r.RefreshToken } };
}

export function resendCode(input: { email: string }): Promise<IdpResult<void>> {
  const { clientId } = getCognitoConfig();
  const hash = secretHash(input.email);
  return idp<void>("ResendConfirmationCode", {
    ClientId: clientId,
    Username: input.email,
    ...(hash ? { SecretHash: hash } : {}),
  });
}
