import { describe, expect, it } from "vitest";
import { scoreOptions, type Ballot, type ScoreOption } from "./score";

function option(id: string, createdAt = 1): ScoreOption {
  return { id, title: id, note: "", link: "", createdAt };
}

function ballot(
  participantId: string,
  ratings: Record<string, string>,
  followsMajority = false,
): Ballot {
  return { participantId, ratings, followsMajority };
}

describe("balance of agreement", () => {
  it("lets a compromise beat a favorite that someone rejects", () => {
    const outcome = scoreOptions(
      "text",
      [option("loved"), option("calm")],
      [
        ballot("a", { loved: "yes", calm: "ok" }),
        ballot("b", { loved: "yes", calm: "ok" }),
        ballot("c", { loved: "yes", calm: "good" }),
        ballot("d", { loved: "no", calm: "ok" }),
      ],
    );
    expect(outcome.winnerId).toBe("calm");
    const loved = outcome.ranking.find((row) => row.id === "loved");
    const calm = outcome.ranking.find((row) => row.id === "calm");
    expect(calm!.score).toBeGreaterThan(loved!.score!);
    expect(loved!.min).toBe(0);
  });

  it("does not treat skip as a rejection, but lowers coverage", () => {
    const outcome = scoreOptions(
      "text",
      [option("known"), option("obscure")],
      [
        ballot("a", { known: "ok", obscure: "yes" }),
        ballot("b", { known: "ok", obscure: "skip" }),
        ballot("c", { known: "ok", obscure: "skip" }),
        ballot("d", { known: "ok", obscure: "skip" }),
      ],
    );
    expect(outcome.winnerId).toBe("known");
    const obscure = outcome.ranking.find((row) => row.id === "obscure")!;
    expect(obscure.mean).toBe(1);
    expect(obscure.coverage).toBe(0.25);
  });

  it("ignores ratings from people who follow the majority", () => {
    const without = scoreOptions(
      "text",
      [option("a"), option("b")],
      [
        ballot("1", { a: "yes", b: "ok" }),
        ballot("2", { a: "no", b: "ok" }),
        ballot("3", { a: "no", b: "ok" }),
      ],
    );
    const withFollower = scoreOptions(
      "text",
      [option("a"), option("b")],
      [
        ballot("1", { a: "yes", b: "ok" }),
        ballot("2", { a: "no", b: "ok" }),
        ballot("3", { a: "no", b: "ok" }),
        ballot("4", { a: "yes", b: "no" }, true),
      ],
    );
    expect(withFollower.winnerId).toBe(without.winnerId);
    expect(withFollower.winnerId).toBe("b");
    expect(withFollower.majorityFollowers).toBe(1);
    expect(withFollower.reason).toContain("большинств");
  });

  it("has no winner when nobody states a preference", () => {
    const skipped = scoreOptions("yesno", [option("a")], [ballot("1", { a: "skip" })]);
    expect(skipped.winnerId).toBeNull();
    const followers = scoreOptions(
      "yesno",
      [option("a")],
      [ballot("1", { a: "yes" }, true), ballot("2", {}, true)],
    );
    expect(followers.winnerId).toBeNull();
    expect(followers.decisiveVoters).toBe(0);
  });

  it("maps yes/no and 0-10 onto the same balance", () => {
    const yesno = scoreOptions(
      "yesno",
      [option("film")],
      [ballot("1", { film: "yes" }), ballot("2", { film: "no" })],
    );
    expect(yesno.ranking[0]!.min).toBe(0);
    expect(yesno.ranking[0]!.score).toBeCloseTo(0.65 * 0.5);

    const numbers = scoreOptions(
      "score10",
      [option("low"), option("high")],
      [ballot("1", { low: "2", high: "10" }), ballot("2", { low: "2", high: "8" })],
    );
    expect(numbers.winnerId).toBe("high");
    expect(numbers.ranking[0]!.topMarks).toBe(1);
  });

  it("lets a high average beat a safer option when the choices are close", () => {
    const ratings = [
      ballot("a", { loved: "10", calm: "6" }),
      ballot("b", { loved: "10", calm: "6" }),
      ballot("c", { loved: "0", calm: "6" }),
    ];
    const diverse = scoreOptions("score10", [option("loved"), option("calm")], ratings, "diverse");
    const close = scoreOptions("score10", [option("loved"), option("calm")], ratings, "close");
    expect(diverse.winnerId).toBe("calm");
    expect(close.winnerId).toBe("loved");
    expect(close.ranking[0]!.score).toBeCloseTo(20 / 30);
    expect(close.reason).toContain("средн");
  });

  it("keeps an unknown mark out of the close-option average", () => {
    const outcome = scoreOptions(
      "score10",
      [option("film")],
      [ballot("1", { film: "8" }), ballot("2", { film: "skip" })],
      "close",
    );
    expect(outcome.ranking[0]!.mean).toBeCloseTo(0.8);
    expect(outcome.ranking[0]!.score).toBeCloseTo(0.8);
    expect(outcome.ranking[0]!.coverage).toBe(0.5);
  });
});
