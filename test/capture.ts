// Plays a scripted game and writes the views each panel received, plus the
// host's board components, so the UI can be screenshotted outside Drawdy.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_BACK, cardArt } from "../src/art";
import { renderChat, renderTable } from "../src/board";
import type { PublicState } from "../src/engine";
import { LANGS } from "../src/i18n";
import type { TownMsgRec } from "../src/records";
import type { ActionBody } from "../src/engine";
import type { View } from "../src/protocol";
import { parseRec } from "../src/records";
import { FakeBoard, FakeClient, sleep, warpTime } from "./fake-drawdy";

const out = process.env.CAPTURE_DIR!;
mkdirSync(out, { recursive: true });
const restore = warpTime(5);
const shots: Record<string, View> = {};
const snap = (name: string, c: FakeClient) => (shots[name] = structuredClone(c.view!));

const board = new FakeBoard();
const names = ["Mira", "Tobias", "Ines", "Kwame", "Saoirse", "Yuki", "Dmitri", "Lena"];
const colors = ["#e07a5f", "#3d8bfd", "#2a9d8f", "#c77dff", "#f4a261", "#ef476f", "#06d6a0", "#ffd166"];
const cs = names.map((n, i) => new FakeClient(board, { id: `u${i}`, name: n, color: colors[i] }));
const wait = async (f: () => boolean) => {
    for (let i = 0; i < 60_000 && !f(); i++) await sleep(20);
    if (!f()) throw new Error(`capture timed out: ${JSON.stringify(cs.map((c) => [c.user.name, c.view?.game?.phase, c.view?.game?.players.length, c.view?.game?.town.length, c.view?.notice]))} ${JSON.stringify(cs[0].view?.game?.town.slice(-8).map((f) => f.kind))} witch=${JSON.stringify(cs.map(c=>c.view?.game?.prompt))}`);
};

for (const c of cs) await c.activate();
await cs[0].openPanel();
await wait(() => !!cs[0].view);
snap("welcome", cs[0]);
for (const c of cs.slice(1)) await c.openPanel();
await cs[0].fromWebview({ t: "create", hostPlays: true });
await wait(() => !!cs[0].view?.game);
for (const c of cs.slice(1, 6)) {
    await wait(() => !!c.view?.game);
    await c.fromWebview({ t: "join" });
}
await wait(() => cs[0].view!.game!.players.length === 6);
await cs[1].fromWebview({ t: "chat", channel: "town", text: "Evening all. Who brought the cider?" });
await cs[0].fromWebview({ t: "chat", channel: "town", text: "Two more and we deal." });
for (const c of cs.slice(6)) {
    await wait(() => !!c.view?.game);
    await c.fromWebview({ t: "join" });
}
await wait(() => cs[0].view!.game!.players.length === 8 && cs[0].view!.game!.town.length >= 2);
snap("lobby-host", cs[0]);
await wait(() => cs[3].view?.game?.players.length === 8);
snap("lobby-guest", cs[3]);
await cs[0].fromWebview({ t: "config", deck: { werewolf: 2, seer: 1, doctor: 1, witch: 1, hunter: 1, villager: 2 } });
await wait(() => cs[0].view!.game!.deck.witch === 1);
await cs[0].fromWebview({ t: "start" });
await wait(() => cs.every((c) => !!c.view?.game?.myRole));

const role = (r: string) => cs.filter((c) => c.view!.game!.myRole === r);
const [wolfA, wolfB] = role("werewolf");
const seer = role("seer")[0];
const doctor = role("doctor")[0];
const witch = role("witch")[0];
const villager = role("villager")[0];
const prey = role("villager")[1];

