import { CARD_BACK, cardArt, PORTRAIT } from "../src/art";
import type { ActionBody, Pace } from "../src/engine";
import { detectLang, LANGS, t, type Lang, type Strings } from "../src/i18n";
import type { DriverToWebview, FeedItem, GameView, Prompt, View, ViewPlayer, WebviewToDriver } from "../src/protocol";
import { MAX_CHAT_LENGTH } from "../src/records";
import { MAX_PLAYERS, ROLE_ORDER, ROLES, suggestedRoles, type RoleId } from "../src/roles";

declare function acquireDrawdyApi(): {
    postMessage(message: unknown): void;
    onMessage(listener: (message: unknown) => void): () => void;
};

const api = acquireDrawdyApi();
const send = (m: WebviewToDriver) => api.postMessage(m);

let view: View | null = null;
/** Local clock minus the driver's clock, to run the timer without drift. */
let skew = 0;
/** The language picked here wins until the driver confirms it. */
let lang: Lang = detectLang(navigator.language);
let tr: Strings = t(lang);

type Glyph = "moon" | "sun" | "scales" | "bow" | "crown" | "skull";

const ui = {
    tab: "village" as "village" | "chat",
    chatTab: "town" as "town" | "pack",
    hostPlays: true,
    selected: null as string | null,
    selectedFor: "",
    witchHeal: false,
    pending: null as { key: string; target: string | null } | null,
    roleOpen: false,
    langOpen: false,
    overlay: null as null | { title: string; sub: string; glyph: Glyph; until: number },
    lastPhaseKey: "",
    seenTown: new Set<string>(),
    seenPack: new Set<string>(),
    feedSig: "",
};

const cards = () => cardArt(lang);
const roleName = (r: RoleId) => tr.roles[r].name;

// --------------------------------------------------------------------------
// DOM helpers

type Child = Node | string | null | undefined | false;
type Props = {
    class?: string;
    text?: string;
    html?: string;
    on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
    attrs?: Record<string, string | number | boolean | undefined>;
    style?: string;
};

function h(tag: string, props: Props | null = null, ...children: Child[]): HTMLElement {
    const el = document.createElement(tag);
    if (props) {
        if (props.class) el.className = props.class;
        if (props.text !== undefined) el.textContent = props.text;
        if (props.html !== undefined) el.innerHTML = props.html;
        if (props.style) el.setAttribute("style", props.style);
        for (const [k, v] of Object.entries(props.attrs ?? {})) {
            // ARIA states need literal "true"/"false"; plain boolean attributes are present or absent.
            if (k.startsWith("aria-")) {
                if (v !== undefined) el.setAttribute(k, String(v));
                continue;
            }
            if (v === undefined || v === false) continue;
            el.setAttribute(k, v === true ? "" : String(v));
        }
        for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn as EventListener);
    }
    for (const c of children) {
        if (c === null || c === undefined || c === false) continue;
        el.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
}

const ICONS = {
    moon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`,
    scales: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a4 4 0 0 0 6 0L5 7Zm14 0-3 7a4 4 0 0 0 6 0l-3-7Z"/></svg>`,
    bow: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 20 4M14 4h6v6M5 9c3-1 7 3 6 6M9 5c3 0 10 7 10 10"/></svg>`,
    crown: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7Z"/></svg>`,
    skull: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 2.8 1.4 4.6 3 5.6V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.4c1.6-1 3-2.8 3-5.6a8 8 0 0 0-8-8Zm-3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/></svg>`,
    send: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9-.1 6.5Z"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
    village: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 21V11l5-4 5 4v10M13 21v-7l4-3 4 3v7M2 21h20M7 21v-4h2v4"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>`,
    board: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/></svg>`,
    globe: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>`,
};

function icon(name: keyof typeof ICONS): HTMLElement {
    return h("span", { html: ICONS[name], attrs: { "aria-hidden": "true" }, style: "display:inline-grid" });
}

// --------------------------------------------------------------------------
// Messages

api.onMessage((raw) => {
    const m = raw as DriverToWebview;
    if (m?.t !== "view") return;
    skew = Date.now() - m.view.now;
    const prev = view;
    view = m.view;
    setLang(m.view.lang);
    onViewChange(prev, view);
    render();
});
send({ t: "ready", lang });

