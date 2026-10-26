import type { PublicKeys } from "./crypto";
import type { PlayerId } from "./engine";

/**
 * Every piece of shared game data is a scene element whose `meta[META_KEY]`
 * holds one record. Each record has exactly one writer, so collaborators never
 * race on the same element: the host owns state, vault, dossiers and visuals;
 * each player owns their seat, actions and messages.
 */
export const META_KEY = "werewolf";

export type StateRec = {
    k: "state";
    g: string;
    created: number;
    rev: number;
    /** Host public keys, so players can seal actions for the host. */
    hk: PublicKeys;
    /** JSON of `PublicState`; a string so meta merging can never mix revisions. */
    json: string;
    frameId: string;
    /**
     * The host's MAC over `stateMacText` for each player it knows, keyed by
     * player, so each player can tell the state really came from the host.
     */
    tags: Record<PlayerId, string>;
};

export function stateMacText(s: Pick<StateRec, "g" | "rev" | "created" | "frameId" | "json">): string {
    return `${s.g}|${s.rev}|${s.created}|${s.frameId}|${s.json}`;
}

/** Host-only secret state, sealed by the host to itself. */
export type VaultRec = { k: "vault"; g: string; box: string };

/** One player's private view, sealed by the host for that player. */
export type DossierRec = { k: "dossier"; g: string; to: PlayerId; box: string };

export type SeatRec = {
    k: "seat";
    g: string;
    p: PlayerId;
    name: string;
    color: string;
    ts: number;
    keys: PublicKeys;
};

/**
 * An action sealed for the host. It names no player: the host learns the
 * author from whose key opens it, so onlookers can't tell who acts at night.
 */
export type ActRec = { k: "act"; g: string; box: string };

/** A public chat message, with a MAC that proves its author to the host. */
export type TownMsgRec = {
    k: "msg";
    g: string;
    p: PlayerId;
    ts: number;
    /** Phase seq the sender saw when speaking. */
    ps: number;
    text: string;
    tag: string;
};

/**
 * A wolf-pack message, sealed once for every living wolf and once for the
 * host, in shuffled order and without names, so it reveals nobody.
 */
export type PackMsgRec = {
    k: "pack";
    g: string;
    ts: number;
    ps: number;
    boxes: string[];
};

/** What a pack box holds. */
export type PackLetter = { from: PlayerId; text: string };

/** Board decoration drawn by the host. */
export type VisualRec = { k: "visual"; g: string; part: "table" | "chat" };

export type Rec = StateRec | VaultRec | DossierRec | SeatRec | ActRec | TownMsgRec | PackMsgRec | VisualRec;

export type SealedAction = {
    body: import("./engine").ActionBody;
    seq: number;
    ts: number;
};

export function townMacText(m: Pick<TownMsgRec, "g" | "p" | "ts" | "ps" | "text">): string {
    return `${m.g}|${m.p}|${m.ts}|${m.ps}|${m.text}`;
}

export function parseRec(meta: unknown): Rec | null {
    if (!meta || typeof meta !== "object") return null;
    const rec = (meta as Record<string, unknown>)[META_KEY];
    if (!rec || typeof rec !== "object") return null;
    const r = rec as { k?: unknown; g?: unknown };
    if (typeof r.k !== "string" || typeof r.g !== "string") return null;
    return rec as Rec;
}

export const MAX_CHAT_LENGTH = 280;
