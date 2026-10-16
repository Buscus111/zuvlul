import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isRoomCode(code: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code);
}

export function newRoomCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[bytes[index]! % ALPHABET.length];
  }
  return code;
}

export function newSecret(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashSecret(raw) };
}

export function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newId(): string {
  return randomBytes(12).toString("hex");
}
