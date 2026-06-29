// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./accountPanelClient", () => ({
  signup: vi.fn(),
  confirm: vi.fn(),
  signin: vi.fn(),
  resend: vi.fn(),
}));

import { AccountPanel } from "./AccountPanel";
import * as client from "./accountPanelClient";

const signup = vi.mocked(client.signup);
const confirm = vi.mocked(client.confirm);
const signin = vi.mocked(client.signin);

afterEach(cleanup);
beforeEach(() => {
  signup.mockReset();
  confirm.mockReset();
  signin.mockReset();
});

describe("AccountPanel", () => {
  it("walks signup → code → authed", async () => {
    const user = userEvent.setup();
    signup.mockResolvedValue({ ok: true, status: "code_sent" });
    confirm.mockResolvedValue({ ok: true });
    const onAuthed = vi.fn();
    render(<AccountPanel initialEmail="a@b.com" onAuthed={onAuthed} />);

    await user.type(screen.getByLabelText("Create a password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    const codeInput = await screen.findByLabelText("Verification code");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    expect(confirm).toHaveBeenCalledWith({ email: "a@b.com", password: "Passw0rd!", code: "123456" });
    expect(onAuthed).toHaveBeenCalledTimes(1);
  });

  it("locks the email field in signup mode", () => {
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  });

  it("switches to sign in when the account already exists", async () => {
    const user = userEvent.setup();
    signup.mockResolvedValue({ ok: true, status: "exists" });
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);

    await user.type(screen.getByLabelText("Create a password"), "whatever1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("button", { name: /sign in & continue/i })).toBeInTheDocument();
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
  });

  it("routes an unconfirmed sign-in to code entry", async () => {
    const user = userEvent.setup();
    signin.mockResolvedValue({ ok: true, status: "unconfirmed" });
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await user.type(screen.getByLabelText("Password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: /sign in & continue/i }));

    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
  });

  it("shows the invalid-credentials message on a failed sign-in", async () => {
    const user = userEvent.setup();
    signin.mockResolvedValue({ ok: false, error: "invalid_credentials" });
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: /sign in & continue/i }));

    expect(await screen.findByText(/email or password is incorrect/i)).toBeInTheDocument();
  });
});
