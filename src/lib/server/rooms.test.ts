import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
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

  it("stops when the chosen number of people is already in the room", () => {
    const db = room();
    const created = createRoom(db, {
      title: "Игра",
      hostName: "Арман",
      scale: "yesno",
      collectMs: 60_000,
      voteMs: 60_000,
      maxParticipants: 4,
    });
    for (let index = 0; index < 3; index += 1) joinRoom(db, created.code, `Игрок ${index}`);
    expect(() => joinRoom(db, created.code, "Лишний")).toThrow(/4 человека/);
    const state = getPublicState(db, created.code, {
      participantToken: created.participantToken,
      hostToken: created.hostToken,
    });
    expect(state?.participantCount).toBe(4);
    expect(state?.maxParticipants).toBe(4);
  });

  it("picks the text scale for different options and 0-10 for close ones", () => {
    const diverse = new FormData();
    diverse.set("mode", "diverse");
    diverse.set("title", "Кино");
    diverse.set("name", "Арман");
    diverse.set("collectMinutes", "5");
    diverse.set("voteMinutes", "3");
    expect(parseCreateForm(diverse).scale).toBe("text");
    expect(parseCreateForm(diverse).mode).toBe("diverse");
    expect(parseCreateForm(diverse).maxParticipants).toBe(4);
    diverse.set("collectMinutes", "31");
    expect(() => parseCreateForm(diverse)).toThrow(/30/);
    diverse.set("collectMinutes", "5");

    const close = new FormData();
    close.set("mode", "close");
    close.set("title", "Ресторан");
    close.set("name", "Боря");
    close.set("collectMinutes", "10");
    close.set("voteMinutes", "5");
    const input = parseCreateForm(close);
    expect(input.scale).toBe("score10");
    expect(input.mode).toBe("close");

    const db = room();
    const created = createRoom(db, input);
    const state = getPublicState(db, created.code, {
      participantToken: created.participantToken,
      hostToken: created.hostToken,
    });
    expect(state?.scale).toBe("score10");
    expect(state?.mode).toBe("close");
    expect(input.showAuthors).toBe(false);
  });

  it("hides who proposed an option until the host turns names on", () => {
    const db = room();
    const created = createRoom(db, {
      title: "Ужин",
      hostName: "Арман",
      scale: "text",
      collectMs: 60_000,
      voteMs: 60_000,
    });
    const host = { participantToken: created.participantToken, hostToken: created.hostToken };
    const anya = joinRoom(db, created.code, "Аня");
    const guest = { participantToken: anya.participantToken, hostToken: null };
    applyAction(db, created.code, host, { action: "start" });
    applyAction(db, created.code, guest, { action: "add", title: "Суп", note: "", link: "" });
    applyAction(db, created.code, host, { action: "finish" });

    const hidden = getPublicState(db, created.code, guest);
    expect(hidden?.showAuthors).toBe(false);
    expect(hidden?.ballot[0]?.authorName).toBeUndefined();
    expect(JSON.stringify(hidden?.ballot)).not.toContain("Аня");

    const shown = applyAction(db, created.code, host, { action: "authors", on: true });
    expect(shown.showAuthors).toBe(true);
    expect(shown.ballot.find((option) => option.title === "Суп")?.authorName).toBe("Аня");

    const hiddenAgain = applyAction(db, created.code, host, { action: "authors", on: false });
    expect(hiddenAgain.showAuthors).toBe(false);
    expect(hiddenAgain.ballot[0]?.authorName).toBeUndefined();
  });

  it("adds the author visibility column to an older database", () => {
    const file = path.join(os.tmpdir(), `nandch-migrate-${Date.now()}.db`);
    const raw = new Database(file);
    raw.exec("CREATE TABLE rooms (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
    raw.close();
    const db = openDatabase(file);
    const columns = db.prepare("PRAGMA table_info(rooms)").all() as { name: string }[];
    db.close();
    fs.unlinkSync(file);
    expect(columns.some((column) => column.name === "show_authors")).toBe(true);
    expect(columns.some((column) => column.name === "mode")).toBe(true);
  });
});
