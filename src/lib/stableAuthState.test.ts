import { describe, expect, it } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import { keepSameProfile, keepSameSession, keepSameUser } from "./stableAuthState";

const user = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra }) as unknown as User;
const session = (token: string, userId: string) => ({ access_token: token, user: user(userId) }) as unknown as Session;
const profile = (id: string, name: string) => ({
  id, email: id + "@example.com", full_name: name, avatar_url: null, phone: null, is_active: true,
});

describe("keepSameUser", () => {
  it("keeps the existing object when the same person is announced again", () => {
    const previous = user("u1");
    expect(keepSameUser(previous, user("u1"), "SIGNED_IN")).toBe(previous);
    expect(keepSameUser(previous, user("u1"), "TOKEN_REFRESHED")).toBe(previous);
  });

  it("takes the new object when the person changed, signed out, or updated their account", () => {
    const previous = user("u1");
    const other = user("u2");
    expect(keepSameUser(previous, other, "SIGNED_IN")).toBe(other);
    expect(keepSameUser(previous, null, "SIGNED_OUT")).toBeNull();
    const updated = user("u1", { email: "new@example.com" });
    expect(keepSameUser(previous, updated, "USER_UPDATED")).toBe(updated);
  });

  it("takes the first user when nobody was signed in", () => {
    const first = user("u1");
    expect(keepSameUser(null, first, "INITIAL_SESSION")).toBe(first);
  });
});

describe("keepSameSession", () => {
  it("keeps the session while the access token and person are unchanged", () => {
    const previous = session("t1", "u1");
    expect(keepSameSession(previous, session("t1", "u1"))).toBe(previous);
  });

  it("takes the new session when the token is refreshed or the person changes", () => {
    const previous = session("t1", "u1");
    const refreshed = session("t2", "u1");
    expect(keepSameSession(previous, refreshed)).toBe(refreshed);
    const other = session("t1", "u2");
    expect(keepSameSession(previous, other)).toBe(other);
    expect(keepSameSession(previous, null)).toBeNull();
  });
});

describe("keepSameProfile", () => {
  it("keeps the existing profile when nothing changed", () => {
    const previous = profile("u1", "Asha");
    expect(keepSameProfile(previous, { ...previous })).toBe(previous);
  });

  it("takes the new profile when a field changed", () => {
    const previous = profile("u1", "Asha");
    const renamed = profile("u1", "Asha Rao");
    expect(keepSameProfile(previous, renamed)).toBe(renamed);
    expect(keepSameProfile(null, renamed)).toBe(renamed);
  });
});