function setLang(next: Lang) {
    lang = next;
    tr = t(next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : next;
    ui.feedSig = "";
}

function chooseLang(next: Lang) {
    setLang(next);
    ui.langOpen = false;
    send({ t: "lang", lang: next });
    render();
}

function onViewChange(prev: View | null, next: View) {
    const g = next.game;
    if (!g) {
        ui.lastPhaseKey = "";
        return;
    }
    const key = `${g.gameId}:${g.seq}:${g.phase}`;
    if (key === ui.lastPhaseKey) return;
    const firstLoad = ui.lastPhaseKey === "";
    const prevPhase = prev?.game?.gameId === g.gameId ? prev.game.phase : null;
    ui.lastPhaseKey = key;
    ui.selected = null;
    ui.witchHeal = false;
    ui.pending = null;
    if (g.canPack && g.phase === "night") ui.chatTab = "pack";
    if (!g.canPack) ui.chatTab = "town";
    if (firstLoad) return;
    if (prevPhase === "lobby" && g.phase === "night" && g.myRole) {
        ui.roleOpen = true;
        return;
    }
    const copy = tr.transition(g.phase, g.day, g.winner, !!g.myRole && ROLES[g.myRole].night && g.alive);
    if (!copy) return;
    const glyphs: Partial<Record<GameView["phase"], Glyph>> = { night: "moon", day: "sun", vote: "scales", hunter: "bow", over: g.winner === "wolves" ? "skull" : "crown" };
    const glyph = glyphs[g.phase] ?? "moon";
    ui.overlay = { ...copy, glyph, until: Date.now() + 2200 };
    setTimeout(() => {
        if (ui.overlay && Date.now() >= ui.overlay.until) {
            ui.overlay = null;
            render();
        }
    }, 2300);
}

// --------------------------------------------------------------------------
// Rendering

const root = document.getElementById("app")!;
const shell = {
    top: h("header", { class: "top" }),
    body: h("div", { class: "body", attrs: { "data-tab": ui.tab } }),
    mainWrap: h("div", { class: "pane main-wrap" }),
    main: h("div", { class: "main" }),
    chat: h("section", { class: "chat" }),
    chatTabs: h("div", { class: "chat-tabs", attrs: { role: "tablist" } }),
    feed: h("div", { class: "feed", attrs: { "aria-live": "polite" } }),
    composer: h("div", { class: "composer" }),
    tabs: h("nav", { class: "tabs", attrs: { role: "tablist" } }),
    overlay: h("div"),
    input: h("input", { attrs: { type: "text", maxlength: MAX_CHAT_LENGTH, enterkeyhint: "send" } }) as HTMLInputElement,
    sendButton: h("button", { class: "send", html: ICONS.send, attrs: { type: "submit" } }),
    counter: h("div", { class: "counter" }),
};

shell.mainWrap.append(shell.main);
shell.chat.append(shell.chatTabs, shell.feed, shell.composer);
shell.body.append(shell.mainWrap, shell.chat);
root.append(h("div", { class: "app" }, shell.top, shell.body, shell.tabs), shell.overlay);

const form = h(
    "form",
    {
        on: {
            submit: (e) => {
                e.preventDefault();
                const text = shell.input.value.trim();
                if (!text) return;
                send({ t: "chat", channel: ui.chatTab, text });
                shell.input.value = "";
                updateCounter();
            },
        },
    },
    shell.input,
    shell.sendButton
);
shell.input.addEventListener("input", updateCounter);

function updateCounter() {
    const left = MAX_CHAT_LENGTH - shell.input.value.length;
    shell.counter.textContent = left <= 40 ? tr.charsLeft(left) : "";
}

function render() {
    const g = view?.game ?? null;
    document.body.className = themeFor(g);
    document.title = tr.appName;
    shell.chat.setAttribute("aria-label", tr.tabChat);
    shell.input.setAttribute("aria-label", tr.message);
    shell.sendButton.setAttribute("aria-label", tr.send);
    renderTop(g);
    renderMain(g);
    renderChat(g);
    renderTabs(g);
    renderOverlay(g);
}

function themeFor(g: GameView | null): string {
    if (!g) return "theme-night";
    switch (g.phase) {
        case "lobby":
            return "theme-dusk";
        case "day":
        case "vote":
        case "hunter":
            return "theme-day";
        case "over":
            return g.winner === "wolves" ? "theme-blood" : "theme-day";
        default:
            return "theme-night";
    }
}

const PHASE_ICON: Record<GameView["phase"], keyof typeof ICONS> = {
    lobby: "village",
    night: "moon",
    witch: "moon",
    day: "sun",
    vote: "scales",
    hunter: "bow",
    over: "crown",
};

function langButton(): HTMLElement {
    const current = LANGS.find((l) => l.id === lang)!;
    return h(
        "button",
        { class: "lang-chip", attrs: { "aria-label": tr.language, "aria-haspopup": "dialog" }, on: { click: () => ((ui.langOpen = true), render()) } },
        icon("globe"),
        h("span", { text: current.short })
    );
}

function renderTop(g: GameView | null) {
    const top = shell.top;
    top.replaceChildren();
    if (!g) {
        top.append(
            h("div", { class: "phase-icon", html: ICONS.moon }),
            h("div", { class: "titles" }, h("h1", { text: tr.appName }), h("div", { class: "sub", text: tr.tagline })),
            langButton()
        );
        return;
    }
    const iconName = g.phase === "over" && g.winner === "wolves" ? "skull" : PHASE_ICON[g.phase];
    top.append(
        h("div", { class: "phase-icon", html: ICONS[iconName] }),
        h(
            "div",
            { class: "titles" },
            h("h1", { text: tr.phaseTitle(g.phase, g.day, g.winner) }),
            h("div", { class: "sub", text: tr.phaseSub(g.phase, g.players.length, g.hostName) })
        )
    );
    if (g.deadline) top.append(timerEl(g));
    if (g.myRole) {
        top.append(
            h(
                "button",
                { class: "role-chip", attrs: { "aria-label": tr.yourRole(roleName(g.myRole)) }, on: { click: () => ((ui.roleOpen = true), render()) } },
                h("span", { class: "face", html: PORTRAIT[g.myRole] }),
                h("span", { class: "role-name", text: roleName(g.myRole) })
            )
        );
    }
    top.append(langButton());
}

const R = 19;
const CIRC = 2 * Math.PI * R;

function timerEl(g: GameView): HTMLElement {
    const el = h("div", { class: "timer", attrs: { role: "timer", "data-deadline": g.deadline!, "data-total": phaseTotal(g) } }, h("span"));
    el.insertAdjacentHTML(
        "afterbegin",
        `<svg viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="${R}" fill="none" stroke-width="3"/><circle class="bar" cx="22" cy="22" r="${R}" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="${CIRC}"/></svg>`
    );
    tickTimer(el);
    return el;
}

function phaseTotal(g: GameView): number {
    const base = { night: 60, witch: 30, hunter: 30, day: 150, vote: 45 } as Record<string, number>;
    const pace = { quick: 0.6, standard: 1, relaxed: 1.6 }[g.pace];
    return Math.round((base[g.phase] ?? 60) * pace) * 1000;
}

function tickTimer(el: HTMLElement) {
    const deadline = Number(el.dataset.deadline);
    const total = Number(el.dataset.total);
    const left = Math.max(0, deadline - (Date.now() - skew));
    const secs = Math.ceil(left / 1000);
    el.querySelector("span")!.textContent = secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : `${secs}`;
    const bar = el.querySelector(".bar") as SVGCircleElement | null;
    if (bar) bar.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, left / total)));
    el.classList.toggle("urgent", left < 10_000);
    el.setAttribute("aria-label", `${secs}s`);
}

