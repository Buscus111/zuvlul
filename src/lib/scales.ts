// Two room modes pick both the scale and the formula.
// "diverse" keeps a coarse verbal scale and weighs the worst mark.
// "close" uses 0–10 and ranks by the plain mean. "skip" stays outside either average.

export const SCALE_IDS = ["text", "yesno", "score10"] as const;

export type ScaleId = (typeof SCALE_IDS)[number];

export const CHOICE_MODES = [
  {
    id: "diverse",
    title: "Варианты разные",
    text: "Кто-то может не знать вариант, отказ одного важен. Шкала от «точно нет» до «точно да», плюс «не знаю».",
  },
  {
    id: "close",
    title: "Варианты близкие",
    text: "Варианты знакомые и похожие. Шкала от 0 до 10, плюс «не знаю». Побеждает среднее.",
  },
] as const;

export type ChoiceMode = (typeof CHOICE_MODES)[number]["id"];

export const TEXT_VALUES = {
  no: 0,
  unsure: 0.25,
  ok: 0.5,
  good: 0.75,
  yes: 1,
} as const;

export type TextMark = keyof typeof TEXT_VALUES;

export const TEXT_MARKS: { value: TextMark | "skip"; label: string }[] = [
  { value: "no", label: "Точно нет" },
  { value: "unsure", label: "Не уверен" },
  { value: "ok", label: "Норм" },
  { value: "good", label: "Хорошо" },
  { value: "yes", label: "Точно да" },
  { value: "skip", label: "Не знаю" },
];

export const YESNO_MARKS: { value: "no" | "yes" | "skip"; label: string }[] = [
  { value: "no", label: "Нет" },
  { value: "yes", label: "Да" },
  { value: "skip", label: "Не знаю" },
];

const TEXT_LABELS: Record<TextMark | "skip", string> = {
  no: "точно нет",
  unsure: "не уверен",
  ok: "норм",
  good: "хорошо",
  yes: "точно да",
  skip: "не знаю",
};

export function isChoiceMode(value: string): value is ChoiceMode {
  return CHOICE_MODES.some((mode) => mode.id === value);
}

export function scaleForMode(mode: ChoiceMode): ScaleId {
  return mode === "close" ? "score10" : "text";
}

export function modeLabel(mode: ChoiceMode): string {
  return mode === "close" ? "Варианты близкие" : "Варианты разные";
}

export function isScaleId(value: string): value is ScaleId {
  return (SCALE_IDS as readonly string[]).includes(value);
}

export function scaleLabel(scale: ScaleId): string {
  if (scale === "text") return "От «точно нет» до «точно да»";
  if (scale === "yesno") return "Да или нет";
  return "От 0 до 10";
}

export function isValidMark(scale: ScaleId, raw: string): boolean {
  if (raw === "skip") return true;
  if (scale === "text") return raw in TEXT_VALUES;
  if (scale === "yesno") return raw === "yes" || raw === "no";
  return /^(10|[0-9])$/.test(raw);
}

/** null means the person does not know the option and must not pull the average down. */
export function toUnit(scale: ScaleId, raw: string): number | null {
  if (raw === "skip" || !isValidMark(scale, raw)) return null;
  if (scale === "text") return TEXT_VALUES[raw as TextMark];
  if (scale === "yesno") return raw === "yes" ? 1 : 0;
  return Number(raw) / 10;
}

export function isTopMark(scale: ScaleId, raw: string): boolean {
  if (scale === "score10") return raw === "10";
  return raw === "yes";
}

export function labelForUnit(scale: ScaleId, unit: number): string {
  if (scale === "score10") return `${Math.round(unit * 10)} из 10`;
  if (scale === "yesno") return unit >= 0.5 ? "да" : "нет";
  let best: TextMark = "no";
  let bestDistance = Infinity;
  for (const [mark, value] of Object.entries(TEXT_VALUES) as [TextMark, number][]) {
    const distance = Math.abs(value - unit);
    if (distance < bestDistance) {
      best = mark;
      bestDistance = distance;
    }
  }
  return TEXT_LABELS[best];
}

export function markLabel(scale: ScaleId, raw: string): string {
  if (raw === "skip") return "не знаю";
  if (scale === "text" && raw in TEXT_LABELS) return TEXT_LABELS[raw as TextMark];
  if (scale === "yesno") return raw === "yes" ? "да" : "нет";
  if (scale === "score10") return raw;
  return raw;
}

export function countEntries(
  scale: ScaleId,
  counts: Record<string, number>,
): { label: string; count: number }[] {
  const order =
    scale === "score10"
      ? ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0", "skip"]
      : scale === "yesno"
        ? ["yes", "no", "skip"]
        : ["yes", "good", "ok", "unsure", "no", "skip"];
  return order
    .filter((key) => (counts[key] ?? 0) > 0)
    .map((key) => ({ label: markLabel(scale, key), count: counts[key] ?? 0 }));
}

export function isDirectImage(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === "https:" && /\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
