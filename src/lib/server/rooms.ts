import { scoreOptions, type Ballot } from "#lib/score";
import { isChoiceMode, isScaleId, isValidMark, scaleForMode, type ChoiceMode, type ScaleId } from "#lib/scales";
import type { Phase, PublicState } from "#lib/types";
import type { DB } from "./db";
import { RoomError } from "./errors";
import { hashSecret, isRoomCode, newId, newRoomCode, newSecret } from "./ids";
import {
  DEFAULT_PARTICIPANTS,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  cleanOptionFields,
  cleanPersonName,
  type CreateInput,
} from "./parse";

type RoomRow = {
  id: string;
  title: string;
  host_token_hash: string;
  host_participant_id: string;
  scale: ScaleId;
  mode: ChoiceMode;
  collect_ms: number;
  vote_ms: number;
  phase: Phase;
  phase_ends_at: number | null;
  max_participants: number;
  show_authors: number;
  created_at: number;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  name: string;
  token_hash: string;
  ready: number;
  follows_majority: number;
  joined_at: number;
};

type OptionRow = {
  id: string;
  title: string;
  note: string;
  link: string;
  author_id: string;
  created_at: number;
  my_value: string | null;
};

export type Auth = {
  participantToken: string | null;
  hostToken: string | null;
};

export type CreatedRoom = {
  code: string;
  participantToken: string;
  hostToken: string;
};

const OPTION_CAP = 30;
const PER_PERSON_CAP = 10;

function participantCap(input: CreateInput): number {
  const cap = input.maxParticipants ?? DEFAULT_PARTICIPANTS;
  if (!Number.isInteger(cap) || cap < MIN_PARTICIPANTS || cap > MAX_PARTICIPANTS) {
    throw new RoomError("Участники: укажи целое число от 2 до 10");
  }
  return cap;
}

function peopleLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} человека`;
  return `${count} человек`;
}

function roomMode(room: RoomRow): ChoiceMode {
  return room.mode === "close" ? "close" : "diverse";
}

function roomById(db: DB, code: string): RoomRow | null {
  const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(code) as RoomRow | undefined;
  if (!row || !isScaleId(row.scale)) return null;
  return row;
}

function requireRoom(db: DB, code: string): RoomRow {
  if (!isRoomCode(code)) throw new RoomError("Комната не найдена", 404);
  const room = roomById(db, code);
  if (!room) throw new RoomError("Комната не найдена", 404);
  return room;
}

function participants(db: DB, roomId: string): ParticipantRow[] {
  return db
    .prepare("SELECT * FROM participants WHERE room_id = ? ORDER BY joined_at ASC, id ASC")
    .all(roomId) as ParticipantRow[];
}

function findParticipant(db: DB, roomId: string, token: string | null): ParticipantRow | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT * FROM participants WHERE room_id = ? AND token_hash = ?")
    .get(roomId, hashSecret(token)) as ParticipantRow | undefined;
  return row ?? null;
}

function isHost(room: RoomRow, hostToken: string | null): boolean {
  return Boolean(hostToken) && hashSecret(hostToken!) === room.host_token_hash;
}

function assertHost(room: RoomRow, hostToken: string | null) {
  if (!isHost(room, hostToken)) {
    throw new RoomError("Это может сделать только владелец комнаты", 403);
  }
}

function countOptions(db: DB, roomId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM options WHERE room_id = ?").get(roomId) as {
    n: number;
  };
  return row.n;
}

function allReady(db: DB, roomId: string): boolean {
  const people = participants(db, roomId);
  return people.length > 0 && people.every((person) => person.ready === 1);
}

function allVoted(db: DB, roomId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM participants p
       WHERE p.room_id = ?
         AND p.follows_majority = 0
         AND (
           SELECT COUNT(*) FROM ratings r
           JOIN options o ON o.id = r.option_id
           WHERE r.participant_id = p.id AND o.room_id = p.room_id
         ) < (SELECT COUNT(*) FROM options WHERE room_id = ?)`,
    )
    .get(roomId, roomId) as { n: number };
  const people = participants(db, roomId).length;
  return people > 0 && row.n === 0;
}

function setPhase(db: DB, roomId: string, phase: Phase, phaseEndsAt: number | null) {
  db.prepare("UPDATE rooms SET phase = ?, phase_ends_at = ? WHERE id = ?").run(
    phase,
    phaseEndsAt,
    roomId,
  );
}

