import { isChoiceMode, scaleForMode, type ChoiceMode, type ScaleId } from "#lib/scales";
import { RoomError } from "./errors";

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 10;
export const DEFAULT_PARTICIPANTS = 4;
const MIN_MS = 60_000;
const MAX_MS = 30 * 60_000;

export type CreateInput = {
  title: string;
  hostName: string;
  scale: ScaleId;
  mode?: ChoiceMode;
  collectMs: number;
  voteMs: number;
  maxParticipants?: number;
  showAuthors?: boolean;
};

function cleanLine(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function requireLength(value: string, min: number, max: number, empty: string, tooLong: string) {
  if (value.length < min) throw new RoomError(empty);
  if (value.length > max) throw new RoomError(tooLong);
}

function minutesToMs(raw: unknown, label: string): number {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d+$/.test(value)) {
    throw new RoomError(`${label}: укажи целое число минут, от 1 до 30`);
  }
  const minutes = Number(value);
  const ms = minutes * 60_000;
  if (ms < MIN_MS || ms > MAX_MS) {
    throw new RoomError(`${label}: укажи целое число минут, от 1 до 30`);
  }
  return ms;
}

function participantCap(raw: unknown): number {
  if (raw == null) return DEFAULT_PARTICIPANTS;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d+$/.test(value)) {
    throw new RoomError("Участники: укажи целое число от 2 до 10");
  }
  const count = Number(value);
  if (count < MIN_PARTICIPANTS || count > MAX_PARTICIPANTS) {
    throw new RoomError("Участники: укажи целое число от 2 до 10");
  }
  return count;
}

export function parseCreateForm(form: FormData): CreateInput {
  const modeRaw = String(form.get("mode") ?? "diverse");
  if (!isChoiceMode(modeRaw)) {
    throw new RoomError("Выбери, какие варианты будете сравнивать");
  }

  const title = cleanLine(String(form.get("title") ?? ""));
  const hostName = cleanLine(String(form.get("name") ?? ""));
  requireLength(title, 1, 80, "Впиши, что выбираете", "Название длиннее 80 символов");
  requireLength(hostName, 1, 40, "Впиши своё имя", "Имя длиннее 40 символов");

  return {
    title,
    hostName,
    mode: modeRaw,
    scale: scaleForMode(modeRaw),
    collectMs: minutesToMs(form.get("collectMinutes"), "Варианты"),
    voteMs: minutesToMs(form.get("voteMinutes"), "Голосование"),
    maxParticipants: participantCap(form.get("seats")),
    showAuthors: form.get("showAuthors") != null,
  };
}

export function cleanLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length > 500) throw new RoomError("Ссылка длиннее 500 символов");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RoomError("Ссылка должна начинаться с http:// или https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RoomError("Ссылка должна начинаться с http:// или https://");
  }
  return url.toString();
}

export function cleanOptionFields(input: { title: string; note: string; link: string }) {
  const title = cleanLine(input.title);
  const note = input.note.trim().replace(/\s+/g, " ");
  requireLength(title, 1, 80, "Впиши название варианта", "Название варианта длиннее 80 символов");
  if (note.length > 280) throw new RoomError("Текст варианта длиннее 280 символов");
  return { title, note, link: cleanLink(input.link) };
}

export function cleanPersonName(raw: string): string {
  const name = cleanLine(raw);
  requireLength(name, 1, 40, "Впиши своё имя", "Имя длиннее 40 символов");
  return name;
}
