import type { PublicKeys } from "./crypto";
import type { DeckProblem } from "./i18n";
import { MAX_PLAYERS, MIN_PLAYERS, ROLES, type RoleCounts, type RoleId, type Team } from "./roles";

export type PlayerId = string;

export type Phase = "lobby" | "night" | "witch" | "hunter" | "day" | "vote" | "over";

export type Pace = "quick" | "standard" | "relaxed";

export type DeathCause = "wolves" | "poison" | "vote" | "hunter";

export type PublicPlayer = {
    id: PlayerId;
    name: string;
    color: string;
    /** Pinned when the host first seats the player; later seats with other keys are ignored. */
    keys: PublicKeys;
    alive: boolean;
    /** Set once the role is public: on death, or for everyone at game over. */
    revealed?: RoleId;
    cause?: DeathCause;
    /** Phase `seq` in which the death was announced. */
    diedAt?: number;
};

/** What happened, as data; each panel words it in its own language. */
export type EventBody =
    | { kind: "phase"; what: "first-night" | "night" | "dawn" | "vote" }
    | { kind: "saved"; survived: boolean }
    | { kind: "death"; who: PlayerId; cause: DeathCause; role: RoleId }
    | { kind: "vote"; outcome: "split" | "none" }
    | { kind: "vote"; outcome: "exiled"; who: PlayerId; votes: number }
    | { kind: "hunter"; who: PlayerId }
    | { kind: "hold-fire"; who: PlayerId }
    | { kind: "ended" }
    | { kind: "win"; team: Team };

export type GameEvent = EventBody & { seq: number; ts: number; day: number };

export type PublicState = {
    gameId: string;
    hostId: PlayerId;
    hostName: string;
    hostPlays: boolean;
    phase: Phase;
    /** Night N is followed by day N. */
    day: number;
    /** Bumped on every phase change; actions are scoped to one seq. */
    seq: number;
    phaseStartedAt: number;
    deadline: number | null;
    pace: Pace;
    deck: RoleCounts;
    /** Once the host edits the deck by hand it stops following the player count. */
    deckCustom: boolean;
    players: PublicPlayer[];
    /** Live tally while voting; the last vote's ballots after it. */
    votes: Record<PlayerId, PlayerId | "skip">;
    /** Players who asked to move from discussion to the vote. */
    ready: PlayerId[];
    hunterId: PlayerId | null;
    afterHunter: "day" | "night" | null;
    winner: Team | null;
    events: GameEvent[];
    /** Chat record ids the host accepted when they were sent. Clients show only these. */
    heard: string[];
};

/** Host-only memory. Never leaves the host except sealed to itself. */
export type SecretState = {
    roles: Record<PlayerId, RoleId>;
    doctorLast: PlayerId | null;
    potions: { heal: boolean; poison: boolean };
    seerLog: SeerReading[];
    /** The wolves' victim, held between the wolves' night and the witch's turn. */
    victim: PlayerId | null;
    /** The doctor turned the wolves away tonight. */
    saved: boolean;
};

export type SeerReading = { day: number; target: PlayerId; isWolf: boolean };

export type ActionBody =
    | { type: "kill"; target: PlayerId }
    | { type: "inspect"; target: PlayerId }
    | { type: "protect"; target: PlayerId }
    | { type: "witch"; heal: boolean; poison: PlayerId | null }
    | { type: "ready" }
    | { type: "vote"; target: PlayerId | "skip" }
    | { type: "shoot"; target: PlayerId | null };

export type ActionType = ActionBody["type"];

export type Action = ActionBody & { from: PlayerId; seq: number; ts: number };

/** The accepted actions of the current phase, one per player per type. */
export type PhaseActions = Partial<Record<ActionType, Record<PlayerId, Action>>>;

export type Rng = () => number;

const BASE_SECONDS: Record<Exclude<Phase, "lobby" | "over">, number> = {
    night: 60,
    witch: 30,
    hunter: 30,
    day: 150,
    vote: 45,
};

const PACE: Record<Pace, number> = { quick: 0.6, standard: 1, relaxed: 1.6 };

