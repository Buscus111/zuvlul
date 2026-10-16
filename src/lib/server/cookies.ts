import type { Cookies } from "@sveltejs/kit";

export function participantCookieName(code: string): string {
  return `nandch_p_${code}`;
}

export function hostCookieName(code: string): string {
  return `nandch_h_${code}`;
}

const base = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 14,
  secure: process.env.NODE_ENV === "production",
};

export function setParticipantCookie(cookies: Cookies, code: string, token: string) {
  cookies.set(participantCookieName(code), token, base);
}

export function setHostCookie(cookies: Cookies, code: string, token: string) {
  cookies.set(hostCookieName(code), token, base);
}

export function readAuth(cookies: Cookies, code: string): {
  participantToken: string | null;
  hostToken: string | null;
} {
  return {
    participantToken: cookies.get(participantCookieName(code)) ?? null,
    hostToken: cookies.get(hostCookieName(code)) ?? null,
  };
}
