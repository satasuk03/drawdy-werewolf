import type { ActionBody, GameEvent, Pace, Phase, PlayerId, SeerReading } from "./engine";
import type { DeckProblem, Lang, Notice, TownClosed } from "./i18n";
import type { RoleCounts, RoleId, Team } from "./roles";

/**
 * Messages between the driver and its webview panel. Nothing here is worded
 * for a reader: the panel turns codes and events into text in its language.
 */

export type ViewPlayer = {
    id: PlayerId;
    name: string;
    color: string;
    alive: boolean;
    isMe: boolean;
    isHost: boolean;
    online: boolean;
    role?: RoleId;
    /** Why this viewer knows the role. */
    roleSource?: "revealed" | "self" | "pack" | "ghost" | "moderator";
    votes: number;
    votedFor?: PlayerId | "skip";
    ready: boolean;
    /** Wolves see what their packmates are pointing at. */
    packPick?: PlayerId;
};

export type PromptKind = "kill" | "inspect" | "protect" | "witch" | "vote" | "shoot" | "ready";

export type Prompt = {
    kind: PromptKind;
    targets: PlayerId[];
    allowSkip: boolean;
    /** The host has accepted this choice. */
    chosen?: PlayerId | "skip" | null;
    /** Seer, witch and hunter choices cannot be changed once made. */
    final: boolean;
    /** The doctor protected someone last night and cannot repeat them. */
    doctorRepeat?: boolean;
    witch?: { victim: PlayerId | null; heal: boolean; poison: boolean };
};

export type FeedItem =
    | {
          kind: "chat";
          id: string;
          ts: number;
          from: PlayerId;
          name: string;
          /** Spoken by a host who narrates instead of playing. */
          narrator: boolean;
          color: string;
          text: string;
          mine: boolean;
      }
    | { kind: "event"; id: string; ts: number; event: GameEvent };

export type GameView = {
    gameId: string;
    phase: Phase;
    day: number;
    seq: number;
    deadline: number | null;
    isHost: boolean;
    hostName: string;
    hostPlays: boolean;
    hostOnline: boolean;
    pace: Pace;
    deck: RoleCounts;
    deckProblem: DeckProblem | null;
    players: ViewPlayer[];
    seated: boolean;
    alive: boolean;
    myRole?: RoleId;
    prompt?: Prompt;
    seerLog?: SeerReading[];
    potions?: { heal: boolean; poison: boolean };
    winner: Team | null;
    town: FeedItem[];
    pack: FeedItem[];
    canTown: boolean;
    canPack: boolean;
    /** Why the town chat is closed, shown in place of the input. */
    townClosed: TownClosed;
    isPackMember: boolean;
};

export type View = {
    now: number;
    lang: Lang;
    me: { id: PlayerId; name: string; color: string };
    game: GameView | null;
    busy: boolean;
    notice: Notice | null;
};

export type DriverToWebview = { t: "view"; view: View };

export type WebviewToDriver =
    | { t: "ready"; lang: Lang }
    | { t: "lang"; lang: Lang }
    | { t: "create"; hostPlays: boolean }
    | { t: "join" }
    | { t: "leave" }
    | { t: "config"; deck?: RoleCounts; suggested?: boolean; pace?: Pace; hostPlays?: boolean }
    | { t: "start" }
    | { t: "act"; body: ActionBody }
    | { t: "chat"; channel: "town" | "pack"; text: string }
    | { t: "advance" }
    | { t: "end" }
    | { t: "focus-board" };
