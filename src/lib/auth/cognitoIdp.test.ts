import { describe, it, expect, vi, afterEach } from "vitest";

// Mutable config so one test can flip the client to "confidential".
const h = vi.hoisted(() => ({
  cfg: { region: "us-west-1", clientId: "client-1", clientSecret: undefined as string | undefined },
}));
vi.mock("@/lib/auth/cognito", () => ({ getCognitoConfig: () => h.cfg }));

import { signUp, confirmSignUp, initiateAuth, resendCode } from "./cognitoIdp";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  h.cfg = { region: "us-west-1", clientId: "client-1", clientSecret: undefined };
});

describe("cognitoIdp", () => {
  it("signUp POSTs SignUp with email attributes and no SecretHash for a public client", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { UserSub: "u1" }));
    const res = await signUp({ email: "a@b.com", password: "Passw0rd!", firstName: "Ann", lastName: "Bee" });
    expect(res.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://cognito-idp.us-west-1.amazonaws.com/");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Amz-Target"]).toBe("AWSCognitoIdentityProviderService.SignUp");
    expect(headers["Content-Type"]).toBe("application/x-amz-json-1.1");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.ClientId).toBe("client-1");
    expect(body.Username).toBe("a@b.com");
    expect(body.UserAttributes).toEqual([
      { Name: "email", Value: "a@b.com" },
      { Name: "given_name", Value: "Ann" },
      { Name: "family_name", Value: "Bee" },
    ]);
    expect(body.SecretHash).toBeUndefined();
  });

  it("maps a Cognito __type to a typed error code + message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { __type: "UsernameExistsException", message: "User already exists" }),
    );
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res).toEqual({ ok: false, code: "UsernameExistsException", message: "User already exists" });
  });

  it("strips the coral prefix from __type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { __type: "com.amazonaws#InvalidPasswordException", message: "bad" }),
    );
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("InvalidPasswordException");
  });

  it("initiateAuth returns tokens from AuthenticationResult", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { AuthenticationResult: { IdToken: "id", AccessToken: "ac", RefreshToken: "rf" } }),
    );
    const res = await initiateAuth({ email: "a@b.com", password: "x" });
    expect(res).toEqual({ ok: true, data: { idToken: "id", accessToken: "ac", refreshToken: "rf" } });
  });

  it("initiateAuth maps NotAuthorizedException", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { __type: "NotAuthorizedException", message: "Incorrect username or password." }),
    );
    const res = await initiateAuth({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NotAuthorizedException");
  });

  it("confirmSignUp and resendCode hit the right targets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));
    await confirmSignUp({ email: "a@b.com", code: "123456" });
    await resendCode({ email: "a@b.com" });
    const targets = fetchSpy.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["X-Amz-Target"]);
    expect(targets).toEqual([
      "AWSCognitoIdentityProviderService.ConfirmSignUp",
      "AWSCognitoIdentityProviderService.ResendConfirmationCode",
    ]);
  });

  it("includes a base64 SecretHash when the client is confidential", async () => {
    h.cfg = { region: "us-west-1", clientId: "client-1", clientSecret: "shhh" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));
    await signUp({ email: "a@b.com", password: "Passw0rd!" });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.SecretHash).toBe("string");
    expect(body.SecretHash.length).toBeGreaterThan(0);
  });

  it("returns a NetworkError result instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NetworkError");
  });

  it("returns a Timeout result when the request aborts", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("aborted", "AbortError"));
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("Timeout");
  });
});
