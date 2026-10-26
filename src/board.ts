import type { DomElementSchema, DrawdyElementSchema } from "@drawdy/driver-protocol";
import { svgDataUrl } from "./art";
import { t, type Lang, type Strings } from "./i18n";
import { deckSize, type Phase, type PublicPlayer, type PublicState } from "./engine";
import type { TownMsgRec } from "./records";
import { ROLE_ORDER, type RoleId } from "./roles";

/** Layout of the shared table, in canvas units relative to the frame. */
export const BOARD = {
    frame: { width: 1360, height: 800, fill: "#0e1022" },
    table: { x: 24, y: 24, width: 980, height: 752 },
    chat: { x: 1024, y: 24, width: 312, height: 752 },
};

type Palette = { bg: string; ink: string; muted: string; accent: string; panel: string; line: string };

const NIGHT: Palette = {
    bg: "linear-gradient(180deg, #0b0d1f 0%, #171a3a 55%, #23163a 100%)",
    ink: "#eef0ff",
    muted: "#9aa0c8",
    accent: "#e8c872",
    panel: "rgba(255,255,255,0.06)",
    line: "rgba(232,200,114,0.35)",
};

const DAY: Palette = {
    bg: "linear-gradient(180deg, #fbefd9 0%, #f3dcb5 60%, #e9c99a 100%)",
    ink: "#2b1d12",
    muted: "#7a5d43",
    accent: "#a2491f",
    panel: "rgba(80,40,10,0.07)",
    line: "rgba(120,60,20,0.35)",
};

export function paletteFor(phase: Phase): Palette {
    return phase === "day" || phase === "vote" || phase === "hunter" || phase === "lobby" || phase === "over" ? DAY : NIGHT;
}

const px = (n: number) => [n, "px"] as [number, "px"];

function text(child: string, size: number, color: string, weight: "normal" | "medium" | "semibold" | "bold" = "normal", align: "start" | "center" | "end" = "start"): DomElementSchema {
    return { type: "text", child, styles: { fontSize: px(size), color, fontWeight: weight, textAlign: align } };
}

function seat(p: PublicPlayer, pub: PublicState, tr: Strings, pal: Palette, back: string, cards: Record<RoleId, string>, cardW: number): DomElementSchema {
    const role = p.revealed;
    const image = role ? cards[role] : back;
    const votes = pub.phase === "vote" ? Object.values(pub.votes).filter((v) => v === p.id).length : 0;
    let status = "";
    if (!p.alive) status = role ? tr.tagDeadRole(tr.roles[role].name) : "†";
    else if (role) status = tr.roles[role].name;
    else if (pub.phase === "vote") status = votes ? tr.votes(votes) : "";
    else if (pub.phase === "day" && pub.ready.includes(p.id)) status = tr.readyToVote;
    else if (pub.phase === "hunter" && pub.hunterId === p.id) status = tr.aiming;
    return {
        type: "column",
        styles: {
            width: px(cardW + 12),
            padding: px(6),
            gap: 6,
            crossAxisAlignment: "center",
            mainAxisAlignment: "start",
            borderRadius: px(14),
            backgroundColor: votes ? "rgba(162,73,31,0.16)" : pal.panel,
        },
        children: [
            {
                type: "image",
                child: svgDataUrl(image),
                styles: { width: px(cardW), height: px(Math.round(cardW * 1.4)), borderRadius: px(10) },
            },
            {
                type: "row",
                styles: { gap: 6, crossAxisAlignment: "center", mainAxisAlignment: "center" },
                children: [
                    { type: "box", styles: { width: px(10), height: px(10), borderRadius: px(5), backgroundColor: p.alive ? p.color : "#777" } },
                    text(p.name, 17, p.alive ? pal.ink : pal.muted, "semibold", "center"),
                ],
            },
            text(status || " ", 14, !p.alive ? pal.muted : votes ? pal.accent : pal.muted, "medium", "center"),
        ],
    };
}

function deckLine(pub: PublicState, tr: Strings): string {
    return ROLE_ORDER.filter((r) => pub.deck[r] > 0)
        .map((r) => tr.roleCount(r, pub.deck[r]))
        .join(" · ");
}

