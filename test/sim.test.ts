import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionBody } from "../src/engine";
import type { GameView } from "../src/protocol";
import { parseRec } from "../src/records";
import { ROLE_ORDER } from "../src/roles";
import { createIdentity } from "../src/crypto";
import { FakeBoard, FakeClient, sleep, warpTime } from "./fake-drawdy";

const NAMES = ["Ada", "Bram", "Cleo", "Dov", "Esme", "Finn", "Gus", "Hana", "Ivo"];

const boards: FakeBoard[] = [];

async function seatTable(n: number, opts: { hostPlays?: boolean } = {}) {
    const board = new FakeBoard();
    boards.push(board);
    const clients = NAMES.slice(0, n).map((name, i) => new FakeClient(board, { id: `u${i}`, name, color: `hsl(${i * 40} 60% 50%)` }));
    for (const c of clients) await c.activate();
    for (const c of clients) await c.openPanel();
    const host = clients[0];
    await host.fromWebview({ t: "create", hostPlays: opts.hostPlays ?? true });
    await until(() => !!host.view?.game, "host sees the lobby");
    for (const c of clients.slice(opts.hostPlays === false ? 1 : 1)) {
        await until(() => !!c.view?.game, `${c.user.name} sees the lobby`);
        await c.fromWebview({ t: "join" });
    }
    const seated = opts.hostPlays === false ? n - 1 : n;
    await until(() => host.view?.game?.players.length === seated, "everyone is seated");
    return { board, clients, host };
}

async function until(cond: () => boolean, what: string, ms = 20_000) {
    const end = Date.now() + ms * 40;
    while (!cond()) {
        if (Date.now() > end) throw new Error(`timed out waiting until ${what}`);
        await sleep(20);
    }
}

/** Plays the obvious move for whatever this player is asked. Wolves always agree on the first target. */
function botMove(g: GameView, me: string): ActionBody | null {
    const p = g.prompt;
    if (!p || p.chosen !== undefined) return null;
    const pick = p.targets[0];
    switch (p.kind) {
        case "kill":
            return pick ? { type: "kill", target: pick } : null;
        case "inspect":
            return pick ? { type: "inspect", target: pick } : null;
        case "protect":
            return pick ? { type: "protect", target: p.targets.at(-1)! } : null;
        case "witch":
            return { type: "witch", heal: !!p.witch?.victim && p.witch.heal, poison: null };
        case "ready":
            return { type: "ready" };
        case "vote": {
            const target = p.targets[(me.charCodeAt(1) + g.day) % p.targets.length];
            return { type: "vote", target: target ?? "skip" };
        }
        case "shoot":
            return { type: "shoot", target: pick ?? null };
    }
}

async function playToEnd(clients: FakeClient[], host: FakeClient, chatter = true) {
    const sent = new Map<string, string>();
    let rounds = 0;
    while (host.view?.game?.phase !== "over") {
        if (++rounds > 4000) throw new Error("game did not finish");
        for (const c of clients) {
            const g = c.view?.game;
            if (!g) continue;
            const move = botMove(g, c.user.id);
            const key = `${g.seq}:${move?.type}`;
            if (move && sent.get(c.user.id) !== key) {
                sent.set(c.user.id, key);
                await c.fromWebview({ t: "act", body: move });
                if (chatter && g.canTown && g.phase === "day") {
                    await c.fromWebview({ t: "chat", channel: "town", text: `${c.user.name} thinks it is not them (day ${g.day})` });
                }
            }
        }
        await sleep(25);
    }
}

