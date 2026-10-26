import assert from "node:assert/strict";
import { test } from "node:test";
import {
    acceptActions,
    deckProblem,
    dossierFor,
    withSeerReadings,
    newLobby,
    step,
    winnerOf,
    type Action,
    type ActionBody,
    type PublicState,
    type SecretState,
} from "../src/engine";
import type { RoleCounts, RoleId } from "../src/roles";

const NOW = 1_000_000;

/** A game already dealt, with roles fixed by the test. */
function dealt(roles: Record<string, RoleId>): { pub: PublicState; sec: SecretState } {
    const deck = { werewolf: 0, villager: 0, seer: 0, doctor: 0, hunter: 0, witch: 0 } as RoleCounts;
    for (const r of Object.values(roles)) deck[r]++;
    const lobby = newLobby({ gameId: "g", hostId: "a", hostName: "A", hostPlays: true, deck, now: NOW });
    const pub: PublicState = {
        ...lobby,
        phase: "night",
        day: 1,
        seq: 1,
        phaseStartedAt: NOW,
        deadline: NOW + 60_000,
        players: Object.keys(roles).map((id) => ({ id, name: id.toUpperCase(), color: "#000", keys: { ek: "" }, alive: true })),
    };
    return { pub, sec: { roles, doctorLast: null, potions: { heal: true, poison: true }, seerLog: [], victim: null, saved: false } };
}

function run(state: { pub: PublicState; sec: SecretState }, moves: [string, ActionBody][], now = NOW + 100_000) {
    const actions: Action[] = moves.map(([from, body], i) => ({ ...body, from, seq: state.pub.seq, ts: NOW + i }) as Action);
    const acts = acceptActions(state.pub, state.sec, actions);
    const next = step({ ...state, acts, rng: () => 0, now });
    assert.ok(next, "phase should advance");
    return next;
}

const alive = (pub: PublicState) => pub.players.filter((p) => p.alive).map((p) => p.id);

test("the wolves' victim dies at dawn and their role is revealed", () => {
    const g = dealt({ w: "werewolf", s: "seer", v1: "villager", v2: "villager", v3: "villager" });
    const day = run(g, [["w", { type: "kill", target: "v1" }], ["s", { type: "inspect", target: "w" }]]);
    assert.equal(day.pub.phase, "day");
    assert.deepEqual(alive(day.pub), ["w", "s", "v2", "v3"]);
    assert.equal(day.pub.players.find((p) => p.id === "v1")?.revealed, "villager");
    assert.equal(day.pub.players.find((p) => p.id === "w")?.revealed, undefined);
});

test("the doctor's protection saves the victim", () => {
    const g = dealt({ w: "werewolf", d: "doctor", v1: "villager", v2: "villager", v3: "villager" });
    const day = run(g, [["w", { type: "kill", target: "v1" }], ["d", { type: "protect", target: "v1" }]]);
    assert.equal(alive(day.pub).length, 5);
    assert.equal(day.sec.doctorLast, "v1");
});

test("the doctor cannot protect the same player two nights running", () => {
    const g = dealt({ w: "werewolf", d: "doctor", v1: "villager", v2: "villager", v3: "villager" });
    g.sec.doctorLast = "v1";
    const acts = acceptActions(g.pub, g.sec, [{ type: "protect", target: "v1", from: "d", seq: 1, ts: NOW }]);
    assert.equal(acts.protect, undefined);
});

test("the witch can heal the victim and poison someone else in one night", () => {
    const g = dealt({ w1: "werewolf", w2: "werewolf", x: "witch", v1: "villager", v2: "villager", v3: "villager", v4: "villager" });
    const witchTurn = run(g, [["w1", { type: "kill", target: "v1" }], ["w2", { type: "kill", target: "v1" }]]);
    assert.equal(witchTurn.pub.phase, "witch");
    assert.equal(witchTurn.sec.victim, "v1");
    const day = run(witchTurn, [["x", { type: "witch", heal: true, poison: "w1" }]]);
    assert.deepEqual(alive(day.pub).sort(), ["v1", "v2", "v3", "v4", "w2", "x"]);
    assert.deepEqual(day.sec.potions, { heal: false, poison: false });
    assert.equal(day.pub.players.find((p) => p.id === "w1")?.cause, "poison");
});

test("seer readings arrive the moment the seer chooses, and only the first counts", () => {
    const g = dealt({ w: "werewolf", s: "seer", v1: "villager", v2: "villager" });
    const acts = acceptActions(g.pub, g.sec, [
        { type: "inspect", target: "w", from: "s", seq: 1, ts: NOW },
        { type: "inspect", target: "v1", from: "s", seq: 1, ts: NOW + 1 },
    ]);
    assert.equal(acts.inspect?.s && acts.inspect.s.type === "inspect" && acts.inspect.s.target, "w");
});