setInterval(() => {
    const el = shell.top.querySelector<HTMLElement>(".timer");
    if (el) tickTimer(el);
}, 250);

// --------------------------------------------------------------------------
// Main pane

function renderMain(g: GameView | null) {
    const scroll = shell.mainWrap.scrollTop;
    const main = shell.main;
    main.replaceChildren();
    if (view?.notice) main.append(h("div", { class: "notice", attrs: { role: "alert" }, text: tr.notice(view.notice) }));
    if (!view) {
        main.append(h("div", { class: "sleep" }, h("p", { text: tr.loading })));
    } else if (!g) {
        main.append(...welcome());
    } else if (g.phase === "lobby") {
        main.append(...lobby(g));
    } else if (g.phase === "over") {
        main.append(...gameOver(g));
    } else {
        main.append(...playing(g));
    }
    shell.mainWrap.scrollTop = scroll;
}

function langPicker(): HTMLElement {
    return h(
        "div",
        { class: "segmented lang-picker", attrs: { role: "group", "aria-label": tr.language } },
        ...LANGS.map((l) => h("button", { text: l.label, attrs: { "aria-pressed": l.id === lang, lang: l.id }, on: { click: () => chooseLang(l.id) } }))
    );
}

function welcome(): HTMLElement[] {
    const fan = h("div", { class: "fan", attrs: { "aria-hidden": "true" } });
    const roles: RoleId[] = ["seer", "werewolf", "witch"];
    roles.forEach((r, i) => fan.append(h("div", { class: "mini-card", html: cards()[r], style: `transform: rotate(${(i - 1) * 12}deg) translateY(${i === 1 ? -8 : 0}px)` })));
    return [
        h("div", { class: "hero" }, fan, h("h2", { text: lang === "en" ? tr.appName.toUpperCase() : tr.appName }), h("p", { text: tr.heroText })),
        langPicker(),
        h(
            "div",
            { class: "card" },
            toggle(!ui.hostPlays, tr.narrateTitle, tr.narrateDetail, () => ((ui.hostPlays = !ui.hostPlays), render())),
            h("div", { style: "height:12px" }),
            h("button", { class: "btn primary block", text: tr.gather, attrs: { disabled: view?.busy }, on: { click: () => send({ t: "create", hostPlays: ui.hostPlays }) } })
        ),
        rules(),
    ];
}

function toggle(on: boolean, title: string, detail: string, flip: () => void): HTMLElement {
    return h(
        "div",
        {
            class: "toggle",
            attrs: { role: "switch", tabindex: 0, "aria-checked": on },
            on: {
                click: flip,
                keydown: (e) => {
                    const k = (e as KeyboardEvent).key;
                    if (k === " " || k === "Enter") {
                        e.preventDefault();
                        flip();
                    }
                },
            },
        },
        h("span", { class: "switch" }),
        h("span", { class: "label" }, h("strong", { text: title }), h("span", { text: detail }))
    );
}

function rules(): HTMLElement {
    return h("details", { class: "card rules" }, h("summary", { text: tr.howToPlay }), h("ol", null, ...tr.rules.map((x) => h("li", { text: x }))));
}

function avatar(p: Pick<ViewPlayer, "name" | "color" | "role">, small = false, showRole = true): HTMLElement {
    if (showRole && p.role) {
        return h("div", { class: `avatar${small ? " small" : ""}`, html: PORTRAIT[p.role], style: `background:${p.color}` });
    }
    const initials = [...p.name.trim()].slice(0, 1).join("").toUpperCase() + (p.name.split(/\s+/)[1]?.[0] ?? "").toUpperCase();
    return h("div", { class: `avatar${small ? " small" : ""}`, text: initials || "?", style: `background:${p.color}` });
}

