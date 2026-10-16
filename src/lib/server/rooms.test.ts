import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { parseCreateForm } from "./parse";
import { applyAction, createRoom, getPublicState, joinRoom } from "./rooms";

function room() {
  return openDatabase(":memory:");
}

describe("room flow", () => {
  it("keeps other people's options hidden and shares one deadline", () => {
    const db = room();
    const now = 1_000_000;
    const created = createRoom(
      db,
      { title: "Фильм", hostName: "Арман", scale: "text", collectMs: 60_000, voteMs: 60_000 },
      now,
    );
    const host = { participantToken: created.participantToken, hostToken: created.hostToken };
    applyAction(db, created.code, host, { action: "start" }, now);
    applyAction(db, created.code, host, { action: "add", title: "Секрет Ани" }, now);

    const boris = joinRoom(db, created.code, "Боря", now);
    const guest = { participantToken: boris.participantToken, hostToken: null };
    applyAction(db, created.code, guest, { action: "add", title: "Секрет Бори", note: "про море" }, now);

    const anya = getPublicState(db, created.code, host, now + 1_000);
    expect(anya?.phase).toBe("collecting");
    expect(anya?.optionCount).toBe(2);
    expect(anya?.myOptions.map((option) => option.title)).toEqual(["Секрет Ани"]);
    expect(JSON.stringify(anya)).not.toContain("Секрет Бори");
    expect(anya?.phaseEndsAt).toBe(now + 60_000);

    const voting = getPublicState(db, created.code, host, now + 60_000);
    expect(voting?.phase).toBe("voting");
    expect(voting?.ballot.map((option) => option.title).sort()).toEqual(["Секрет Ани", "Секрет Бори"]);
    expect(JSON.stringify(voting?.ballot)).not.toContain("author");
  });

  it("moves to voting when everyone is ready, then scores anonymous marks", () => {
    const db = room();
    const now = 5_000;
    const created = createRoom(
      db,
      { title: "Ужин", hostName: "Арман", scale: "text", collectMs: 60_000, voteMs: 60_000 },
      now,
    );
    const host = { participantToken: created.participantToken, hostToken: created.hostToken };
    applyAction(db, created.code, host, { action: "start" }, now);
    applyAction(db, created.code, host, { action: "add", title: "Суши" }, now);
    applyAction(db, created.code, host, { action: "add", title: "Суп" }, now);
    const boris = joinRoom(db, created.code, "Боря", now);
    const vasya = joinRoom(db, created.code, "Вася", now);
    const guest = { participantToken: boris.participantToken, hostToken: null };
    const flexible = { participantToken: vasya.participantToken, hostToken: null };

    expect(applyAction(db, created.code, host, { action: "ready" }, now).phase).toBe("collecting");
    expect(applyAction(db, created.code, guest, { action: "ready" }, now).phase).toBe("collecting");
    const voting = applyAction(db, created.code, flexible, { action: "ready" }, now);
    expect(voting.phase).toBe("voting");

    const sushi = voting.ballot.find((option) => option.title === "Суши")!;
    const soup = voting.ballot.find((option) => option.title === "Суп")!;
    const followed = applyAction(db, created.code, flexible, { action: "majority", on: true }, now);
    expect(followed.me?.followsMajority).toBe(true);
    expect(followed.phase).toBe("voting");

    applyAction(db, created.code, host, { action: "rate", optionId: sushi.id, value: "no" }, now);
    applyAction(db, created.code, host, { action: "rate", optionId: soup.id, value: "ok" }, now);
    applyAction(db, created.code, guest, { action: "rate", optionId: sushi.id, value: "no" }, now);
    const results = applyAction(
      db,
      created.code,
      guest,
      { action: "rate", optionId: soup.id, value: "good" },
      now,
    );
    expect(results.phase).toBe("results");
    expect(results.results?.winnerId).toBe(soup.id);
    expect(results.results?.majorityFollowers).toBe(1);
    expect(JSON.stringify(results.results)).not.toContain("Вася");
  });

  it("stops at six people", () => {
    const db = room();
    const created = createRoom(db, {
      title: "Игра",
      hostName: "Арман",
      scale: "yesno",
      collectMs: 60_000,
      voteMs: 60_000,
    });
    for (let index = 0; index < 5; index += 1) joinRoom(db, created.code, `Игрок ${index}`);
    expect(() => joinRoom(db, created.code, "Лишний")).toThrow(/6/);
  });

  it("uses the text scale for the standard setup and keeps a custom scale", () => {
    const standard = new FormData();
    standard.set("setup", "standard");
    standard.set("scale", "yesno");
    standard.set("title", "Кино");
    standard.set("name", "Арман");
    standard.set("collectMinutes", "5");
    standard.set("voteMinutes", "3");
    expect(parseCreateForm(standard).scale).toBe("text");

    const custom = new FormData();
    custom.set("setup", "custom");
    custom.set("scale", "score10");
    custom.set("title", "Ресторан");
    custom.set("name", "Боря");
    custom.set("collectMinutes", "10");
    custom.set("voteMinutes", "5");
    const input = parseCreateForm(custom);
    expect(input.scale).toBe("score10");

    const db = room();
    const created = createRoom(db, input);
    const state = getPublicState(db, created.code, {
      participantToken: created.participantToken,
      hostToken: created.hostToken,
    });
    expect(state?.scale).toBe("score10");
  });
});