function advance(db: DB, room: RoomRow, now: number) {
  if (room.phase === "collecting") {
    if (countOptions(db, room.id) === 0) {
      setPhase(db, room.id, "results", null);
      return;
    }
    setPhase(db, room.id, "voting", now + room.vote_ms);
    db.prepare("UPDATE participants SET ready = 0 WHERE room_id = ?").run(room.id);
    return;
  }
  if (room.phase === "voting") setPhase(db, room.id, "results", null);
}

function needsAdvance(db: DB, room: RoomRow, now: number): boolean {
  if (
    (room.phase === "collecting" || room.phase === "voting") &&
    room.phase_ends_at != null &&
    now >= room.phase_ends_at
  ) {
    return true;
  }
  if (room.phase === "collecting" && allReady(db, room.id)) return true;
  if (room.phase === "voting" && (countOptions(db, room.id) === 0 || allVoted(db, room.id))) {
    return true;
  }
  return false;
}

function advanceWhileNeeded(db: DB, code: string, now: number) {
  for (let guard = 0; guard < 4; guard += 1) {
    const room = requireRoom(db, code);
    if (!needsAdvance(db, room, now)) return;
    advance(db, room, now);
  }
}

function syncPhase(db: DB, code: string, now: number) {
  const tx = db.transaction(() => advanceWhileNeeded(db, code, now));
  tx();
}

function optionRows(db: DB, roomId: string, participantId: string | null): OptionRow[] {
  return db
    .prepare(
      `SELECT o.id, o.title, o.note, o.link, o.author_id, o.created_at, r.value AS my_value
       FROM options o
       LEFT JOIN ratings r ON r.option_id = o.id AND r.participant_id = ?
       WHERE o.room_id = ?
       ORDER BY o.created_at ASC, o.id ASC`,
    )
    .all(participantId ?? "", roomId) as OptionRow[];
}

function readState(db: DB, code: string, auth: Auth, now: number): PublicState | null {
  if (!isRoomCode(code)) return null;
  const room = roomById(db, code);
  if (!room) return null;
  const people = participants(db, room.id);
  const me = findParticipant(db, room.id, auth.participantToken);
  const options = optionRows(db, room.id, me?.id ?? null);
  const base = {
    code: room.id,
    title: room.title,
    phase: room.phase,
    mode: roomMode(room),
    scale: room.scale,
    serverNow: now,
    phaseEndsAt: room.phase_ends_at,
    collectMs: room.collect_ms,
    voteMs: room.vote_ms,
    participantCount: people.length,
    maxParticipants: room.max_participants,
    optionCount: options.length,
    showAuthors: room.show_authors === 1,
  };

  if (!me) {
    return { ...base, names: [], me: null, myOptions: [], ballot: [], results: null };
  }

  const results = room.phase === "results" ? resultsFromDb(db, room) : null;

  return {
    ...base,
    names: people.map((person) => ({
      name: person.name,
      host: person.id === room.host_participant_id,
    })),
    me: {
      name: me.name,
      isHost: isHost(room, auth.hostToken) && me.id === room.host_participant_id,
      followsMajority: me.follows_majority === 1,
      ready: me.ready === 1,
    },
    myOptions:
      room.phase === "collecting"
        ? options
            .filter((option) => option.author_id === me.id)
            .map(({ id, title, note, link }) => ({ id, title, note, link }))
        : [],
    ballot:
      room.phase === "voting"
        ? options.map((option) => {
            const card: PublicState["ballot"][number] = {
              id: option.id,
              title: option.title,
              note: option.note,
              link: option.link,
              mineRating: option.my_value,
            };
            const authorName = visibleAuthor(room, people, option.author_id);
            if (authorName) card.authorName = authorName;
            return card;
          })
        : [],
    results,
  };
}

function ratingOf(db: DB, optionId: string, participantId: string): string {
  const row = db
    .prepare("SELECT value FROM ratings WHERE option_id = ? AND participant_id = ?")
    .get(optionId, participantId) as { value: string } | undefined;
  return row?.value ?? "skip";
}

function visibleAuthor(room: RoomRow, people: ParticipantRow[], authorId: string): string | undefined {
  if (room.show_authors !== 1) return undefined;
  return people.find((person) => person.id === authorId)?.name;
}