test("a tied vote exiles nobody; a clear majority exiles and reveals", () => {
    const g = dealt({ w: "werewolf", a: "villager", b: "villager", c: "villager", d: "villager" });
    g.pub = { ...g.pub, phase: "vote", deadline: NOW + 45_000 };
    const tied = run(g, [
        ["w", { type: "vote", target: "a" }],
        ["a", { type: "vote", target: "w" }],
        ["b", { type: "vote", target: "skip" }],
    ]);
    assert.equal(tied.pub.phase, "night");
    assert.equal(alive(tied.pub).length, 5);

    const decided = run(g, [
        ["a", { type: "vote", target: "w" }],
        ["b", { type: "vote", target: "w" }],
        ["w", { type: "vote", target: "a" }],
    ]);
    assert.equal(decided.pub.phase, "over");
    assert.equal(decided.pub.winner, "village");
});

test("a dying hunter shoots before the game is decided", () => {
    const g = dealt({ w: "werewolf", h: "hunter", v: "villager", u: "villager" });
    g.pub = { ...g.pub, phase: "vote", deadline: NOW + 45_000 };
    const shooting = run(g, [
        ["w", { type: "vote", target: "h" }],
        ["v", { type: "vote", target: "h" }],
    ]);
    assert.equal(shooting.pub.phase, "hunter");
    assert.equal(shooting.pub.hunterId, "h");
    const over = run(shooting, [["h", { type: "shoot", target: "w" }]]);
    assert.equal(over.pub.phase, "over");
    assert.equal(over.pub.winner, "village");
});

test("wolves win once they equal the villagers", () => {
    const g = dealt({ w: "werewolf", a: "villager", b: "villager", c: "villager" });
    const day = run(g, [["w", { type: "kill", target: "a" }]]);
    assert.equal(day.pub.phase, "day");
    g.pub = { ...day.pub, phase: "vote", deadline: NOW };
    const over = run({ pub: g.pub, sec: day.sec }, [
        ["w", { type: "vote", target: "b" }],
        ["c", { type: "vote", target: "b" }],
    ]);
    assert.equal(over.pub.winner, "wolves");
    assert.equal(winnerOf(over.pub, over.sec), "wolves");
});

test("dead players' actions are ignored", () => {
    const g = dealt({ w: "werewolf", a: "villager", b: "villager", c: "villager" });
    g.pub = { ...g.pub, phase: "vote", players: g.pub.players.map((p) => (p.id === "a" ? { ...p, alive: false } : p)) };
    const acts = acceptActions(g.pub, g.sec, [{ type: "vote", target: "w", from: "a", seq: 1, ts: NOW }]);
    assert.equal(acts.vote, undefined);
});

test("the night does not end before the minimum even if everyone acted", () => {
    const g = dealt({ w: "werewolf", a: "villager", b: "villager", c: "villager" });
    const acts = acceptActions(g.pub, g.sec, [{ type: "kill", target: "a", from: "w", seq: 1, ts: NOW }]);
    assert.equal(step({ ...g, acts, rng: () => 0, now: NOW + 1000 }), null);
    assert.ok(step({ ...g, acts, rng: () => 0, now: NOW + 9000 }));
});

test("a seer cannot get a second reading by backdating a new choice", () => {
    const g = dealt({ w: "werewolf", s: "seer", v1: "villager", v2: "villager" });
    const first = acceptActions(g.pub, g.sec, [{ type: "inspect", target: "v1", from: "s", seq: 1, ts: 100 }]);
    const sec = withSeerReadings(g.pub, g.sec, first);
    const backdated = acceptActions(g.pub, sec, [
        { type: "inspect", target: "v1", from: "s", seq: 1, ts: 100 },
        { type: "inspect", target: "w", from: "s", seq: 1, ts: 50 },
    ]);
    assert.equal(withSeerReadings(g.pub, sec, backdated).seerLog.length, 1);
});

test("a dying hunter does not see the wolves while aiming, but does once the shot is taken", () => {
    const g = dealt({ w: "werewolf", h: "hunter", v: "villager", u: "villager" });
    g.pub = { ...g.pub, phase: "vote", deadline: NOW };
    const aiming = run(g, [["w", { type: "vote", target: "h" }], ["v", { type: "vote", target: "h" }]]);
    assert.equal(aiming.pub.phase, "hunter");
    assert.equal(dossierFor("h", aiming.pub, aiming.sec, {})?.ghost, undefined);
    const after = run(aiming, [["h", { type: "shoot", target: "u" }]]);
    assert.ok(dossierFor("h", after.pub, after.sec, {})?.ghost);
});

test("a doctor save is announced even when a witch is in the game", () => {
    const g = dealt({ w: "werewolf", d: "doctor", x: "witch", v1: "villager", v2: "villager" });
    const witchTurn = run(g, [["w", { type: "kill", target: "v1" }], ["d", { type: "protect", target: "v1" }]]);
    const day = run(witchTurn, [["x", { type: "witch", heal: false, poison: null }]]);
    assert.ok(day.pub.events.some((e) => e.kind === "saved" && e.survived));
});

test("special roles are limited to one each", () => {
    assert.deepEqual(deckProblem({ werewolf: 1, villager: 2, seer: 0, doctor: 0, hunter: 2, witch: 0 }, 5), { code: "one-special", role: "hunter" });
});