function lobby(g: GameView): HTMLElement[] {
    const out: HTMLElement[] = [];
    const seatList = h("div", { class: "grid" });
    for (const p of g.players) {
        seatList.append(
            h(
                "div",
                { class: "tile" },
                p.isHost ? h("span", { class: "corner", html: ICONS.crown, style: "color:var(--accent)" }) : null,
                avatar(p, false, false),
                h("div", { class: "name", text: p.isMe ? tr.you(p.name) : p.name }),
                h("div", { class: "tag", text: p.online ? "" : tr.away })
            )
        );
    }
    if (g.players.length === 0) seatList.append(h("p", { class: "muted", text: tr.noSeats }));

    const seatCard = h(
        "div",
        { class: "card" },
        h("h3", { class: "section-title" }, tr.atTable, h("span", { class: "count", text: `${g.players.length} / ${MAX_PLAYERS}` })),
        seatList
    );
    if (!g.isHost || g.hostPlays) {
        seatCard.append(
            h("div", { style: "height:14px" }),
            g.seated
                ? h("button", { class: "btn block", text: tr.leave, attrs: { disabled: view?.busy }, on: { click: () => send({ t: "leave" }) } })
                : h("button", { class: "btn primary block", text: tr.takeSeat, attrs: { disabled: view?.busy || g.players.length >= MAX_PLAYERS }, on: { click: () => send({ t: "join" }) } })
        );
    }
    out.push(seatCard);

    if (g.isHost) {
        out.push(deckEditor(g));
        out.push(
            h(
                "div",
                { class: "card" },
                h("h3", { class: "section-title", text: tr.pace }),
                segmented<Pace>(
                    (["quick", "standard", "relaxed"] as Pace[]).map((p) => [p, tr.paces[p]]),
                    g.pace,
                    (pace) => send({ t: "config", pace })
                ),
                h("div", { style: "height:12px" }),
                toggle(!g.hostPlays, tr.narrateTitle, tr.narrateDetail, () => send({ t: "config", hostPlays: !g.hostPlays })),
                h("div", { style: "height:12px" }),
                g.deckProblem ? h("p", { class: "problem", text: tr.problem(g.deckProblem) }) : null,
                h("button", { class: "btn primary block", text: tr.deal, attrs: { disabled: !!g.deckProblem || view?.busy }, on: { click: () => send({ t: "start" }) } })
            )
        );
    } else {
        out.push(deckPreview(g));
        out.push(h("p", { class: "muted", style: "text-align:center;margin:0", text: tr.waitingDeal(g.hostName) }));
    }
    out.push(rules());
    return out;
}

function segmented<T extends string>(options: [T, string][], value: T, pick: (v: T) => void): HTMLElement {
    return h(
        "div",
        { class: "segmented", attrs: { role: "group" } },
        ...options.map(([v, label]) => h("button", { text: label, attrs: { "aria-pressed": v === value }, on: { click: () => pick(v) } }))
    );
}

function deckRow(role: RoleId, end: HTMLElement): HTMLElement {
    return h(
        "div",
        { class: "deck-row" },
        h("div", { class: "face", html: PORTRAIT[role] }),
        h("div", { class: "name" }, roleName(role), h("small", { text: tr.roles[role].blurb })),
        end
    );
}

function deckEditor(g: GameView): HTMLElement {
    const deck = { ...g.deck };
    const set = (role: RoleId, n: number) => send({ t: "config", deck: { ...deck, [role]: Math.max(0, n) } });
    const total = Object.values(deck).reduce((a, b) => a + b, 0);
    return h(
        "div",
        { class: "card" },
        h("h3", { class: "section-title" }, tr.deck, h("span", { class: "count", text: tr.deckCount(total, g.players.length) })),
        h(
            "div",
            { class: "deck" },
            ...ROLE_ORDER.map((role) =>
                deckRow(
                    role,
                    h(
                        "div",
                        { class: "stepper" },
                        h("button", { text: "−", attrs: { "aria-label": tr.fewer(roleName(role)), disabled: deck[role] === 0 }, on: { click: () => set(role, deck[role] - 1) } }),
                        h("output", { text: String(deck[role]) }),
                        h("button", { text: "+", attrs: { "aria-label": tr.more(roleName(role)) }, on: { click: () => set(role, deck[role] + 1) } })
                    )
                )
            )
        ),
        h("div", { style: "height:10px" }),
        h("button", {
            class: "btn small",
            text: tr.suggested(Math.max(g.players.length, 4)),
            on: { click: () => send({ t: "config", deck: suggestedRoles(Math.max(g.players.length, 4)), suggested: true }) },
        })
    );
}

function deckPreview(g: GameView): HTMLElement {
    return h(
        "div",
        { class: "card" },
        h("h3", { class: "section-title", text: tr.deck }),
        h("div", { class: "deck" }, ...ROLE_ORDER.filter((r) => g.deck[r] > 0).map((role) => deckRow(role, h("output", { class: "display", text: `×${g.deck[role]}` }))))
    );
}

function playerName(g: GameView, id: string | null | undefined): string {
    if (id && id === view?.me.id) return view.me.name;
    return g.players.find((p) => p.id === id)?.name ?? (id ? tr.someone : tr.nobody);
}

function eventText(g: GameView, e: Extract<FeedItem, { kind: "event" }>): string {
    return tr.event(e.event, (id) => playerName(g, id));
}

/** CSS tone for an event line. */
function eventTone(e: Extract<FeedItem, { kind: "event" }>): string {
    const k = e.event.kind;
    return k === "phase" || k === "death" || k === "saved" || k === "win" ? k : "info";
}

function playing(g: GameView): HTMLElement[] {
    const out: HTMLElement[] = [];
    if (!g.hostOnline) out.push(h("div", { class: "notice info", text: tr.hostAway(g.hostName) }));

    const events = g.town.filter((f): f is Extract<FeedItem, { kind: "event" }> => f.kind === "event" && f.event.kind !== "phase");
    const news = events.filter((e) => e.event.seq === g.seq);
    const recent = news.length ? news : events.slice(-1);
    if (recent.length && g.phase !== "night") {
        out.push(h("div", { class: "news" }, ...recent.map((e) => h("div", { class: `item ${eventTone(e)}`, text: eventText(g, e) }))));
    }

    if (g.prompt) out.push(promptCard(g, g.prompt));
    else if (g.seated && !g.alive) out.push(deadCard());
    else if (g.seated && (g.phase === "night" || g.phase === "witch")) out.push(sleepCard(g));
    else if (!g.seated && !(g.isHost && !g.hostPlays)) out.push(h("div", { class: "notice info", text: tr.watching }));

    if (g.seerLog?.length) out.push(seerCard(g));
    out.push(playerGrid(g));
    if (g.isHost) out.push(hostBar(g));
    return out;
}

