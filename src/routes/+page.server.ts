import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { setHostCookie, setParticipantCookie, readAuth } from "#lib/server/cookies";
import { getDb } from "#lib/server/db";
import { RoomError } from "#lib/server/errors";
import { isRoomCode } from "#lib/server/ids";
import { cleanPersonName, parseCreateForm } from "#lib/server/parse";
import { createRoom, getPublicState, joinRoom } from "#lib/server/rooms";

export const actions = {
  create: async ({ request, cookies }) => {
    const form = await request.formData();
    let code = "";
    try {
      const created = createRoom(getDb(), parseCreateForm(form));
      code = created.code;
      setParticipantCookie(cookies, created.code, created.participantToken);
      setHostCookie(cookies, created.code, created.hostToken);
    } catch (error) {
      if (error instanceof RoomError) return fail(error.status, { createError: error.message });
      throw error;
    }
    redirect(303, `/r/${code}`);
  },

  join: async ({ request, cookies }) => {
    const form = await request.formData();
    const code = String(form.get("code") ?? "")
      .trim()
      .toUpperCase();
    if (!isRoomCode(code)) return fail(400, { joinError: "Код комнаты — это 6 символов" });

    const existing = readAuth(cookies, code);
    if (existing.participantToken && getPublicState(getDb(), code, existing)?.me) {
      redirect(303, `/r/${code}`);
    }

    try {
      cleanPersonName(String(form.get("name") ?? ""));
      const joined = joinRoom(getDb(), code, String(form.get("name") ?? ""));
      setParticipantCookie(cookies, code, joined.participantToken);
    } catch (error) {
      if (error instanceof RoomError) return fail(error.status, { joinError: error.message });
      throw error;
    }
    redirect(303, `/r/${code}`);
  },
} satisfies Actions;
