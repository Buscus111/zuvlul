import type { ChoiceMode, ScaleId } from "./scales";
import { countEntries, labelForUnit } from "./scales";

export function agreementPercent(score: number | null, mode: ChoiceMode = "diverse"): string {
  if (score == null) return "нет оценок";
  const word = mode === "close" ? "среднее" : "согласие";
  return `${word} ${Math.round(score * 100)}%`;
}

export function worstLabel(scale: ScaleId, min: number): string {
  return `худшая отметка: ${labelForUnit(scale, min)}`;
}

export function coverageLabel(coverage: number, decisiveVoters: number): string {
  const rated = Math.round(coverage * decisiveVoters);
  return `оценили ${rated} из ${decisiveVoters}`;
}

export { countEntries };