function selectionKey(g: GameView, p: Prompt): string {
    return `${g.seq}:${p.kind}`;
}

function currentSelection(g: GameView, p: Prompt): string | null {
    return ui.selectedFor === selectionKey(g, p) ? ui.selected : null;
}

function promptCopy(p: Prompt): [string, string] {
    if (p.kind === "protect" && p.doctorRepeat) return [tr.prompt.protect[0], tr.prompt.protectRepeat];
    return tr.prompt[p.kind];
}

function promptCard(g: GameView, p: Prompt): HTMLElement {
    const wolfish = p.kind === "kill";
    const [title, hint] = promptCopy(p);
    const card = h("div", { class: `prompt${wolfish ? " wolf" : ""}` }, h("h3", { text: title }), h("p", { text: hint }));
    const key = selectionKey(g, p);
    const pending = ui.pending?.key === key ? ui.pending : null;
    const chosen = p.chosen;
    const sel = currentSelection(g, p);

    if (p.kind === "ready") {
        const ready = g.players.filter((x) => x.ready).length;
        const alive = g.players.filter((x) => x.alive).length;
        card.append(
            h(
                "div",
                { class: "actions" },
                chosen
                    ? h("div", { class: "status" }, h("span", { class: "check", text: "✓" }), tr.readyStatus(ready, alive))
                    : h("button", { class: "btn primary", text: pending ? tr.waiting : tr.readyButton(ready, alive), attrs: { disabled: !!pending }, on: { click: () => submit(key, { type: "ready" }, null) } })
            )
        );
        return card;
    }

    if (p.kind === "witch" && p.witch) return witchCard(g, p, card, key, pending);

    const kind = p.kind as "kill" | "inspect" | "protect" | "vote" | "shoot";
    const locked = p.final && chosen !== undefined;
    if (chosen !== undefined && chosen !== null) {
        card.append(
            h(
                "div",
                { class: "status" },
                h("span", { class: "check", text: "✓" }),
                chosen === "skip" ? (kind === "shoot" ? tr.heldFire : tr.skipped) : tr.act(kind, playerName(g, chosen)),
                !locked ? h("span", { class: "muted", style: "font-weight:500", text: tr.tapToChange }) : null
            )
        );
    }
    if (locked) return card;

    const actions = h("div", { class: "actions" });
    if (sel && sel !== chosen) {
        actions.append(
            h("button", {
                class: `btn ${wolfish ? "wolf" : "primary"}`,
                text: pending ? tr.sending : tr.act(kind, playerName(g, sel)),
                attrs: { disabled: !!pending },
                on: { click: () => submit(key, bodyFor(kind, sel), sel) },
            })
        );
    } else if (chosen === undefined) {
        actions.append(h("div", { class: "muted", style: "font-size:13.5px;align-self:center", text: tr.tapPlayer }));
    }
    if (p.allowSkip && chosen !== "skip") {
        actions.append(
            h("button", {
                class: "btn",
                text: kind === "shoot" ? tr.holdFire : tr.skip,
                attrs: { disabled: !!pending },
                on: { click: () => submit(key, bodyFor(kind, "skip"), "skip") },
            })
        );
    }
    card.append(actions);
    return card;
}

function bodyFor(kind: "kill" | "inspect" | "protect" | "vote" | "shoot", target: string): ActionBody {
    switch (kind) {
        case "kill":
            return { type: "kill", target };
        case "inspect":
            return { type: "inspect", target };
        case "protect":
            return { type: "protect", target };
        case "vote":
            return { type: "vote", target };
        case "shoot":
            return { type: "shoot", target: target === "skip" ? null : target };
    }
}

function submit(key: string, body: ActionBody, target: string | null) {
    ui.pending = { key, target };
    send({ t: "act", body });
    render();
    setTimeout(() => {
        if (ui.pending?.key === key) {
            ui.pending = null;
            render();
        }
    }, 6000);
}

const VIAL = (color: string) =>
    `<svg class="vial" viewBox="0 0 34 34"><path d="M13 3h8v3h-1v6.5l6.8 11.6A5 5 0 0 1 22.5 31h-11a5 5 0 0 1-4.3-6.9L14 12.5V6h-1V3Z" fill="${color}" fill-opacity=".85"/><path d="M8.6 22h16.8" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/></svg>`;

