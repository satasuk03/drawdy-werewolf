import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventBody, GameEvent, Phase } from "../src/engine";
import { LANGS, t, type DeckProblem, type Notice } from "../src/i18n";
import { ROLE_ORDER } from "../src/roles";

const events: EventBody[] = [
    { kind: "phase", what: "first-night" },
    { kind: "phase", what: "night" },
    { kind: "phase", what: "dawn" },
    { kind: "phase", what: "vote" },
    { kind: "saved", survived: true },
    { kind: "saved", survived: false },
    ...(["wolves", "poison", "vote", "hunter"] as const).map((cause): EventBody => ({ kind: "death", who: "a", cause, role: "seer" })),
    { kind: "vote", outcome: "split" },
    { kind: "vote", outcome: "none" },
    { kind: "vote", outcome: "exiled", who: "a", votes: 3 },
    { kind: "hunter", who: "a" },
    { kind: "hold-fire", who: "a" },
    { kind: "ended" },
    { kind: "win", team: "village" },
    { kind: "win", team: "wolves" },
];
const problems: DeckProblem[] = [
    { code: "min", n: 4 },
    { code: "max", n: 16 },
    { code: "size", cards: 5, players: 4 },
    { code: "no-wolf" },
    { code: "too-many-wolves" },
    { code: "one-special", role: "witch" },
];
const notices: Notice[] = [
    { code: "game-running" },
    { code: "table-full" },
    { code: "cannot-speak" },
    { code: "need-collab" },
    { code: "need-access" },
    { code: "secrets-elsewhere" },
    { code: "failed", detail: "x" },
    { code: "deck", problem: { code: "no-wolf" } },
];
const phases: Phase[] = ["lobby", "night", "witch", "day", "vote", "hunter", "over"];

const ok = (s: string | undefined, what: string) => {
    assert.ok(s && s.trim().length > 0, `${what} is empty`);
    assert.ok(!/undefined|NaN|\[object/.test(s), `${what} reads "${s}"`);
};

for (const { id } of LANGS) {
    test(`every game text renders in ${id}`, () => {
        const tr = t(id);
        for (const e of events) {
            const text = tr.event({ ...e, seq: 1, ts: 0, day: 2 } as GameEvent, () => "Mira");
            ok(text, `${id} event ${e.kind}`);
            if ("who" in e) assert.ok(text.includes("Mira"), `${id} event ${e.kind} names the player`);
        }
        for (const p of problems) ok(tr.problem(p), `${id} problem ${p.code}`);
        for (const n of notices) ok(tr.notice(n), `${id} notice ${n.code}`);
        for (const ph of phases) {
            ok(tr.phaseTitle(ph, 2, "village"), `${id} title ${ph}`);
            ok(tr.phaseSub(ph, 5, "Mira"), `${id} sub ${ph}`);
            ok(tr.boardSub(ph), `${id} board ${ph}`);
        }
        for (const r of ROLE_ORDER) {
            ok(tr.roles[r].name, `${id} ${r} name`);
            ok(tr.roles[r].blurb, `${id} ${r} blurb`);
            ok(tr.roleCount(r, 2), `${id} ${r} count`);
        }
        assert.equal(tr.rules.length, 5);
    });
}
