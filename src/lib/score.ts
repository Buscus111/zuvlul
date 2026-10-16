import {
  isTopMark,
  isValidMark,
  labelForUnit,
  toUnit,
  type ScaleId,
} from "./scales";

export const MEAN_WEIGHT = 0.65;
export const MIN_WEIGHT = 0.35;

export type Ballot = {
  participantId: string;
  followsMajority: boolean;
  ratings: Record<string, string>;
};

export type ScoreOption = {
  id: string;
  title: string;
  note: string;
  link: string;
  createdAt: number;
};

export type RankedOption = {
  id: string;
  title: string;
  note: string;
  link: string;
  score: number | null;
  mean: number | null;
  min: number | null;
  coverage: number;
  topMarks: number;
  counts: Record<string, number>;
};

export type Outcome = {
  ranking: RankedOption[];
  winnerId: string | null;
  reason: string;
  majorityFollowers: number;
  decisiveVoters: number;
};

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function peopleReady(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} человек готов идти за большинством`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} человека готовы идти за большинством`;
  }
  return `${count} человек готовы идти за большинством`;
}

function reasonFor(outcome: {
  winner: RankedOption | null;
  majorityFollowers: number;
  decisiveVoters: number;
  scale: ScaleId;
}): string {
  if (!outcome.winner) {
    if (outcome.decisiveVoters === 0) {
      return "Все готовы подстроиться под большинство, но своей оценки не оставил никто.";
    }
    return "Явного согласия нет: варианты либо никто не оценил, либо их отвергли.";
  }

  const winner = outcome.winner;
  let text: string;
  if (winner.min != null && winner.min >= 0.5 && winner.coverage === 1) {
    text = `Победил «${winner.title}»: баланс лучше остальных, и худшая отметка не ниже середины шкалы (${labelForUnit(outcome.scale, winner.min)}).`;
  } else if (winner.min === 0) {
    text = `Победил «${winner.title}»: даже с жёстким отказом его баланс выше, чем у остальных.`;
  } else if (winner.coverage < 1) {
    text = `Победил «${winner.title}». Кто вариант не знает, тот его пропускает: это не отказ, но и не голос за.`;
  } else {
    text = `Победил «${winner.title}»: среднее мнение и худшая отметка вместе выше, чем у остальных.`;
  }

  if (outcome.majorityFollowers > 0) {
    text += ` ${peopleReady(outcome.majorityFollowers)}.`;
  }
  return text;
}

export function scoreOptions(scale: ScaleId, options: ScoreOption[], ballots: Ballot[]): Outcome {
  const decisive = ballots.filter((ballot) => !ballot.followsMajority);
  const majorityFollowers = ballots.length - decisive.length;
  const ranked: (RankedOption & { createdAt: number })[] = options.map((option) => {
    const counts: Record<string, number> = {};
    const units: number[] = [];
    let topMarks = 0;

    for (const ballot of decisive) {
      const raw = isValidMark(scale, ballot.ratings[option.id] ?? "")
        ? ballot.ratings[option.id]
        : "skip";
      counts[raw] = (counts[raw] ?? 0) + 1;
      const unit = toUnit(scale, raw);
      if (unit == null) continue;
      units.push(unit);
      if (isTopMark(scale, raw)) topMarks += 1;
    }

    if (units.length === 0 || decisive.length === 0) {
      return {
        id: option.id,
        title: option.title,
        note: option.note,
        link: option.link,
        score: null,
        mean: null,
        min: null,
        coverage: 0,
        topMarks,
        counts,
        createdAt: option.createdAt,
      };
    }

    const mean = average(units);
    const min = Math.min(...units);
    const agreement = MEAN_WEIGHT * mean + MIN_WEIGHT * min;
    const coverage = units.length / decisive.length;
    return {
      id: option.id,
      title: option.title,
      note: option.note,
      link: option.link,
      score: agreement * coverage,
      mean,
      min,
      coverage,
      topMarks,
      counts,
      createdAt: option.createdAt,
    };
  });

  ranked.sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (b.topMarks !== a.topMarks) return b.topMarks - a.topMarks;
    const minA = a.min ?? -1;
    const minB = b.min ?? -1;
    if (minB !== minA) return minB - minA;
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return a.createdAt - b.createdAt;
  });

  const ranking: RankedOption[] = ranked.map(({ createdAt: _createdAt, ...option }) => option);
  const winner = ranking.find((option) => option.score != null && option.score > 0) ?? null;
  return {
    ranking,
    winnerId: winner?.id ?? null,
    majorityFollowers,
    decisiveVoters: decisive.length,
    reason: reasonFor({
      winner,
      majorityFollowers,
      decisiveVoters: decisive.length,
      scale,
    }),
  };
}