function witchCard(g: GameView, p: Prompt, card: HTMLElement, key: string, pending: { target: string | null } | null): HTMLElement {
    const w = p.witch!;
    if (p.chosen !== undefined) {
        card.append(h("div", { class: "status" }, h("span", { class: "check", text: "✓" }), tr.witch.done));
        return card;
    }
    const poisonTarget = currentSelection(g, p);
    const box = h("div", { class: "witch-box" }, h("p", { style: "font-weight:600;color:var(--ink)", text: w.victim ? tr.witch.victim(playerName(g, w.victim)) : tr.witch.noVictim }));
    if (w.victim && w.heal) {
        box.append(
            h(
                "button",
                { class: "potion", attrs: { "aria-pressed": ui.witchHeal }, on: { click: () => ((ui.witchHeal = !ui.witchHeal), render()) } },
                h("span", { html: VIAL("#e2565b") }),
                h("span", null, h("strong", { text: ui.witchHeal ? tr.witch.saving(playerName(g, w.victim)) : tr.witch.heal }), h("span", { text: tr.witch.healHint }))
            )
        );
    } else if (!w.heal) {
        box.append(h("p", { class: "muted", style: "font-size:13px", text: tr.witch.healSpent }));
    }
    if (w.poison) {
        box.append(
            h(
                "div",
                { class: "potion", attrs: { "aria-pressed": !!poisonTarget } },
                h("span", { html: VIAL("#59d36b") }),
                h(
                    "span",
                    null,
                    h("strong", { text: poisonTarget ? tr.witch.poisoning(playerName(g, poisonTarget)) : tr.witch.poison }),
                    h("span", { text: poisonTarget ? tr.witch.poisonCancel : tr.witch.poisonPick })
                )
            )
        );
    } else {
        box.append(h("p", { class: "muted", style: "font-size:13px", text: tr.witch.poisonSpent }));
    }
    card.append(box);
    const doing = ui.witchHeal || !!poisonTarget;
    card.append(
        h(
            "div",
            { class: "actions" },
            h("button", {
                class: "btn primary",
                text: pending ? tr.witch.brewing : doing ? tr.witch.brew : tr.witch.nothing,
                attrs: { disabled: !!pending },
                on: { click: () => submit(key, { type: "witch", heal: ui.witchHeal, poison: poisonTarget }, "skip") },
            })
        )
    );
    return card;
}

function sleepCard(g: GameView): HTMLElement {
    const line = g.myRole === "werewolf" ? tr.sleepWolf : g.myRole === "witch" && g.phase === "night" ? tr.sleepWitch : tr.sleepOther;
    return h(
        "div",
        { class: "card sleep" },
        h("div", { class: "sleep-icon", html: ICONS.moon }),
        h("div", { class: "zz", text: tr.asleep }),
        h("p", { text: line })
    );
}

function deadCard(): HTMLElement {
    return h("div", { class: "card sleep" }, h("div", { html: ICONS.skull, style: "color:var(--ink-3)" }), h("div", { class: "zz", text: tr.died }), h("p", { text: tr.diedText }));
}

function seerCard(g: GameView): HTMLElement {
    return h(
        "div",
        { class: "card" },
        h("h3", { class: "section-title", text: tr.visions }),
        h(
            "div",
            { class: "readings" },
            ...g.seerLog!.map((r) =>
                h(
                    "div",
                    { class: "reading" },
                    h("span", { class: `pip ${r.isWolf ? "wolf" : "good"}`, text: r.isWolf ? tr.pipWolf : tr.pipSafe }),
                    h("span", { text: tr.reading(r.day, playerName(g, r.target), r.isWolf) })
                )
            )
        )
    );
}

function playerGrid(g: GameView): HTMLElement {
    const p = g.prompt;
    const selectable = p && p.kind !== "ready" && !(p.final && p.chosen !== undefined) ? new Set(p.targets) : null;
    const key = p ? selectionKey(g, p) : "";
    const sel = p ? currentSelection(g, p) : null;
    const pending = ui.pending?.key === key ? ui.pending.target : null;
    const alive = g.players.filter((x) => x.alive).length;
    const grid = h("div", { class: "grid" });
    const seen = new Map((g.seerLog ?? []).map((r) => [r.target, r.isWolf]));

    for (const pl of g.players) {
        const canPick = !!selectable?.has(pl.id);
        const chosen = p?.chosen === pl.id;
        const classes = ["tile"];
        if (!pl.alive) classes.push("dead");
        if (canPick) classes.push("selectable");
        if (p?.kind === "kill") classes.push("wolfish");
        if (sel === pl.id || pending === pl.id || (chosen && !sel)) classes.push("selected");
        if (selectable && !canPick && pl.alive && !pl.isMe) classes.push("dim");

        const tag = tileTag(g, pl, seen.get(pl.id));
        const packers = g.players.filter((w) => w.packPick === pl.id).map((w) => w.name);
        grid.append(
            h(
                canPick ? "button" : "div",
                {
                    class: classes.join(" "),
                    attrs: canPick ? { "aria-pressed": sel === pl.id, "aria-label": pl.alive ? pl.name : `${pl.name} ${tr.tagDead}` } : undefined,
                    on: canPick
                        ? {
                              click: () => {
                                  ui.selectedFor = key;
                                  ui.selected = ui.selected === pl.id && p?.kind === "witch" ? null : pl.id;
                                  render();
                              },
                          }
                        : undefined,
                },
                pl.votes ? h("span", { class: "corner pip", text: String(pl.votes), attrs: { title: tr.votes(pl.votes) } }) : null,
                packers.length ? h("span", { class: "corner pip wolf", text: String(packers.length), attrs: { title: packers.join(", ") } }) : null,
                pl.isHost
                    ? h("span", { class: "corner-left", html: ICONS.crown, style: "color:var(--accent);transform:scale(.75)" })
                    : !pl.online && pl.alive
                      ? h("span", { class: "corner-left offline-dot", attrs: { title: tr.away } })
                      : null,
                avatar(pl),
                h("div", { class: "name", text: pl.isMe ? tr.you(pl.name) : pl.name }),
                h("div", { class: `tag ${tag.tone}`, text: tag.text })
            )
        );
    }
    return h("div", { class: "card" }, h("h3", { class: "section-title" }, tr.village, h("span", { class: "count", text: tr.aliveOf(alive, g.players.length) })), grid);
}