function resultsFromDb(db: DB, room: RoomRow) {
  const options = db
    .prepare(
      `SELECT id, title, note, link, author_id, created_at FROM options
       WHERE room_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(room.id) as {
    id: string;
    title: string;
    note: string;
    link: string;
    author_id: string;
    created_at: number;
  }[];
  const outcome = scoreOptions(
    room.scale,
    options.map((option) => ({
      id: option.id,
      title: option.title,
      note: option.note,
      link: option.link,
      createdAt: option.created_at,
    })),
    ballotsFor(db, room.id, room.scale),
    roomMode(room),
  );
  if (room.show_authors !== 1) return outcome;
  const people = participants(db, room.id);
  return {
    ...outcome,
    ranking: outcome.ranking.map((row) => {
      const source = options.find((option) => option.id === row.id);
      const authorName = source ? visibleAuthor(room, people, source.author_id) : undefined;
      return authorName ? { ...row, authorName } : row;
    }),
  };
}

function ballotsFor(db: DB, roomId: string, scale: ScaleId): Ballot[] {
  const people = participants(db, roomId);
  const options = db
    .prepare("SELECT id FROM options WHERE room_id = ?")
    .all(roomId) as { id: string }[];
  return people.map((person) => {
    const ratings: Record<string, string> = {};
    for (const option of options) {
      const value = ratingOf(db, option.id, person.id);
      ratings[option.id] = isValidMark(scale, value) ? value : "skip";
    }
    return {
      participantId: person.id,
      followsMajority: person.follows_majority === 1,
      ratings,
    };
  });
}

export function getPublicState(db: DB, code: string, auth: Auth, now = Date.now()): PublicState | null {
  if (!isRoomCode(code) || !roomById(db, code)) return null;
  syncPhase(db, code, now);
  return readState(db, code, auth, now);
}

export function createRoom(db: DB, input: CreateInput, now = Date.now()): CreatedRoom {
  const mode = input.mode && isChoiceMode(input.mode) ? input.mode : input.scale === "score10" ? "close" : "diverse";
  const scale = input.mode && isChoiceMode(input.mode) ? scaleForMode(input.mode) : input.scale;
  if (!isScaleId(scale)) throw new RoomError("Выбери шкалу");
  const participantSecret = newSecret();
  const hostSecret = newSecret();
  const participantId = newId();
  let code = newRoomCode();
  const tx = db.transaction(() => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const taken = db.prepare("SELECT 1 FROM rooms WHERE id = ?").get(code);
      if (!taken) break;
      code = newRoomCode();
    }
    db.prepare(
      `INSERT INTO rooms (
        id, title, host_token_hash, host_participant_id, scale, mode, collect_ms, vote_ms,
        phase, phase_ends_at, max_participants, show_authors, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lobby', NULL, ?, ?, ?)`,
    ).run(
      code,
      input.title,
      hostSecret.hash,
      participantId,
      scale,
      mode,
      input.collectMs,
      input.voteMs,
      participantCap(input),
      input.showAuthors ? 1 : 0,
      now,
    );
    db.prepare(
      `INSERT INTO participants (id, room_id, name, token_hash, ready, follows_majority, joined_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
    ).run(participantId, code, input.hostName, participantSecret.hash, now);
  });
  tx();
  return { code, participantToken: participantSecret.raw, hostToken: hostSecret.raw };
}

export function joinRoom(db: DB, code: string, name: string, now = Date.now()): { participantToken: string } {
  const cleanName = cleanPersonName(name);
  const secret = newSecret();
  const tx = db.transaction(() => {
    syncInside(db, code, now);
    const room = requireRoom(db, code);
    if (participants(db, room.id).length >= room.max_participants) {
      throw new RoomError(`В комнате уже ${peopleLabel(room.max_participants)}`);
    }
    db.prepare(
      `INSERT INTO participants (id, room_id, name, token_hash, ready, follows_majority, joined_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
    ).run(newId(), room.id, cleanName, secret.hash, now);
  });
  tx();
  return { participantToken: secret.raw };
}

function syncInside(db: DB, code: string, now: number) {
  advanceWhileNeeded(db, code, now);
}

function requireMe(db: DB, room: RoomRow, auth: Auth): ParticipantRow {
  const me = findParticipant(db, room.id, auth.participantToken);
  if (!me) throw new RoomError("Сначала войди в комнату", 401);
  return me;
}

type Action = {
  action?: unknown;
  name?: unknown;
  title?: unknown;
  note?: unknown;
  link?: unknown;
  optionId?: unknown;
  value?: unknown;
  on?: unknown;
};

