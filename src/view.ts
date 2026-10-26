import { deckProblem, type Dossier, type Phase, type PlayerId, type PublicState } from "./engine";
import type { Lang, Notice, TownClosed } from "./i18n";
import type { FeedItem, GameView, Prompt, View, ViewPlayer } from "./protocol";
import type { PackMsgRec, TownMsgRec } from "./records";
import type { RoleId } from "./roles";

export type TownLine = { id: string; rec: TownMsgRec };
export type PackLine = { id: string; rec: PackMsgRec; from: PlayerId; text: string };

const TOWN_PHASES = new Set<Phase>(["lobby", "day", "vote", "hunter", "over"]);
const PACK_PHASES = new Set<Phase>(["night", "witch"]);

/**
 * Whether `p` was allowed to speak on `channel` at phase `ps`. Every client
 * applies this to every message, so a dead player's words never show up even
 * if their driver ignores the closed chat box.
 */
export function canSpeak(pub: PublicState, p: PlayerId, ps: number, channel: "town" | "pack"): boolean {
    if (ps > pub.seq) return false;
    // In the lobby a seat signature is enough; the host may not have listed a new seat yet.
    if (pub.phase === "lobby" && channel === "town") return true;
    const player = pub.players.find((x) => x.id === p);
    const live = ps === pub.seq;
    if (channel === "town") {
        if (live && !TOWN_PHASES.has(pub.phase)) return false;
        if (!player) return p === pub.hostId && !pub.hostPlays;
        if (pub.phase === "over" && live) return true;
    } else {
        if (!player) return false;
        if (live && !PACK_PHASES.has(pub.phase)) return false;
    }
    return player.alive || (player.diedAt !== undefined && ps <= player.diedAt);
}

export type ViewInput = {
    me: View["me"];
    now: number;
    pub: PublicState | null;
    seated: boolean;
    dossier: Dossier | null;
    /** Every role, for a host who moderates instead of playing. */
    godRoles: Record<PlayerId, RoleId> | null;
    online: Set<PlayerId>;
    town: TownLine[];
    pack: PackLine[];
    busy: boolean;
    notice: Notice | null;
    lang: Lang;
};

export function buildView(input: ViewInput): View {
    const { me, now, busy, notice, lang } = input;
    return { now, me, busy, notice, lang, game: input.pub ? gameView(input, input.pub) : null };
}

function gameView(input: ViewInput, pub: PublicState): GameView {
    const { me, dossier, godRoles } = input;
    const isHost = pub.hostId === me.id;
    const self = pub.players.find((p) => p.id === me.id);
    const seated = pub.phase === "lobby" ? input.seated : !!self;
    const alive = !!self?.alive;
    const myRole = dossier?.role;
    const pack = new Set(dossier?.pack ?? []);

    const players: ViewPlayer[] = pub.players.map((p) => {
        let role: RoleId | undefined;
        let roleSource: ViewPlayer["roleSource"];
        if (p.revealed) [role, roleSource] = [p.revealed, "revealed"];
        else if (p.id === me.id && myRole) [role, roleSource] = [myRole, "self"];
        else if (godRoles?.[p.id]) [role, roleSource] = [godRoles[p.id], "moderator"];
        else if (dossier?.ghost?.[p.id]) [role, roleSource] = [dossier.ghost[p.id], "ghost"];
        else if (pack.has(p.id)) [role, roleSource] = ["werewolf", "pack"];
        const voting = pub.phase === "vote";
        return {
            id: p.id,
            name: p.name,
            color: p.color,
            alive: p.alive,
            isMe: p.id === me.id,
            isHost: p.id === pub.hostId,
            online: input.online.has(p.id),
            role,
            roleSource,
            votes: voting ? Object.values(pub.votes).filter((t) => t === p.id).length : 0,
            votedFor: voting ? pub.votes[p.id] : undefined,
            ready: pub.phase === "day" && pub.ready.includes(p.id),
            packPick: dossier?.packPicks?.[p.id],
        };
    });

    const town: FeedItem[] = [
        ...input.town.map(({ id, rec }): FeedItem => {
            const author = pub.players.find((p) => p.id === rec.p);
            return {
                kind: "chat",
                id,
                ts: rec.ts,
                from: rec.p,
                name: author?.name ?? pub.hostName,
                narrator: !author,
                color: author?.color ?? "#c9a45c",
                text: rec.text,
                mine: rec.p === me.id,
            };
        }),
        ...pub.events.map((e, i): FeedItem => ({ kind: "event", id: `e${e.seq}.${i}`, ts: e.ts, event: e })),
    ].sort((a, b) => a.ts - b.ts);

    const packFeed: FeedItem[] = input.pack
        .map(({ id, rec, from, text }): FeedItem => {
            const author = pub.players.find((p) => p.id === from);
            return {
                kind: "chat",
                id,
                ts: rec.ts,
                from,
                narrator: false,
                name: author?.name ?? "?",
                color: author?.color ?? "#c0392b",
                text,
                mine: from === me.id,
            };
        })
        .sort((a, b) => a.ts - b.ts);

    const mayTown = (seated || (isHost && !pub.hostPlays)) && canSpeak(pub, me.id, pub.seq, "town");
    const isPackMember = myRole === "werewolf";
    const canPack = isPackMember && canSpeak(pub, me.id, pub.seq, "pack");

    return {
        gameId: pub.gameId,
        phase: pub.phase,
        day: pub.day,
        seq: pub.seq,
        deadline: pub.deadline,
        isHost,
        hostName: pub.hostName,
        hostPlays: pub.hostPlays,
        hostOnline: isHost || input.online.has(pub.hostId),
        pace: pub.pace,
        deck: pub.deck,
        deckProblem: pub.phase === "lobby" ? deckProblem(pub.deck, pub.players.length) : null,
        players,
        seated,
        alive,
        myRole,
        prompt: promptFor(pub, me.id, dossier),
        seerLog: dossier?.seerLog,
        potions: dossier?.potions,
        winner: pub.winner,
        town,
        pack: packFeed,
        canTown: mayTown,
        canPack,
        townClosed: townClosedReason(pub, seated, alive, isHost),
        isPackMember,
    };
}