function tileTag(g: GameView, p: ViewPlayer, seerSaw: boolean | undefined): { text: string; tone: string } {
    if (!p.alive) return { text: p.role ? tr.tagDeadRole(roleName(p.role)) : tr.tagDead, tone: "" };
    if (g.phase === "vote" && p.votedFor) return { text: p.votedFor === "skip" ? tr.tagVotedSkip : `→ ${playerName(g, p.votedFor)}`, tone: "" };
    if (g.phase === "day" && p.ready) return { text: tr.tagReady, tone: "good" };
    if (p.packPick) return { text: `→ ${playerName(g, p.packPick)}`, tone: "wolf" };
    if (p.role && p.roleSource !== "self") return { text: roleName(p.role), tone: ROLES[p.role].team === "wolves" ? "wolf" : "accent" };
    if (seerSaw !== undefined) return { text: seerSaw ? tr.tagSeerWolf : tr.tagSeerSafe, tone: seerSaw ? "wolf" : "good" };
    if (p.isMe && p.role) return { text: roleName(p.role), tone: "accent" };
    return { text: "", tone: "" };
}

function hostBar(g: GameView): HTMLElement {
    return h(
        "div",
        { class: "host-bar" },
        h("span", { text: g.hostPlays ? tr.hosting : tr.narrating }),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", text: tr.skipTimer, on: { click: () => send({ t: "advance" }) } }),
        h("button", {
            class: "btn small danger",
            text: tr.endGame,
            on: {
                click: (e) => {
                    const b = e.currentTarget as HTMLButtonElement;
                    if (b.dataset.armed) send({ t: "end" });
                    else {
                        b.dataset.armed = "1";
                        b.textContent = tr.tapAgain;
                    }
                },
            },
        })
    );
}

function gameOver(g: GameView): HTMLElement[] {
    const winners = g.winner;
    const grid = h("div", { class: "reveal-grid" });
    for (const p of g.players) {
        const won = winners && p.role && ROLES[p.role].team === winners;
        grid.append(
            h(
                "div",
                { class: `reveal${p.alive ? "" : " dead"}${won ? " winner" : ""}` },
                h("div", { class: "art", html: p.role ? cards()[p.role] : CARD_BACK }),
                h("div", { class: "who", text: p.isMe ? tr.you(p.name) : p.name }),
                h("div", { class: "what", text: `${p.role ? roleName(p.role) : "?"}${p.alive ? "" : tr.diedSuffix}` })
            )
        );
    }
    const verdict = tr.verdict(winners, g.myRole ? ROLES[g.myRole].team : null);
    return [
        h(
            "div",
            { class: "banner" },
            h("div", { html: winners === "wolves" ? ICONS.skull : ICONS.crown, style: "color:var(--accent);display:grid;place-items:center" }),
            h("h2", { text: tr.overTitle(winners) }),
            verdict ? h("p", { class: "muted", style: "margin:0", text: verdict }) : null
        ),
        h("div", { class: "card" }, h("h3", { class: "section-title", text: tr.everyCard }), grid),
        h(
            "div",
            { class: "row" },
            h("button", { class: "btn primary", style: "flex:1", text: tr.playAgain, attrs: { disabled: view?.busy }, on: { click: () => send({ t: "create", hostPlays: ui.hostPlays }) } }),
            h("button", { class: "btn", on: { click: () => send({ t: "focus-board" }) } }, icon("board"), h("span", { text: tr.showTable }))
        ),
    ];
}

// --------------------------------------------------------------------------
// Chat

function renderChat(g: GameView | null) {
    const packMode = ui.chatTab === "pack" && !!g?.isPackMember;
    shell.chat.classList.toggle("pack-mode", packMode);
    shell.chatTabs.replaceChildren();
    if (g?.isPackMember) {
        const unread = unreadCount(g, "pack");
        shell.chatTabs.append(
            h("button", { text: tr.square, attrs: { role: "tab", "aria-selected": !packMode }, on: { click: () => ((ui.chatTab = "town"), render()) } }),
            h(
                "button",
                { class: "pack", attrs: { role: "tab", "aria-selected": packMode }, on: { click: () => ((ui.chatTab = "pack"), render()) } },
                tr.pack,
                unread && !packMode ? h("span", { class: "badge", text: String(unread) }) : null
            )
        );
    } else {
        shell.chatTabs.append(h("div", { class: "section-title", style: "margin:4px 4px 0", text: tr.square }));
    }

    const items = !g ? [] : packMode ? g.pack : g.town;
    const sig = `${lang}|${packMode}|${items.length}|${items.at(-1)?.id ?? ""}|${view?.me.id}`;
    if (sig !== ui.feedSig) {
        ui.feedSig = sig;
        const feed = shell.feed;
        const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        feed.replaceChildren();
        if (!items.length) feed.append(h("div", { class: "empty", text: !g ? tr.emptyNoGame : packMode ? tr.emptyPack : tr.emptyTown }));
        let prevFrom = "";
        for (const it of items) {
            if (it.kind === "event") {
                feed.append(h("div", { class: `event-line ${eventTone(it)}`, text: eventText(g!, it) }));
                prevFrom = "";
                continue;
            }
            const cont = prevFrom === it.from;
            prevFrom = it.from;
            const name = it.narrator ? tr.narrator(it.name) : it.name;
            feed.append(
                h(
                    "div",
                    { class: `msg${it.mine ? " mine" : ""}${cont ? " cont" : ""}` },
                    it.mine ? null : avatar({ name: it.name, color: it.color }, true, false),
                    h("div", { class: "bubble" }, h("span", { class: "who", text: name, style: `color:${it.color}` }), it.text)
                )
            );
        }
        const last = items.at(-1);
        if (atBottom || (last?.kind === "chat" && last.mine)) feed.scrollTop = feed.scrollHeight;
    }
    if (g && (ui.tab === "chat" || window.innerWidth >= 760)) markSeen(g, packMode ? "pack" : "town");

    const can = !!g && (packMode ? g.canPack : g.canTown);
    shell.composer.replaceChildren();
    if (can) {
        shell.input.placeholder = packMode ? tr.placeholderPack : tr.placeholderTown;
        shell.composer.append(form, shell.counter);
    } else {
        const reason = !g ? "" : packMode ? tr.packOnlyNight : g.townClosed ? tr.townClosed[g.townClosed] : "";
        if (reason) shell.composer.append(h("div", { class: "closed" }, icon("lock"), h("span", { text: reason })));
    }
}