await wolfA.fromWebview({ t: "act", body: { type: "kill", target: prey.user.id } });
await wolfA.fromWebview({ t: "chat", channel: "pack", text: `Let's take ${prey.user.name}. They're too sharp.` });
await wolfB.fromWebview({ t: "chat", channel: "pack", text: "Agreed. Quiet tonight." });
await wait(() => (wolfB.view!.game!.pack.length ?? 0) >= 2 && wolfB.view!.game!.players.some((p) => p.packPick));
snap("night-wolf", wolfB);
await seer.fromWebview({ t: "act", body: { type: "inspect", target: wolfA.user.id } });
await wait(() => !!seer.view!.game!.seerLog?.length);
snap("night-seer", seer);
snap("night-villager", villager);
await doctor.fromWebview({ t: "act", body: { type: "protect", target: doctor.user.id } });
await wolfB.fromWebview({ t: "act", body: { type: "kill", target: prey.user.id } });
await wait(() => witch.view!.game!.phase === "witch" && !!witch.view!.game!.prompt);
snap("witch", witch);
await witch.fromWebview({ t: "act", body: { type: "witch", heal: false, poison: null } });
await wait(() => cs[0].view!.game!.phase === "day");
const lines = [
    [seer, `I have something to share about ${wolfA.user.name}…`],
    [wolfA, "Oh come on, I was asleep all night."],
    [doctor, "Let's hear the evidence before we vote."],
    [wolfB, `Sounds like a bluff to me.`],
    [villager, "Poor soul. The wolves won't stop at one."],
] as [FakeClient, string][];
for (const [c, t] of lines) await c.fromWebview({ t: "chat", channel: "town", text: t });
await wait(() => cs[0].view!.game!.town.filter((f) => f.kind === "chat").length >= 7);
await prey.fromWebview({ t: "chat", channel: "town", text: "boo" });
await wait(() => prey.view!.game!.alive === false && villager.view!.game!.town.filter((f) => f.kind === "chat").length >= 7);
snap("day-villager", villager);
const visualsDay = boardVisuals();
const boardsByLang = Object.fromEntries(LANGS.map((l) => [l.id, localizedBoard(l.id)]));
snap("day-dead", prey);
for (const c of cs) {
    const g = c.view!.game!;
    if (g.alive) await c.fromWebview({ t: "act", body: { type: "ready" } });
}
await wait(() => cs[0].view!.game!.phase === "vote");
const vote = (c: FakeClient, target: string): Promise<void> => c.fromWebview({ t: "act", body: { type: "vote", target } as ActionBody });
await vote(seer, wolfA.user.id);
await vote(doctor, wolfA.user.id);
await vote(wolfA, seer.user.id);
await wait(() => Object.keys(cs[0].view!.game!.players.filter((p) => p.votedFor)).length >= 3 && villager.view!.game!.players.filter((p) => p.votedFor).length >= 3);
snap("vote-villager", villager);
for (const c of cs) {
    const g = c.view!.game!;
    if (g.alive && !g.prompt?.chosen) await vote(c, wolfA.user.id);
}
await wait(() => cs[0].view!.game!.phase === "night" || cs[0].view!.game!.phase === "over" || cs[0].view!.game!.phase === "hunter");
// Play out the rest quickly: wolves kill, everyone votes the remaining wolf.
for (let round = 0; round < 400 && cs[0].view!.game!.phase !== "over"; round++) {
    for (const c of cs) {
        const g = c.view?.game;
        const p = g?.prompt;
        if (!g || !p || p.chosen !== undefined) continue;
        const target = p.targets.find((t) => t === wolfB.user.id) ?? p.targets[0];
        const body: ActionBody | null =
            p.kind === "ready" ? { type: "ready" } : p.kind === "witch" ? { type: "witch", heal: false, poison: null } : target ? ({ type: p.kind, target } as ActionBody) : null;
        if (body) await c.fromWebview({ t: "act", body });
    }
    await sleep(40);
}
await wait(() => villager.view!.game!.phase === "over");
snap("over", villager);

/** The host's table and square as they would look with the host's panel in `lang`. */
function localizedBoard(lang: (typeof LANGS)[number]["id"]): Record<string, unknown> {
    const recs = [...board.elements.values()].map((e) => ({ id: e.id, rec: parseRec(e.meta) }));
    const state = recs.find((r) => r.rec?.k === "state")!.rec as { json: string };
    const pub = JSON.parse(state.json) as PublicState;
    const town = recs.filter((r) => r.rec?.k === "msg" && pub.heard.includes(r.id)).map((r) => r.rec as TownMsgRec);
    return {
        table: (renderTable(pub, lang, CARD_BACK, cardArt(lang)).element({ x: 0, y: 0 }) as { schema: unknown }).schema,
        chat: (renderChat(pub, lang, town).element({ x: 0, y: 0 }) as { schema: unknown }).schema,
    };
}

function boardVisuals(): Record<string, unknown> {
    const visuals: Record<string, unknown> = {};
    for (const el of board.elements.values()) {
        const rec = parseRec(el.meta);
        if (rec?.k === "visual") visuals[rec.part] = el.schema;
    }
    return visuals;
}
writeFileSync(
    join(out, "views.json"),
    JSON.stringify({ shots, visuals: { day: visualsDay, over: boardVisuals(), ...Object.fromEntries(Object.entries(boardsByLang).map(([l, v]) => [`day-${l}`, v])) } })
);
console.log("captured", Object.keys(shots).join(", "));
restore();
process.exit(0);