export function renderTable(pub: PublicState, lang: Lang, back: string, cards: Record<RoleId, string>) {
    const tr = t(lang);
    const pal = paletteFor(pub.phase);
    const title = tr.phaseTitle(pub.phase, pub.day, pub.winner);
    const sub = tr.boardSub(pub.phase);
    const n = pub.players.length;
    const columns = n <= 6 ? Math.max(n, 3) : n <= 10 ? 5 : n <= 12 ? 6 : 8;
    const cardW = columns <= 5 ? 128 : columns === 6 ? 112 : 92;
    const alive = pub.players.filter((p) => p.alive).length;
    const sig = JSON.stringify([lang, pub.phase, pub.day, pub.winner, pub.players.map((p) => [p.id, p.name, p.alive, p.revealed]), pub.votes, pub.ready, pub.hunterId, pub.deck]);
    const schema: DomElementSchema = {
        type: "column",
        styles: {
            width: px(BOARD.table.width),
            height: px(BOARD.table.height),
            padding: px(28),
            gap: 20,
            borderRadius: px(24),
            backgroundColor: pal.bg,
            overflow: "hidden",
            crossAxisAlignment: "center",
            mainAxisAlignment: "start",
        },
        children: [
            {
                type: "row",
                styles: { width: [100, "%"], mainAxisAlignment: "between", crossAxisAlignment: "center" },
                children: [
                    {
                        type: "column",
                        styles: { gap: 4 },
                        children: [text(lang === "en" ? tr.appName.toUpperCase() : tr.appName, 16, pal.accent, "bold"), text(title, 38, pal.ink, "bold"), text(sub, 18, pal.muted)],
                    },
                    {
                        type: "column",
                        styles: { gap: 4, crossAxisAlignment: "end" },
                        children:
                            pub.phase === "lobby"
                                ? [text(tr.seatedN(n), 22, pal.ink, "semibold", "end"), text(tr.cardsInDeck(deckSize(pub.deck)), 15, pal.muted, "normal", "end")]
                                : [text(tr.aliveOf(alive, n), 22, pal.ink, "semibold", "end"), text(tr.hostedBy(pub.hostName), 15, pal.muted, "normal", "end")],
                    },
                ],
            },
            { type: "box", styles: { width: [100, "%"], height: px(1), backgroundColor: pal.line } },
            n === 0
                ? text(tr.noSeatsYet, 20, pal.muted, "normal", "center")
                : {
                      type: "grid",
                      styles: { columns, gap: 14 },
                      children: pub.players.map((p) => seat(p, pub, tr, pal, back, cards, cardW)),
                  },
            text(deckLine(pub, tr), 15, pal.muted, "medium", "center"),
        ],
    };
    return {
        sig,
        element: (at: { x: number; y: number }): DrawdyElementSchema => ({
            type: "component",
            drawdyElementId: "",
            x: at.x,
            y: at.y,
            width: BOARD.table.width,
            height: BOARD.table.height,
            schema,
        }),
    };
}

const CHAT_LINES = 16;

export function renderChat(pub: PublicState, lang: Lang, town: TownMsgRec[]) {
    const tr = t(lang);
    const pal = paletteFor(pub.phase);
    const name = (id: string) => pub.players.find((p) => p.id === id)?.name ?? tr.someone;
    const names = new Map(pub.players.map((p) => [p.id, p]));
    const items = [
        ...town.map((m) => ({ ts: m.ts, kind: "chat" as const, m })),
        ...pub.events.map((e) => ({ ts: e.ts, kind: "event" as const, e })),
    ]
        .sort((a, b) => a.ts - b.ts)
        .slice(-CHAT_LINES);
    const lines: DomElementSchema[] = items.map((it) => {
        if (it.kind === "event") {
            return {
                type: "box",
                styles: { padding: px(8), borderRadius: px(10), backgroundColor: pal.panel },
                children: [text(tr.event(it.e, name), 14, it.e.kind === "death" ? pal.accent : pal.muted, "medium")],
            };
        }
        const author = names.get(it.m.p);
        return {
            type: "column",
            styles: { gap: 2 },
            children: [
                text(author?.name ?? tr.narrator(pub.hostName), 13, author?.color ?? pal.accent, "bold"),
                text(it.m.text, 16, pal.ink),
            ],
        };
    });
    const sig = JSON.stringify([lang, pub.phase, items.map((i) => (i.kind === "chat" ? i.m.tag : `${i.e.ts}${i.e.kind}`))]);
    const schema: DomElementSchema = {
        type: "column",
        styles: {
            width: px(BOARD.chat.width),
            height: px(BOARD.chat.height),
            padding: px(20),
            gap: 14,
            borderRadius: px(24),
            backgroundColor: pal.bg,
            overflow: "hidden",
        },
        children: [
            text(tr.squareTitle, 15, pal.accent, "bold"),
            { type: "box", styles: { width: [100, "%"], height: px(1), backgroundColor: pal.line } },
            {
                type: "column",
                styles: { gap: 12, height: px(BOARD.chat.height - 100), overflow: "hidden", mainAxisAlignment: "end" },
                children: lines.length ? lines : [text(tr.nothingSaid, 15, pal.muted)],
            },
        ],
    };
    return {
        sig,
        element: (at: { x: number; y: number }): DrawdyElementSchema => ({
            type: "component",
            drawdyElementId: "",
            x: at.x,
            y: at.y,
            width: BOARD.chat.width,
            height: BOARD.chat.height,
            schema,
        }),
    };
}