function markSeen(g: GameView, channel: "town" | "pack") {
    const set = channel === "town" ? ui.seenTown : ui.seenPack;
    for (const it of channel === "town" ? g.town : g.pack) set.add(it.id);
}

function unreadCount(g: GameView, channel: "town" | "pack"): number {
    const set = channel === "town" ? ui.seenTown : ui.seenPack;
    return (channel === "town" ? g.town : g.pack).filter((it) => it.kind === "chat" && !it.mine && !set.has(it.id)).length;
}

function renderTabs(g: GameView | null) {
    shell.body.dataset.tab = ui.tab;
    const unread = g ? unreadCount(g, "town") + (g.isPackMember ? unreadCount(g, "pack") : 0) : 0;
    shell.tabs.replaceChildren(
        h("button", { attrs: { role: "tab", "aria-selected": ui.tab === "village" }, on: { click: () => ((ui.tab = "village"), render()) } }, icon("village"), tr.tabVillage),
        h(
            "button",
            { attrs: { role: "tab", "aria-selected": ui.tab === "chat" }, on: { click: () => ((ui.tab = "chat"), render(), shell.feed.scrollTo({ top: shell.feed.scrollHeight })) } },
            icon("chat"),
            tr.tabChat,
            unread && ui.tab !== "chat" ? h("span", { class: "badge", text: String(unread) }) : null
        )
    );
}

// --------------------------------------------------------------------------
// Overlays

function closeOn(close: () => void) {
    return (e: Event) => {
        if (e.target === e.currentTarget) {
            close();
            render();
        }
    };
}

function renderOverlay(g: GameView | null) {
    const o = shell.overlay;
    o.replaceChildren();
    if (ui.langOpen) {
        o.append(
            h(
                "div",
                { class: "overlay", on: { click: closeOn(() => (ui.langOpen = false)) } },
                h(
                    "div",
                    { class: "sheet", attrs: { role: "dialog", "aria-label": tr.language } },
                    h("h3", { text: tr.language }),
                    ...LANGS.map((l) =>
                        h(
                            "button",
                            { class: "lang-option", attrs: { "aria-pressed": l.id === lang, lang: l.id }, on: { click: () => chooseLang(l.id) } },
                            h("span", { class: "short", text: l.short }),
                            h("span", { text: l.label }),
                            l.id === lang ? h("span", { class: "tick", text: "✓" }) : null
                        )
                    )
                )
            )
        );
        return;
    }
    if (ui.roleOpen && g?.myRole) {
        const role = tr.roles[g.myRole];
        const team = ROLES[g.myRole].team;
        const pack = g.players.filter((p) => p.roleSource === "pack" || (p.isMe && g.myRole === "werewolf")).map((p) => p.name);
        o.append(
            h(
                "div",
                { class: "overlay", on: { click: closeOn(() => (ui.roleOpen = false)) } },
                h(
                    "div",
                    { class: "modal", attrs: { role: "dialog", "aria-label": tr.yourRole(role.name) } },
                    h("div", { class: "art" }, h("div", { class: "flip", html: cards()[g.myRole] })),
                    h("div", { class: `team ${team}`, text: team === "wolves" ? tr.teamPack : tr.teamVillage }),
                    h("h2", { text: role.name }),
                    h("p", { text: role.blurb }),
                    role.power ? h("p", { style: "font-size:14px;color:#aeb2d8", text: role.power }) : null,
                    g.myRole === "werewolf" && pack.length > 1 ? h("p", { style: "color:#ff9b9b;font-weight:600", text: tr.yourPack(pack.join(", ")) }) : null,
                    h("button", { class: "btn primary", text: tr.gotIt, on: { click: () => ((ui.roleOpen = false), render()) } })
                )
            )
        );
        return;
    }
    if (ui.overlay && Date.now() < ui.overlay.until) {
        const tx = ui.overlay;
        o.append(
            h(
                "div",
                { class: "overlay", on: { click: () => ((ui.overlay = null), render()) } },
                h(
                    "div",
                    { class: "transition-card" },
                    h("div", { class: "glyph", html: ICONS[tx.glyph].replace(/width="20" height="20"/, 'width="96" height="96"'), style: `color:${tx.glyph === "skull" ? "#ff8a7a" : "#f2d98d"}` }),
                    h("h2", { text: tx.title }),
                    h("p", { text: tx.sub })
                )
            )
        );
    }
}

setLang(lang);
render();