export function applyAction(db: DB, code: string, auth: Auth, body: Action, now = Date.now()): PublicState {
  const tx = db.transaction(() => {
    try {
    advanceWhileNeeded(db, code, now);
    const room = requireRoom(db, code);
    const action = body.action;

    if (action === "join") {
      throw new RoomError("Вход обрабатывается отдельно");
    }

    if (action === "start") {
      assertHost(room, auth.hostToken);
      requireMe(db, room, auth);
      if (room.phase !== "lobby") throw new RoomError("Добавление вариантов уже началось");
      setPhase(db, room.id, "collecting", now + room.collect_ms);
      return;
    }

    if (action === "add") {
      const me = requireMe(db, room, auth);
      if (room.phase !== "collecting") throw new RoomError("Вариант можно добавить, пока идёт добавление");
      const fields = cleanOptionFields({
        title: String(body.title ?? ""),
        note: String(body.note ?? ""),
        link: String(body.link ?? ""),
      });
      const mine = db
        .prepare("SELECT COUNT(*) AS n FROM options WHERE room_id = ? AND author_id = ?")
        .get(room.id, me.id) as { n: number };
      if (mine.n >= PER_PERSON_CAP) throw new RoomError("У тебя уже 10 вариантов");
      if (countOptions(db, room.id) >= OPTION_CAP) throw new RoomError("В комнате уже 30 вариантов");
      db.prepare(
        `INSERT INTO options (id, room_id, author_id, title, note, link, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId(), room.id, me.id, fields.title, fields.note, fields.link, now);
      db.prepare("UPDATE participants SET ready = 0 WHERE id = ?").run(me.id);
      return;
    }

    if (action === "remove") {
      const me = requireMe(db, room, auth);
      if (room.phase !== "collecting") throw new RoomError("Удалить вариант можно, пока идёт добавление");
      const optionId = String(body.optionId ?? "");
      const owned = db
        .prepare("SELECT id FROM options WHERE id = ? AND room_id = ? AND author_id = ?")
        .get(optionId, room.id, me.id);
      if (!owned) throw new RoomError("Удалить можно только свой вариант");
      db.prepare("DELETE FROM ratings WHERE option_id = ?").run(optionId);
      db.prepare("DELETE FROM options WHERE id = ?").run(optionId);
      return;
    }

    if (action === "ready") {
      const me = requireMe(db, room, auth);
      if (room.phase !== "collecting") throw new RoomError("Отметиться можно, пока добавляют варианты");
      if (me.ready !== 1 && countOptions(db, room.id) === 0) {
        throw new RoomError("Сначала нужен хотя бы один вариант");
      }
      db.prepare("UPDATE participants SET ready = CASE ready WHEN 1 THEN 0 ELSE 1 END WHERE id = ?").run(me.id);
      return;
    }

    if (action === "rate") {
      const me = requireMe(db, room, auth);
      if (room.phase !== "voting") throw new RoomError("Оценивать можно во время голосования");
      const optionId = String(body.optionId ?? "");
      const value = String(body.value ?? "");
      const option = db.prepare("SELECT id FROM options WHERE id = ? AND room_id = ?").get(optionId, room.id);
      if (!option) throw new RoomError("Вариант не найден");
      if (!isValidMark(room.scale, value)) throw new RoomError("Такой отметки в этой шкале нет");
      db.prepare(
        `INSERT INTO ratings (option_id, participant_id, value) VALUES (?, ?, ?)
         ON CONFLICT(option_id, participant_id) DO UPDATE SET value = excluded.value`,
      ).run(optionId, me.id, value);
      db.prepare("UPDATE participants SET follows_majority = 0 WHERE id = ?").run(me.id);
      return;
    }

    if (action === "majority") {
      const me = requireMe(db, room, auth);
      if (room.phase !== "voting") throw new RoomError("Так можно отметить только во время голосования");
      const on = body.on === true || body.on === "true" || body.on === 1;
      db.prepare("UPDATE participants SET follows_majority = ? WHERE id = ?").run(on ? 1 : 0, me.id);
      return;
    }

    if (action === "authors") {
      assertHost(room, auth.hostToken);
      requireMe(db, room, auth);
      const on = body.on === true || body.on === "true" || body.on === 1;
      db.prepare("UPDATE rooms SET show_authors = ? WHERE id = ?").run(on ? 1 : 0, room.id);
      return;
    }

    if (action === "finish") {
      assertHost(room, auth.hostToken);
      requireMe(db, room, auth);
      if (room.phase !== "collecting" && room.phase !== "voting") {
        throw new RoomError("Сейчас заканчивать нечего");
      }
      if (room.phase === "collecting" && countOptions(db, room.id) === 0) {
        throw new RoomError("Сначала нужен хотя бы один вариант");
      }
      advance(db, room, now);
      return;
    }

    throw new RoomError("Неизвестное действие");
    } finally {
      if (roomById(db, code)) advanceWhileNeeded(db, code, now);
    }
  });

  tx();
  const state = getPublicState(db, code, auth, now);
  if (!state) throw new RoomError("Комната не найдена", 404);
  return state;
}
