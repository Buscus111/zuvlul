import type { Outcome } from "./score";
import type { ScaleId } from "./scales";

export type Phase = "lobby" | "collecting" | "voting" | "results";

export type RoomPerson = {
  name: string;
  host: boolean;
};

export type MyOption = {
  id: string;
  title: string;
  note: string;
  link: string;
};

export type BallotOption = MyOption & {
  mineRating: string | null;
};

export type PublicState = {
  code: string;
  title: string;
  phase: Phase;
  scale: ScaleId;
  serverNow: number;
  phaseEndsAt: number | null;
  collectMs: number;
  voteMs: number;
  participantCount: number;
  maxParticipants: number;
  optionCount: number;
  names: RoomPerson[];
  me: null | {
    name: string;
    isHost: boolean;
    followsMajority: boolean;
    ready: boolean;
  };
  myOptions: MyOption[];
  ballot: BallotOption[];
  results: Outcome | null;
};