test("a full game plays out to a winner across nine drivers", { timeout: 120_000 }, async () => {
    const restore = warpTime(40);
    try {
        const { board, clients, host } = await seatTable(9);
        await host.fromWebview({ t: "config", deck: { werewolf: 2, seer: 1, doctor: 1, witch: 1, hunter: 1, villager: 3 } });
        await until(() => host.view?.game?.deck.witch === 1, "deck applied");
        await host.fromWebview({ t: "start" });
        await until(() => clients.every((c) => !!c.view?.game?.myRole), "every player learned a role");

        const roles = clients.map((c) => c.view!.game!.myRole!);
        assert.equal(roles.filter((r) => r === "werewolf").length, 2);
        for (const role of ["seer", "doctor", "witch", "hunter"]) assert.ok(roles.includes(role as never), `${role} dealt`);

        // Secrecy: nobody but the pack sees a hidden role during play.
        for (const c of clients) {
            const g = c.view!.game!;
            for (const p of g.players) {
                if (p.isMe || p.roleSource === "revealed") continue;
                if (p.role) assert.equal(g.myRole, "werewolf", `${c.user.name} saw ${p.name}'s role`);
            }
        }
        // Nothing on the board spells out a role in the clear.
        for (const el of board.elements.values()) {
            const rec = parseRec(el.meta);
            if (!rec || rec.k === "state" || rec.k === "visual") continue;
            const text = JSON.stringify(rec);
            for (const role of ROLE_ORDER.filter((r) => r !== "werewolf")) assert.ok(!text.includes(`"${role}"`), `${rec.k} leaks ${role}`);
        }

        await playToEnd(clients, host);
        const g = host.view!.game!;
        assert.ok(g.winner === "village" || g.winner === "wolves", "someone won");
        assert.ok(g.players.every((p) => p.role), "every role revealed at the end");
        for (const c of clients) {
            await until(() => c.view?.game?.phase === "over", `${c.user.name} sees the end`);
        }
        assert.ok(g.town.some((f) => f.kind === "chat"), "town chat reached the host");
        const state = [...board.elements.values()].map((e) => parseRec(e.meta)).find((r) => r?.k === "state") as { rev: number };
        assert.ok(state.rev < 400, `the host rewrote the state ${state.rev} times; late echoes must not trigger rewrites`);
        const visuals = [...board.elements.values()].filter((e) => parseRec(e.meta)?.k === "visual");
        assert.equal(visuals.length, 2, "one table and one chat log on the board");
    } finally {
        restore();
        boards.forEach((b) => b.close());
    }
});

test("the dead cannot speak, even if their driver tries", { timeout: 120_000 }, async () => {
    const restore = warpTime(10);
    try {
        const { board, clients, host } = await seatTable(5);
        await host.fromWebview({ t: "start" });
        await until(() => clients.every((c) => !!c.view?.game?.myRole), "roles dealt");
        const wolves = clients.filter((c) => c.view!.game!.myRole === "werewolf");
        const victimId = host.view!.game!.players.find((p) => !wolves.some((w) => w.user.id === p.id))!.id;
        for (const w of wolves) await w.fromWebview({ t: "act", body: { type: "kill", target: victimId } });
        // Everyone else with a night power acts so the night can end early.
        for (const c of clients) {
            const move = botMove(c.view!.game!, c.user.id);
            if (move && move.type !== "kill") await c.fromWebview({ t: "act", body: move.type === "protect" ? { type: "protect", target: c.user.id } : move });
        }
        await until(() => host.view?.game?.phase === "day", "dawn");
        const g = host.view!.game!;
        const victim = clients.find((c) => c.user.id === victimId)!;
        const died = !g.players.find((p) => p.id === victimId)!.alive;
        if (!died) return; // The doctor or witch saved them; nothing to check this run.

        await until(() => victim.view?.game?.alive === false, "victim learns they died");
        assert.equal(victim.view!.game!.canTown, false);
        assert.match(victim.view!.game!.townClosed, /dead/i);
        assert.ok(victim.view!.game!.players.every((p) => p.role), "ghosts see every role");

        await victim.fromWebview({ t: "chat", channel: "town", text: "I am a ghost" });
        assert.equal(
            [...board.elements.values()].filter((e) => parseRec(e.meta)?.k === "msg").length,
            0,
            "the dead player's driver refused to post"
        );

        // A tampered driver posts anyway, re-using a valid signature: every client must drop it.
        const alive = clients.find((c) => c.view!.game!.alive)!;
        await until(() => alive.view!.game!.canTown, "a living player may speak");
        await alive.fromWebview({ t: "chat", channel: "town", text: "hello from the living" });
        await until(() => host.view!.game!.town.some((f) => f.kind === "chat"), "living chat arrives");
        const forged = [...board.elements.values()].find((e) => parseRec(e.meta)?.k === "msg")!;
        const rec = { ...(parseRec(forged.meta) as object), p: victimId } as Record<string, unknown>;
        board.elements.set("forged", { ...forged, id: "forged", meta: { werewolf: rec } });
        board.broadcast("added", [board.elements.get("forged")!]);
        await sleep(200);
        for (const c of clients) {
            assert.ok(!c.view!.game!.town.some((f) => f.kind === "chat" && f.from === victimId), `${c.user.name} shows a dead player's message`);
        }
    } finally {
        restore();
        boards.forEach((b) => b.close());
    }
});