function townClosedReason(pub: PublicState, seated: boolean, alive: boolean, isHost: boolean): TownClosed {
    if (pub.phase === "lobby" || pub.phase === "over") return seated || isHost ? "" : "join";
    if (!seated) return isHost && !pub.hostPlays ? "" : "watching";
    if (!alive) return "dead";
    if (pub.phase === "night" || pub.phase === "witch") return "night";
    return "";
}

export function promptFor(pub: PublicState, meId: PlayerId, dossier: Dossier | null): Prompt | undefined {
    const self = pub.players.find((p) => p.id === meId);
    if (!self || !dossier) return undefined;
    const alive = pub.players.filter((p) => p.alive);
    const others = alive.filter((p) => p.id !== meId).map((p) => p.id);
    const mine = dossier.mine;

    if (pub.phase === "hunter" && pub.hunterId === meId) {
        const shot = mine.shoot;
        return {
            kind: "shoot",
            targets: others,
            allowSkip: true,
            chosen: shot && shot.type === "shoot" ? (shot.target ?? "skip") : undefined,
            final: true,
        };
    }
    if (!self.alive) return undefined;

    switch (pub.phase) {
        case "night": {
            if (dossier.role === "werewolf") {
                const pack = new Set(dossier.pack ?? []);
                const pick = mine.kill;
                return {
                    kind: "kill",
                    targets: alive.filter((p) => !pack.has(p.id)).map((p) => p.id),
                    allowSkip: false,
                    chosen: pick && pick.type === "kill" ? pick.target : undefined,
                    final: false,
                };
            }
            if (dossier.role === "seer") {
                const read = mine.inspect;
                return {
                    kind: "inspect",
                    targets: others,
                    allowSkip: false,
                    chosen: read && read.type === "inspect" ? read.target : undefined,
                    final: true,
                };
            }
            if (dossier.role === "doctor") {
                const guard = mine.protect;
                return {
                    kind: "protect",
                    doctorRepeat: !!dossier.doctorLast,
                    targets: alive.map((p) => p.id).filter((id) => id !== dossier.doctorLast),
                    allowSkip: false,
                    chosen: guard && guard.type === "protect" ? guard.target : undefined,
                    final: false,
                };
            }
            return undefined;
        }
        case "witch": {
            if (dossier.role !== "witch") return undefined;
            const done = mine.witch;
            return {
                kind: "witch",
                targets: others,
                allowSkip: true,
                chosen: done ? "skip" : undefined,
                final: true,
                witch: {
                    victim: dossier.witchVictim ?? null,
                    heal: !!dossier.potions?.heal,
                    poison: !!dossier.potions?.poison,
                },
            };
        }
        case "day":
            return {
                kind: "ready",
                targets: [],
                allowSkip: false,
                chosen: pub.ready.includes(meId) ? meId : undefined,
                final: false,
            };
        case "vote":
            return {
                kind: "vote",
                targets: others,
                allowSkip: true,
                chosen: pub.votes[meId],
                final: false,
            };
        default:
            return undefined;
    }
}