/** A night never resolves sooner than this, so its length leaks little. */
const MIN_NIGHT_MS = 8_000;

const MAX_EVENTS = 80;

export function phaseDurationMs(phase: Phase, pace: Pace): number | null {
    if (phase === "lobby" || phase === "over") return null;
    return Math.round(BASE_SECONDS[phase] * PACE[pace]) * 1000;
}

export function roleOf(sec: SecretState, id: PlayerId): RoleId | undefined {
    return sec.roles[id];
}

export function teamOf(role: RoleId | undefined): Team | undefined {
    return role ? ROLES[role].team : undefined;
}

export function alivePlayers(pub: PublicState): PublicPlayer[] {
    return pub.players.filter((p) => p.alive);
}

function isAlive(pub: PublicState, id: PlayerId | null | undefined): boolean {
    return !!id && pub.players.some((p) => p.id === id && p.alive);
}

function aliveWithRole(pub: PublicState, sec: SecretState, role: RoleId): PublicPlayer[] {
    return alivePlayers(pub).filter((p) => sec.roles[p.id] === role);
}

export function deckSize(deck: RoleCounts): number {
    return Object.values(deck).reduce((a, b) => a + b, 0);
}

export function deckProblem(deck: RoleCounts, players: number): DeckProblem | null {
    if (players < MIN_PLAYERS) return { code: "min", n: MIN_PLAYERS };
    if (players > MAX_PLAYERS) return { code: "max", n: MAX_PLAYERS };
    if (deckSize(deck) !== players) return { code: "size", cards: deckSize(deck), players };
    if (deck.werewolf < 1) return { code: "no-wolf" };
    if (deck.werewolf * 2 >= players) return { code: "too-many-wolves" };
    for (const role of ["seer", "doctor", "witch", "hunter"] as const) {
        if (deck[role] > 1) return { code: "one-special", role };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Creation and start

export function newLobby(args: {
    gameId: string;
    hostId: PlayerId;
    hostName: string;
    hostPlays: boolean;
    deck: RoleCounts;
    now: number;
}): PublicState {
    return {
        gameId: args.gameId,
        hostId: args.hostId,
        hostName: args.hostName,
        hostPlays: args.hostPlays,
        phase: "lobby",
        day: 0,
        seq: 0,
        phaseStartedAt: args.now,
        deadline: null,
        pace: "standard",
        deck: args.deck,
        deckCustom: false,
        players: [],
        votes: {},
        ready: [],
        hunterId: null,
        afterHunter: null,
        winner: null,
        events: [],
        heard: [],
    };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function startGame(
    lobby: PublicState,
    rng: Rng,
    now: number
): { pub: PublicState; sec: SecretState } {
    const problem = deckProblem(lobby.deck, lobby.players.length);
    if (problem) throw new Error(`cannot deal: ${problem.code}`);
    const cards = shuffle(
        (Object.entries(lobby.deck) as [RoleId, number][]).flatMap(([role, n]) =>
            Array<RoleId>(n).fill(role)
        ),
        rng
    );
    const roles: Record<PlayerId, RoleId> = {};
    lobby.players.forEach((p, i) => (roles[p.id] = cards[i]));
    const sec: SecretState = {
        roles,
        doctorLast: null,
        potions: { heal: true, poison: true },
        seerLog: [],
        victim: null,
        saved: false,
    };
    const pub: PublicState = {
        ...lobby,
        players: lobby.players.map((p) => ({ ...p, alive: true })),
        events: [],
    };
    return { pub: enterPhase(pub, "night", 1, now, { kind: "phase", what: "first-night" }), sec };
}

function enterPhase(
    pub: PublicState,
    phase: Phase,
    day: number,
    now: number,
    announce?: EventBody
): PublicState {
    const ms = phaseDurationMs(phase, pub.pace);
    const seq = pub.seq + 1;
    const next: PublicState = {
        ...pub,
        phase,
        day,
        seq,
        phaseStartedAt: now,
        deadline: ms === null ? null : now + ms,
        ready: [],
        votes: phase === "vote" ? {} : pub.votes,
    };
    return announce ? addEvent(next, announce, now) : next;
}

function addEvent(pub: PublicState, body: EventBody, now: number): PublicState {
    const events = [...pub.events, { ...body, seq: pub.seq, ts: now, day: pub.day }];
    return { ...pub, events: events.slice(-MAX_EVENTS) };
}

// ---------------------------------------------------------------------------
// Actions

/** Who may act, and on whom, in the current phase. `null` means not allowed. */
export function actionProblem(
    pub: PublicState,
    sec: SecretState,
    a: Action,
    accepted: PhaseActions
): string | null {
    if (a.seq !== pub.seq) return "stale";
    if (!isAlive(pub, a.from) && !(a.type === "shoot" && pub.hunterId === a.from)) {
        return "dead players cannot act";
    }
    const role = sec.roles[a.from];
    const targetAlive = (t: PlayerId) => isAlive(pub, t);
    switch (a.type) {
        case "kill":
            if (pub.phase !== "night" || role !== "werewolf") return "not your turn";
            if (!targetAlive(a.target) || sec.roles[a.target] === "werewolf") return "bad target";
            return null;
        case "inspect":
            if (pub.phase !== "night" || role !== "seer") return "not your turn";
            if (accepted.inspect?.[a.from]) return "already inspected";
            if (!targetAlive(a.target) || a.target === a.from) return "bad target";
            return null;
        case "protect":
            if (pub.phase !== "night" || role !== "doctor") return "not your turn";
            if (!targetAlive(a.target) || a.target === sec.doctorLast) return "bad target";
            return null;
        case "witch":
            if (pub.phase !== "witch" || role !== "witch") return "not your turn";
            if (accepted.witch?.[a.from]) return "already decided";
            if (a.heal && (!sec.potions.heal || !sec.victim)) return "no heal";
            if (a.poison !== null && (!sec.potions.poison || !targetAlive(a.poison))) return "no poison";
            return null;
        case "ready":
            return pub.phase === "day" ? null : "not now";
        case "vote":
            if (pub.phase !== "vote") return "not now";
            if (a.target !== "skip" && !targetAlive(a.target)) return "bad target";
            return null;
        case "shoot":
            if (pub.phase !== "hunter" || pub.hunterId !== a.from) return "not your turn";
            if (accepted.shoot?.[a.from]) return "already shot";
            if (a.target !== null && (!targetAlive(a.target) || a.target === a.from)) return "bad target";
            return null;
    }
}

/**
 * Folds every submitted action into the accepted set for the current phase,
 * in timestamp order. Final choices (seer, witch, hunter) keep the first valid
 * one; the rest keep the latest.
 */
export function acceptActions(pub: PublicState, sec: SecretState, actions: readonly Action[]): PhaseActions {
    const accepted: PhaseActions = {};
    const ordered = actions.filter((a) => a.seq === pub.seq).sort((x, y) => x.ts - y.ts);
    for (const a of ordered) {
        if (actionProblem(pub, sec, a, accepted) !== null) continue;
        (accepted[a.type] ??= {})[a.from] = a;
    }
    return accepted;
}

function chosen<T extends ActionType>(acts: PhaseActions, type: T): Extract<Action, { type: T }>[] {
    return Object.values(acts[type] ?? {}) as Extract<Action, { type: T }>[];
}

export function phaseComplete(pub: PublicState, sec: SecretState, acts: PhaseActions, now: number): boolean {
    const has = (type: ActionType, id: PlayerId) => !!acts[type]?.[id];
    switch (pub.phase) {
        case "night": {
            if (now - pub.phaseStartedAt < MIN_NIGHT_MS) return false;
            const wolvesDone = aliveWithRole(pub, sec, "werewolf").every((p) => has("kill", p.id));
            const seerDone = aliveWithRole(pub, sec, "seer").every((p) => has("inspect", p.id));
            const doctorDone = aliveWithRole(pub, sec, "doctor").every((p) => has("protect", p.id));
            return wolvesDone && seerDone && doctorDone && packAgrees(acts);
        }
        case "witch":
            return aliveWithRole(pub, sec, "witch").every((p) => has("witch", p.id));
        case "hunter":
            return !!pub.hunterId && has("shoot", pub.hunterId);
        case "day": {
            const alive = alivePlayers(pub);
            return alive.length > 0 && alive.every((p) => pub.ready.includes(p.id));
        }
        case "vote":
            return alivePlayers(pub).every((p) => has("vote", p.id));
        default:
            return false;
    }
}

/** The pack resolves early only once every wolf points at the same victim. */
function packAgrees(acts: PhaseActions): boolean {
    return new Set(chosen(acts, "kill").map((a) => a.target)).size <= 1;
}

/** Most-picked target; ties are broken at random. */
function plurality(targets: PlayerId[], rng: Rng): PlayerId | null {
    if (targets.length === 0) return null;
    const counts = new Map<PlayerId, number>();
    for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
    const top = Math.max(...counts.values());
    const tied = [...counts].filter(([, n]) => n === top).map(([t]) => t).sort();
    return tied[Math.floor(rng() * tied.length)];
}

/** Reflects live, public parts of the phase (ready flags, ballots) into the public state. */
export function withLiveTallies(pub: PublicState, acts: PhaseActions): PublicState {
    if (pub.phase === "day") {
        return { ...pub, ready: chosen(acts, "ready").map((a) => a.from).sort() };
    }
    if (pub.phase === "vote") {
        const votes: PublicState["votes"] = {};
        for (const a of chosen(acts, "vote")) votes[a.from] = a.target;
        return { ...pub, votes };
    }
    return pub;
}

/** Seer readings take effect the moment the seer chooses. */
export function withSeerReadings(pub: PublicState, sec: SecretState, acts: PhaseActions): SecretState {
    // One reading per night, whatever timestamps a seer's driver claims.
    if (sec.seerLog.some((r) => r.day === pub.day)) return sec;
    const fresh = chosen(acts, "inspect").slice(0, 1);
    if (fresh.length === 0) return sec;
    return {
        ...sec,
        seerLog: [
            ...sec.seerLog,
            ...fresh.map((a) => ({ day: pub.day, target: a.target, isWolf: sec.roles[a.target] === "werewolf" })),
        ],
    };
}

// ---------------------------------------------------------------------------
// Advancing

export type StepInput = {
    pub: PublicState;
    sec: SecretState;
    acts: PhaseActions;
    rng: Rng;
    now: number;
    /** The host chose to skip the rest of the timer. */
    force?: boolean;
};

/** Advances one phase if it is complete, timed out, or forced. Returns null when nothing changes. */
export function step({ pub, sec, acts, rng, now, force }: StepInput): { pub: PublicState; sec: SecretState } | null {
    if (pub.phase === "lobby" || pub.phase === "over") return null;
    const timedOut = pub.deadline !== null && now >= pub.deadline;
    if (!force && !timedOut && !phaseComplete(pub, sec, acts, now)) return null;
    switch (pub.phase) {
        case "night":
            return endNight(pub, sec, acts, rng, now);
        case "witch":
            return resolveNight(pub, sec, chosen(acts, "witch")[0] ?? null, now);
        case "hunter":
            return endHunter(pub, sec, chosen(acts, "shoot")[0]?.target ?? null, now);
        case "day":
            return { pub: enterPhase(pub, "vote", pub.day, now, { kind: "phase", what: "vote" }), sec };
        case "vote":
            return endVote(pub, sec, acts, now);
    }
}

function endNight(pub: PublicState, sec: SecretState, acts: PhaseActions, rng: Rng, now: number) {
    const victim = plurality(chosen(acts, "kill").map((a) => a.target), rng);
    const protectedId = chosen(acts, "protect")[0]?.target ?? null;
    const saved = victim !== null && victim === protectedId;
    const next: SecretState = { ...sec, doctorLast: protectedId, victim: saved ? null : victim, saved };
    const witchCanAct =
        aliveWithRole(pub, sec, "witch").length > 0 && (sec.potions.heal || sec.potions.poison);
    if (witchCanAct) {
        return { pub: enterPhase(pub, "witch", pub.day, now), sec: next };
    }
    return resolveNight(pub, next, null, now);
}

function resolveNight(
    pub: PublicState,
    sec: SecretState,
    witch: Extract<Action, { type: "witch" }> | null,
    now: number
) {
    const deaths: { id: PlayerId; cause: DeathCause }[] = [];
    const potions = { ...sec.potions };
    let healed = false;
    if (witch?.heal && sec.victim && potions.heal) {
        potions.heal = false;
        healed = true;
    }
    if (sec.victim && !healed) deaths.push({ id: sec.victim, cause: "wolves" });
    if (witch?.poison && potions.poison) {
        potions.poison = false;
        if (!deaths.some((d) => d.id === witch.poison)) deaths.push({ id: witch.poison, cause: "poison" });
    }
    const nextSec: SecretState = { ...sec, potions, victim: null, saved: false };
    let next = enterPhase(pub, "day", pub.day, now, { kind: "phase", what: "dawn" });
    if (deaths.length === 0) next = addEvent(next, { kind: "saved", survived: sec.saved || healed }, now);
    next = applyDeaths(next, nextSec, deaths, now, pub.seq);
    return afterDeaths(next, nextSec, deaths, "day", now);
}

function endVote(pub: PublicState, sec: SecretState, acts: PhaseActions, now: number) {
    const ballots = chosen(acts, "vote");
    const counts = new Map<PlayerId | "skip", number>();
    for (const b of ballots) counts.set(b.target, (counts.get(b.target) ?? 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    const [first, second] = ranked;
    const votes: PublicState["votes"] = {};
    for (const b of ballots) votes[b.from] = b.target;
    let next: PublicState = { ...pub, votes };
    const decisive = first && first[0] !== "skip" && (!second || first[1] > second[1]);
    if (!decisive) {
        next = addEvent(next, { kind: "vote", outcome: ballots.length ? "split" : "none" }, now);
        return afterDeaths(next, sec, [], "night", now);
    }
    const exiled = first[0] as PlayerId;
    next = addEvent(next, { kind: "vote", outcome: "exiled", who: exiled, votes: first[1] }, now);
    const deaths = [{ id: exiled, cause: "vote" as const }];
    next = applyDeaths(next, sec, deaths, now, pub.seq);
    return afterDeaths(next, sec, deaths, "night", now);
}

function endHunter(pub: PublicState, sec: SecretState, target: PlayerId | null, now: number) {
    let next: PublicState = { ...pub, hunterId: null };
    const deaths = target ? [{ id: target, cause: "hunter" as const }] : [];
    if (!target) next = addEvent(next, { kind: "hold-fire", who: pub.hunterId! }, now);
    next = applyDeaths(next, sec, deaths, now, pub.seq);
    return afterDeaths(next, sec, deaths, pub.afterHunter ?? "night", now);
}

/**
 * `diedAt` is the last phase seq the player lived through, so their messages
 * from that phase stay valid and anything later is rejected.
 */
function applyDeaths(
    pub: PublicState,
    sec: SecretState,
    deaths: { id: PlayerId; cause: DeathCause }[],
    now: number,
    diedAt: number
): PublicState {
    let next = pub;
    for (const d of deaths) {
        const role = sec.roles[d.id];
        next = {
            ...next,
            players: next.players.map((p) =>
                p.id === d.id ? { ...p, alive: false, revealed: role, cause: d.cause, diedAt } : p
            ),
        };
        next = addEvent(next, { kind: "death", who: d.id, cause: d.cause, role }, now);
    }
    return next;
}

/** After any deaths: a fallen hunter shoots first, then the game may end, else play moves on. */
function afterDeaths(
    pub: PublicState,
    sec: SecretState,
    deaths: { id: PlayerId }[],
    then: "day" | "night",
    now: number
): { pub: PublicState; sec: SecretState } {
    const hunter = deaths.find((d) => sec.roles[d.id] === "hunter");
    if (hunter && alivePlayers(pub).length > 0) {
        const next = enterPhase(
            { ...pub, hunterId: hunter.id, afterHunter: then },
            "hunter",
            pub.day,
            now,
            { kind: "hunter", who: hunter.id }
        );
        return { pub: next, sec };
    }
    const winner = winnerOf(pub, sec);
    if (winner) return { pub: endGame(pub, sec, winner, now), sec };
    if (then === "day") {
        // Already in the day phase entered by resolveNight, or returning from a hunter shot at dawn.
        if (pub.phase === "day") return { pub: { ...pub, afterHunter: null }, sec };
        return { pub: enterPhase({ ...pub, afterHunter: null }, "day", pub.day, now), sec };
    }
    return {
        pub: enterPhase({ ...pub, afterHunter: null }, "night", pub.day + 1, now, { kind: "phase", what: "night" }),
        sec,
    };
}

export function winnerOf(pub: PublicState, sec: SecretState): Team | null {
    const alive = alivePlayers(pub);
    const wolves = alive.filter((p) => sec.roles[p.id] === "werewolf").length;
    if (wolves === 0) return "village";
    if (wolves >= alive.length - wolves) return "wolves";
    return null;
}

function endGame(pub: PublicState, sec: SecretState, winner: Team, now: number): PublicState {
    const over: PublicState = {
        ...pub,
        phase: "over",
        seq: pub.seq + 1,
        deadline: null,
        phaseStartedAt: now,
        winner,
        hunterId: null,
        afterHunter: null,
        players: pub.players.map((p) => ({ ...p, revealed: sec.roles[p.id] })),
    };
    return addEvent(over, { kind: "win", team: winner }, now);
}

/** The host ends a game early; every role is revealed and nobody wins. */
export function abandonGame(pub: PublicState, sec: SecretState | null, now: number): PublicState {
    return addEvent(
        {
            ...pub,
            phase: "over",
            seq: pub.seq + 1,
            deadline: null,
            phaseStartedAt: now,
            winner: null,
            players: pub.players.map((p) => ({ ...p, revealed: sec?.roles[p.id] ?? p.revealed })),
        },
        { kind: "ended" },
        now
    );
}

// ---------------------------------------------------------------------------
// What each player privately knows

export type Dossier = {
    role: RoleId;
    /** Wolves see their pack and, at night, each wolf's current pick. */
    pack?: PlayerId[];
    packPicks?: Record<PlayerId, PlayerId>;
    seerLog?: SeerReading[];
    doctorLast?: PlayerId | null;
    potions?: { heal: boolean; poison: boolean };
    /** Shown to the witch during her turn. */
    witchVictim?: PlayerId | null;
    /** This player's accepted choices in the current phase. */
    mine: Partial<Record<ActionType, Action>>;
    /** The dead see every role. */
    ghost?: Record<PlayerId, RoleId>;
};

export function dossierFor(id: PlayerId, pub: PublicState, sec: SecretState, acts: PhaseActions): Dossier | null {
    const role = sec.roles[id];
    if (!role) return null;
    const mine: Dossier["mine"] = {};
    for (const [type, byPlayer] of Object.entries(acts) as [ActionType, Record<PlayerId, Action>][]) {
        if (byPlayer[id]) mine[type] = byPlayer[id];
    }
    const d: Dossier = { role, mine };
    if (role === "werewolf") {
        d.pack = Object.keys(sec.roles).filter((p) => sec.roles[p] === "werewolf");
        if (pub.phase === "night") {
            d.packPicks = Object.fromEntries(chosen(acts, "kill").map((a) => [a.from, a.target]));
        }
    }
    if (role === "seer") d.seerLog = sec.seerLog;
    if (role === "doctor") d.doctorLast = sec.doctorLast;
    if (role === "witch") {
        d.potions = sec.potions;
        if (pub.phase === "witch") d.witchVictim = sec.victim;
    }
    const me = pub.players.find((p) => p.id === id);
    // A dying hunter still has a shot to take, so they must not see the wolves yet.
    const aiming = pub.phase === "hunter" && pub.hunterId === id;
    if (me && !me.alive && !aiming) d.ghost = sec.roles;
    return d;
}
