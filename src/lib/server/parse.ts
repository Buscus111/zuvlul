import { isScaleId, type ScaleId } from "#lib/scales";
import { RoomError } from "./errors";

export const MAX_PARTICIPANTS = 6;
const MIN_MS = 60_000;
const MAX_MS = 180 * 60_000;

export type CreateInput = {
  title: string;
  hostName: string;
  scale: ScaleId;
  collectMs: number;
  voteMs: number;
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
    throw new RoomError(`${label}: укажи целое число минут, от 1 до 180`);
  }
  const minutes = Number(value);
  const ms = minutes * 60_000;
  if (ms < MIN_MS || ms > MAX_MS) {
    throw new RoomError(`${label}: укажи целое число минут, от 1 до 180`);
  }
  return ms;
}

export function parseCreateForm(form: FormData): CreateInput {
  const setup = String(form.get("setup") ?? "standard");
  if (setup !== "standard" && setup !== "custom") {
    throw new RoomError("Выбери стандарт или свою шкалу");
  }
  const scaleRaw = setup === "custom" ? String(form.get("scale") ?? "") : "text";
  if (!isScaleId(scaleRaw)) throw new RoomError("Выбери шкалу");

  const title = cleanLine(String(form.get("title") ?? ""));
  const hostName = cleanLine(String(form.get("name") ?? ""));
  requireLength(title, 1, 80, "Впиши, что выбираете", "Название длиннее 80 символов");
  requireLength(hostName, 1, 40, "Впиши своё имя", "Имя длиннее 40 символов");

  return {
    title,
    hostName,
    scale: scaleRaw,
    collectMs: minutesToMs(form.get("collectMinutes"), "Сбор"),
    voteMs: minutesToMs(form.get("voteMinutes"), "Голосование"),
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
