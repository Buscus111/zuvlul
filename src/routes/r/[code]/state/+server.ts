import { json, type RequestHandler } from "@sveltejs/kit";
import { readAuth, setParticipantCookie } from "#lib/server/cookies";
import { getDb } from "#lib/server/db";
import { RoomError } from "#lib/server/errors";
import { isRoomCode } from "#lib/server/ids";
import { applyAction, getPublicState, joinRoom } from "#lib/server/rooms";

function codeFrom(params: { code?: string }) {
  return (params.code ?? "").toUpperCase();
}

export const GET: RequestHandler = ({ params, cookies }) => {
  const code = codeFrom(params);
  if (!isRoomCode(code)) return json({ error: "Комната не найдена" }, { status: 404 });
  const state = getPublicState(getDb(), code, readAuth(cookies, code));
  if (!state) return json({ error: "Комната не найдена" }, { status: 404 });
  return json(state, { headers: { "cache-control": "no-store" } });
};

export const POST: RequestHandler = async ({ params, cookies, request, url }) => {
  if (request.headers.get("origin") !== url.origin) {
    return json({ error: "Чужой источник" }, { status: 403 });
  }
  const code = codeFrom(params);
  const body = (await request.json().catch(() => null)) as { action?: unknown; name?: unknown } | null;
  if (!body || typeof body !== "object") return json({ error: "Пустой запрос" }, { status: 400 });

  try {
    if (body.action === "join") {
      const joined = joinRoom(getDb(), code, String(body.name ?? ""));
      setParticipantCookie(cookies, code, joined.participantToken);
      const state = getPublicState(getDb(), code, {
        participantToken: joined.participantToken,
        hostToken: readAuth(cookies, code).hostToken,
      });
      return json(state);
    }
    const state = applyAction(getDb(), code, readAuth(cookies, code), body);
    return json(state);
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
};