test("timers move the game on when nobody acts", { timeout: 120_000 }, async () => {
    const restore = warpTime(200);
    try {
        const { clients, host } = await seatTable(4);
        await host.fromWebview({ t: "start" });
        await until(() => host.view?.game?.phase === "day", "night times out into day", 30_000);
        await until(() => host.view?.game?.phase === "vote", "day times out into the vote", 30_000);
        await until(() => host.view?.game?.phase === "night", "vote times out into night", 30_000);
        assert.equal(host.view!.game!.day, 2);
        await until(() => clients.every((c) => c.view?.game?.phase === "night"), "every client follows the host");
    } finally {
        restore();
        boards.forEach((b) => b.close());
    }
});

test("a moderator host sees every role and can skip the timer", { timeout: 120_000 }, async () => {
    const restore = warpTime(40);
    try {
        const { clients, host } = await seatTable(6, { hostPlays: false });
        await host.fromWebview({ t: "start" });
        await until(() => clients.slice(1).every((c) => !!c.view?.game?.myRole), "roles dealt");
        const g = host.view!.game!;
        assert.equal(g.seated, false);
        assert.ok(g.players.every((p) => p.role && p.roleSource === "moderator"));
        assert.ok(g.canTown === false, "the narrator stays quiet at night");
        await host.fromWebview({ t: "advance" });
        await until(() => host.view?.game?.phase !== "night", "skip ends the night");
    } finally {
        restore();
        boards.forEach((b) => b.close());
    }
});

test("a forged seat cannot take over another player's role", { timeout: 120_000 }, async () => {
    const restore = warpTime(40);
    try {
        const { board, clients, host } = await seatTable(5);
        await host.fromWebview({ t: "start" });
        await until(() => clients.every((c) => !!c.view?.game?.myRole), "roles dealt");
        const victim = clients[2];
        const role = victim.view!.game!.myRole;
        const { identity } = createIdentity();
        const forgedId = board.newId();
        const state = [...board.elements.values()].map((e) => parseRec(e.meta)).find((r) => r?.k === "state")!;
        board.elements.set(forgedId, {
            id: forgedId, type: "shape", locked: false, x: 0, y: 0, width: 2, height: 2,
            meta: { werewolf: { k: "seat", g: state.g, p: victim.user.id, name: "x", color: "#000", ts: Date.now() + 1e6, keys: identity.publicKeys } },
        });
        board.broadcast("added", [board.elements.get(forgedId)!]);
        await clients[1].fromWebview({ t: "chat", channel: "town", text: "poke" });
        await sleep(300);
        const dossier = [...board.elements.values()].map((e) => parseRec(e.meta)).find((r) => r?.k === "dossier" && r.to === victim.user.id);
        assert.ok(dossier && dossier.k === "dossier");
        const { Keyring } = await import("../src/crypto");
        const opened = await new Keyring(identity).open(state.k === "state" ? state.hk.ek : "", dossier.box);
        assert.equal(opened, null, "the forged key cannot open the victim's dossier");
        assert.equal(victim.view!.game!.myRole, role, "the victim still knows their role");
    } finally {
        restore();
        boards.forEach((b) => b.close());
    }
});

test("sealed payloads are the same size whatever the role", { timeout: 120_000 }, async () => {
    const restore = warpTime(40);
    try {
        const { board, clients, host } = await seatTable(6);
        await host.fromWebview({ t: "start" });
        await until(() => clients.every((c) => !!c.view?.game?.myRole), "roles dealt");
        const sizes = new Set(
            [...board.elements.values()].map((e) => parseRec(e.meta)).filter((r) => r?.k === "dossier").map((r) => (r as { box: string }).box.length)
        );
        assert.equal(sizes.size, 1, `dossier sizes differ: ${[...sizes].join(", ")}`);
        for (const el of board.elements.values()) {
            const rec = parseRec(el.meta) as Record<string, unknown> | null;
            if (rec?.k === "act" || rec?.k === "pack") assert.equal(rec.p, undefined, `${rec.k} names its author`);
        }
    } finally {
        restore();
        boards.forEach((b) => b.close());
    }
});
