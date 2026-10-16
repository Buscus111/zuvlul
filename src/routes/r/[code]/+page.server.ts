import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { readAuth } from "#lib/server/cookies";
import { getDb } from "#lib/server/db";
import { isRoomCode } from "#lib/server/ids";
import { getPublicState } from "#lib/server/rooms";

export const load: PageServerLoad = ({ params, cookies }) => {
  const code = (params.code ?? "").toUpperCase();
  if (!isRoomCode(code)) error(404, "Комната не найдена");
  const state = getPublicState(getDb(), code, readAuth(cookies, code));
  if (!state) error(404, "Комната не найдена");
  return { state };
};
