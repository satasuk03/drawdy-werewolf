import type {
    CollaborationUserPresence,
    DriverCommandIssuer,
    DriverCommandRequest,
    DriverCommandResponseFor,
    DriverModule,
    DriverSubscriptionEvent,
    DrawdyElementSchema,
} from "@drawdy/driver-protocol";
import { ACTION_ICON, CARD_BACK, cardArt } from "./art";
import { BOARD, renderChat, renderTable } from "./board";
import { detectLang, isLang, t, type Lang, type Notice } from "./i18n";
import {
    createIdentity,
    Keyring,
    loadIdentity,
    randomId,
    secureRandom,
    type PublicKeys,
} from "./crypto";
import {
    abandonGame,
    acceptActions,
    deckProblem,
    dossierFor,
    newLobby,
    shuffle,
    startGame,
    step,
    withLiveTallies,
    withSeerReadings,
    type Action,
    type ActionBody,
    type Dossier,
    type PlayerId,
    type PublicPlayer,
    type PublicState,
    type SecretState,
} from "./engine";
import type { DriverToWebview, View, WebviewToDriver } from "./protocol";
import {
    MAX_CHAT_LENGTH,
    META_KEY,
    parseRec,
    stateMacText,
    townMacText,
    type ActRec,
    type DossierRec,
    type PackLetter,
    type PackMsgRec,
    type Rec,
    type SealedAction,
    type SeatRec,
    type StateRec,
    type TownMsgRec,
    type VaultRec,
    type VisualRec,
} from "./records";
import { MAX_PLAYERS, MIN_PLAYERS, suggestedRoles, type RoleId } from "./roles";
import { buildView, canSpeak, type TownLine, type PackLine } from "./view";
import { WEBVIEW_HTML } from "./webview-html";

type Req = DriverCommandRequest;
type CommandType = Req["type"];
type ReqOf<T extends CommandType> = Extract<Req, { type: T }>;
type BodyOf<T extends CommandType> = ReqOf<T> extends { req: infer B } ? B : undefined;
type ValueOf<T extends CommandType> = NonNullable<DriverCommandResponseFor<ReqOf<T>>["res"]["value"]>;

class CommandError extends Error {
    constructor(readonly kind: string, message: string) {
        super(message);
    }
}

type Me = { id: PlayerId; name: string; color: string };

type Game = {
    stateId: string;
    state: StateRec;
    pub: PublicState;
};

const SCENE_KEYS = ["meta"] as const;

/** Sealed-box padding: every dossier is the same size whatever the role. */
const DOSSIER_PAD = 4096;
const PACK_PAD = 512;
const MAX_HEARD = 600;

export function createDriver(): DriverModule {
    let issue: DriverCommandIssuer;
    let driverId = "";
    let generateId: () => string = () => randomId();
    let requestSeq = 0;

    const ids = {
        button: "",
        webview: "",
        menu: "",
    };

    let engaged: Promise<void> | null = null;
    let me: Me = { id: "", name: "You", color: "#8b7cf6" };
    let keyring: Keyring | null = null;
    let presence: CollaborationUserPresence[] = [];
    let presenceSig = "";
    let notice: Notice | null = null;
    /** Panel language. Until the player picks one, it follows their browser. */
    let lang: Lang = detectLang(globalThis.navigator?.language);
    let langChosen = false;
    let busy = false;

    /** Every werewolf record on the board, by element id. */
    const recs = new Map<string, Rec>();

    // Decryption and verification caches, keyed by element id or box.
    const packPlain = new Map<string, PackLetter | null>();
    const actPlain = new Map<string, Action | null>();
    let dossierCache: { box: string; dossier: Dossier | null } | null = null;

    /** State records whose host signature checked out, by element id. */
    const trusted = new Map<string, { rec: StateRec; pub: PublicState }>();
    /** The host signing key first seen for each game; a state signed by any other key is ignored. */
    const pinnedHost = new Map<string, string>();

    // Host memory.
    let hostSec: { gameId: string; sec: SecretState } | null = null;
    const hostWritten = new Map<string, string>();
    let hostTimer: ReturnType<typeof setTimeout> | null = null;
    let forceAdvance = false;
    /** Chat records the host already ruled on (accepted ones live in `pub.heard`). */
    const judged = new Set<string>();
    const anchorCache = new Map<string, { at: number; x: number; y: number }>();

    async function call<T extends CommandType>(
        type: T,
        ...args: BodyOf<T> extends undefined ? [] : [BodyOf<T>]
    ): Promise<ValueOf<T>> {
        const request = {
            type,
            driverId,
            requestId: String(requestSeq++),
            ...(args.length ? { req: args[0] } : {}),
        } as unknown as ReqOf<T>;
        const res = (await issue(request)) as { res: { value?: unknown; error?: { type: string; message?: string } } };
        if (res.res.error) throw new CommandError(res.res.error.type, res.res.error.message ?? res.res.error.type);
        return res.res.value as ValueOf<T>;
    }

    // -----------------------------------------------------------------------
    // Records

    function activeGame(): Game | null {
        let best: { id: string; rec: StateRec; pub: PublicState } | null = null;
        for (const [id, { rec, pub }] of trusted) {
            if (!recs.has(id)) continue;
            const rank = (x: { rec: StateRec; pub: PublicState }) => [x.pub.phase === "over" ? 1 : 0, -x.rec.created, x.rec.g] as const;
            if (!best) {
                best = { id, rec, pub };
                continue;
            }
            const a = rank({ rec, pub });
            const b = rank(best);
            // Prefer live games, then the newest.
            if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) {
                best = { id, rec, pub };
            }
        }
        return best ? { stateId: best.id, state: best.rec, pub: best.pub } : null;
    }

    /**
     * Admits state records that carry a valid host MAC for this player. A
     * player the host hasn't seated yet has no tag, and takes the state on
     * trust as long as it comes from the host key first seen for the game.
     */
    async function verifyStates(): Promise<void> {
        if (!keyring) return;
        for (const id of trusted.keys()) if (!recs.has(id)) trusted.delete(id);
        for (const [id, rec] of recs) {
            if (rec.k !== "state") continue;
            const known = trusted.get(id);
            if (known?.rec.json === rec.json && known.rec.rev === rec.rev) continue;
            if (known && rec.rev <= known.rec.rev) continue;
            const pin = pinnedHost.get(rec.g) ?? rec.hk?.ek;
            if (!rec.hk || rec.hk.ek !== pin) continue;
            let pub: PublicState;
            try {
                pub = JSON.parse(rec.json) as PublicState;
            } catch {
                continue;
            }
            const tag = rec.tags?.[me.id];
            const expectsTag = pub.hostId === me.id || pub.players.some((p) => p.id === me.id);
            if (tag !== undefined || expectsTag) {
                if (!(await keyring.verifyMac(rec.hk.ek, stateMacText(rec), tag))) continue;
            }
            trusted.set(id, { rec, pub });
            pinnedHost.set(rec.g, rec.hk.ek);
        }
    }

    /** Everyone the host can vouch to: seated players, lobby seats, and itself. */
    function stateTags(game: Game, pub: PublicState, text: string): Promise<Record<PlayerId, string>> {
        const keys = new Map<PlayerId, string>(pub.players.map((p) => [p.id, p.keys.ek]));
        if (pub.phase === "lobby") for (const [p, seat] of seats(game.state.g)) if (!keys.has(p)) keys.set(p, seat.rec.keys.ek);
        keys.set(me.id, keyring!.identity.publicKeys.ek);
        return Promise.all([...keys].map(async ([p, ek]) => [p, await keyring!.mac(ek, text)] as const)).then(Object.fromEntries);
    }

    function gameRecs<K extends Rec["k"]>(g: string, k: K): [string, Extract<Rec, { k: K }>][] {
        const out: [string, Extract<Rec, { k: K }>][] = [];
        for (const [id, rec] of recs) if (rec.g === g && rec.k === k) out.push([id, rec as Extract<Rec, { k: K }>]);
        return out;
    }

    function seats(g: string): Map<PlayerId, { id: string; rec: SeatRec }> {
        const out = new Map<PlayerId, { id: string; rec: SeatRec }>();
        for (const [id, rec] of gameRecs(g, "seat")) {
            const prev = out.get(rec.p);
            if (!prev || prev.rec.ts < rec.ts) out.set(rec.p, { id, rec });
        }
        return out;
    }

    /** The keys a player is known by: pinned in the state once seated, else their seat. */
    function playerKeys(game: Game, p: PlayerId): PublicKeys | undefined {
        const pinned = game.pub.players.find((x) => x.id === p)?.keys;
        if (pinned) return pinned;
        if (p === game.pub.hostId && !game.pub.hostPlays) return game.state.hk;
        return game.pub.phase === "lobby" ? seats(game.state.g).get(p)?.rec.keys : undefined;
    }

    async function recordAnchor(game: Game | null): Promise<{ x: number; y: number; frameId?: string }> {
        const frameId = game?.state.frameId;
        if (!frameId) return { x: 0, y: 0 };
        const cached = anchorCache.get(frameId);
        if (cached && Date.now() - cached.at < 5000) return { x: cached.x, y: cached.y, frameId };
        try {
            const { rects } = await call("command:scene:element-rects", { drawdyElementIds: [frameId] });
            const r = rects[0]?.rect;
            if (!r) return { x: 0, y: 0 };
            const at = { at: Date.now(), x: r.x + 4, y: r.y + r.height - 6 };
            anchorCache.set(frameId, at);
            return { x: at.x, y: at.y, frameId };
        } catch {
            return { x: 0, y: 0 };
        }
    }

    /** Records are tiny invisible locked shapes tucked into the table frame. */
    async function addRecord(rec: Rec, game: Game | null = activeGame()): Promise<string> {
        const id = generateId();
        const at = await recordAnchor(game);
        await call("command:scene:add-drawdy-elements", {
            elements: [
                {
                    type: "shape",
                    componentType: "rect",
                    drawdyElementId: id,
                    x: at.x,
                    y: at.y,
                    width: 2,
                    height: 2,
                    strokeColor: "transparent",
                    fillColor: "transparent",
                    strokeWidth: 0,
                    opacity: 0,
                    meta: { [META_KEY]: rec },
                    ...(at.frameId ? { frameId: at.frameId } : {}),
                },
            ],
        });
        recs.set(id, rec);
        call("command:scene:update-drawdy-elements", {
            updates: [{ drawdyElementId: id, properties: { locked: true } }],
        }).catch(() => {});
        return id;
    }

    async function updateRecord(id: string, rec: Rec): Promise<void> {
        await call("command:scene:update-drawdy-elements", {
            updates: [{ drawdyElementId: id, properties: { meta: { [META_KEY]: rec } } }],
        });
        recs.set(id, rec);
    }

    async function removeElements(elementIds: string[]): Promise<void> {
        if (elementIds.length === 0) return;
        for (const id of elementIds) recs.delete(id);
        await call("command:scene:remove-drawdy-elements", { drawdyElementIds: elementIds }).catch(() => {});
    }

    function ingest(elements: readonly { id: string; meta?: unknown }[], removed = false): boolean {
        let touched = false;
        for (const el of elements) {
            if (removed) {
                touched = recs.delete(el.id) || touched;
                continue;
            }
            const rec = parseRec(el.meta);
            if (!rec) {
                touched = recs.delete(el.id) || touched;
                continue;
            }
            // Echoes of our own earlier writes can arrive late; never step a state back to an older revision.
            const prev = recs.get(el.id);
            if (rec.k === "state" && prev?.k === "state" && rec.rev < prev.rev) continue;
            recs.set(el.id, rec);
            touched = true;
        }
        return touched;
    }

    // -----------------------------------------------------------------------
    // Engagement: everything that needs scene, storage or collaboration waits
    // for the first time the user opens the panel.

    async function loadIdentityFor(id: PlayerId): Promise<Keyring> {
        const key = `identity:${id}`;
        try {
            const { got } = await call("command:kv-storage:get", { key });
            const identity = loadIdentity(got);
            if (identity) return new Keyring(identity);
        } catch {
            // Storage refused: keys live only as long as this tab.
        }
        const { identity, stored } = createIdentity();
        await call("command:kv-storage:set", { key, payload: stored as unknown as Record<string, unknown> }).catch(() => {});
        return new Keyring(identity);
    }

    async function engage(): Promise<void> {
        try {
            const { users } = await call("command:collaboration:get-all-users-in-board");
            presence = users;
            const self = users.find((u) => u.isSelf) ?? users[0];
            if (self) me = { id: self.id, name: self.name || "Player", color: self.color || me.color };
            presenceSig = signature(users);
        } catch {
            notice = { code: "need-collab" };
        }
        if (!me.id) me.id = `guest-${randomId(6)}`;
        keyring = await loadIdentityFor(me.id);
        try {
            const { got } = await call("command:kv-storage:get", { key: "prefs" });
            if (isLang(got?.lang)) {
                lang = got.lang;
                langChosen = true;
            }
        } catch {
            // No stored preference.
        }

        await call("subscription:collaboration:presence-changed").catch(() => {});
        for (const type of [
            "subscription:scene:elements-added",
            "subscription:scene:elements-updated",
            "subscription:scene:elements-removed",
        ] as const) {
            await call(type, { properties: [...SCENE_KEYS] });
        }
        const { drawdyElements } = await call("command:scene:get-drawdy-elements", { properties: [...SCENE_KEYS] });
        ingest(drawdyElements);
    }

    function signature(users: readonly CollaborationUserPresence[]): string {
        return users.map((u) => `${u.id}:${u.name}:${u.color}`).sort().join("|");
    }

    async function openPanel(): Promise<void> {
        await call("command:webview:create", {
            webviewDomId: ids.webview,
            htmlContent: WEBVIEW_HTML,
        });
        if (!engaged) {
            engaged = engage().catch((err) => {
                engaged = null;
                notice =
                    err instanceof CommandError && err.kind === "unauthorized"
                        ? { code: "need-access" }
                        : { code: "failed", detail: String(err?.message ?? err) };
                post({ t: "view", view: currentView() });
                throw err;
            });
        }
        await engaged.catch(() => {});
        refresh();
    }

    // -----------------------------------------------------------------------
    // Derived data for this viewer

    async function readDossier(game: Game): Promise<Dossier | null> {
        if (!keyring) return null;
        const rec = gameRecs(game.state.g, "dossier").find(([, r]) => r.to === me.id)?.[1];
        if (!rec) return null;
        if (dossierCache?.box === rec.box) return dossierCache.dossier;
        const dossier = await keyring.open<Dossier>(game.state.hk.ek, rec.box);
        dossierCache = { box: rec.box, dossier };
        return dossier;
    }

    /** Town messages the host accepted, plus this player's own messages still on their way. */
    async function townLines(game: Game): Promise<TownLine[]> {
        const heard = new Set(game.pub.heard);
        const lines: TownLine[] = [];
        for (const [id, rec] of gameRecs(game.state.g, "msg")) {
            const pending = rec.p === me.id && rec.ps === game.pub.seq && !judged.has(id) && canSpeak(game.pub, me.id, game.pub.seq, "town");
            if ((heard.has(id) || pending) && typeof rec.text === "string") lines.push({ id, rec: { ...rec, text: rec.text.slice(0, MAX_CHAT_LENGTH) } });
        }
        return lines;
    }

    /** Host only: the message's MAC proves which player wrote it. */
    async function townAuthentic(game: Game, rec: TownMsgRec): Promise<boolean> {
        const keys = playerKeys(game, rec.p);
        if (!keys || !keyring || typeof rec.text !== "string" || rec.text.length > MAX_CHAT_LENGTH) return false;
        return keyring.verifyMac(keys.ek, townMacText(rec), rec.tag);
    }

    /** Opens a pack record by trying each candidate author's key on each box. */
    async function openPack(game: Game, id: string, rec: PackMsgRec, authors: PlayerId[]): Promise<PackLetter | null> {
        const cached = packPlain.get(id);
        if (cached !== undefined) return cached;
        let letter: PackLetter | null = null;
        search: for (const author of authors) {
            const keys = playerKeys(game, author);
            if (!keys || !keyring) continue;
            for (const box of rec.boxes) {
                const opened = await keyring.open<PackLetter>(keys.ek, box);
                if (opened && opened.from === author && typeof opened.text === "string") {
                    letter = { from: author, text: opened.text.slice(0, MAX_CHAT_LENGTH) };
                    break search;
                }
            }
        }
        packPlain.set(id, letter);
        return letter;
    }

    async function packLines(game: Game, dossier: Dossier | null): Promise<PackLine[]> {
        if (!keyring || !dossier?.pack) return [];
        const heard = new Set(game.pub.heard);
        const lines: PackLine[] = [];
        for (const [id, rec] of gameRecs(game.state.g, "pack")) {
            const letter = await openPack(game, id, rec, dossier.pack);
            if (!letter) continue;
            const pending = letter.from === me.id && rec.ps === game.pub.seq && !judged.has(id) && canSpeak(game.pub, me.id, game.pub.seq, "pack");
            if (heard.has(id) || pending) lines.push({ id, rec, from: letter.from, text: letter.text });
        }
        return lines;
    }

    // -----------------------------------------------------------------------
    // Host

    /** Opens every action record by trying each player's key; the one that opens it is the author. */
    async function hostActions(game: Game, pub: PublicState): Promise<Action[]> {
        if (!keyring) return [];
        const out: Action[] = [];
        for (const [id, rec] of gameRecs(game.state.g, "act")) {
            let action = actPlain.get(id);
            if (action === undefined) {
                action = null;
                for (const player of pub.players) {
                    const sealed = await keyring.open<SealedAction>(player.keys.ek, rec.box);
                    if (sealed) {
                        action = { ...sealed.body, from: player.id, seq: sealed.seq, ts: sealed.ts } as Action;
                        break;
                    }
                }
                actPlain.set(id, action);
            }
            if (action && action.seq === pub.seq) out.push(action);
        }
        return out;
    }

    /**
     * Rules on chat sent during the current phase. Only messages the sender
     * was allowed to say right now are added to `heard`; every client shows
     * just those, so a dead player's words never appear anywhere.
     */
    async function hostHear(game: Game, pub: PublicState, sec: SecretState | null): Promise<PublicState> {
        const heard = new Set(pub.heard);
        const fresh: string[] = [];
        for (const [id, rec] of gameRecs(game.state.g, "msg")) {
            if (judged.has(id) || heard.has(id) || rec.ps !== pub.seq) continue;
            judged.add(id);
            if (canSpeak(pub, rec.p, pub.seq, "town") && (await townAuthentic({ ...game, pub }, rec))) fresh.push(id);
        }
        const wolves = sec ? pub.players.filter((p) => sec.roles[p.id] === "werewolf").map((p) => p.id) : [];
        for (const [id, rec] of gameRecs(game.state.g, "pack")) {
            if (judged.has(id) || heard.has(id) || rec.ps !== pub.seq) continue;
            judged.add(id);
            const letter = await openPack({ ...game, pub }, id, rec, wolves);
            if (letter && canSpeak(pub, letter.from, pub.seq, "pack")) fresh.push(id);
        }
        if (fresh.length === 0) return pub;
        return { ...pub, heard: [...pub.heard, ...fresh].slice(-MAX_HEARD) };
    }

    async function hostSecret(game: Game): Promise<SecretState | null> {
        if (hostSec?.gameId === game.state.g) return hostSec.sec;
        if (!keyring) return null;
        const vault = gameRecs(game.state.g, "vault")[0]?.[1];
        if (!vault) return null;
        const sec = await keyring.open<SecretState>(keyring.identity.publicKeys.ek, vault.box);
        if (sec) hostSec = { gameId: game.state.g, sec };
        return sec;
    }

    /** Writes a host-owned record only when its plaintext changed. */
    async function hostWrite(key: string, plain: string, make: () => Promise<Rec>, find: () => string | undefined) {
        if (hostWritten.get(key) === plain && find()) return;
        const rec = await make();
        const existing = find();
        if (existing) await updateRecord(existing, rec);
        else await addRecord(rec);
        hostWritten.set(key, plain);
    }

    async function writeState(game: Game, pub: PublicState): Promise<void> {
        if (!keyring) return;
        const json = JSON.stringify(pub);
        const onBoard = recs.get(game.stateId);
        // A newer revision the host didn't write is tampering: overwrite it.
        const tampered = onBoard?.k === "state" && onBoard.rev > game.state.rev;
        if (json === game.state.json && !tampered) return;
        const base = { ...game.state, rev: Math.max(game.state.rev, onBoard?.k === "state" ? onBoard.rev : 0) + 1, json };
        const rec: StateRec = { ...base, tags: await stateTags(game, pub, stateMacText(base)) };
        await updateRecord(game.stateId, rec);
        trusted.set(game.stateId, { rec, pub });
    }

    async function hostTick(game: Game): Promise<void> {
        if (!keyring || game.pub.hostId !== me.id) return;
        const force = forceAdvance;
        forceAdvance = false;
        const g = game.state.g;
        let pub = game.pub;

        if (pub.phase === "lobby" || pub.phase === "over") {
            if (pub.phase === "lobby") pub = { ...pub, ...lobbyPlayers(game) };
            pub = await hostHear(game, pub, null);
            await writeState(game, pub);
            await renderBoard(game, pub);
            return;
        }

        let sec = await hostSecret(game);
        if (!sec) {
            notice = { code: "secrets-elsewhere" };
            return;
        }
        pub = await hostHear(game, pub, sec);
        let actions = await hostActions(game, pub);
        let acts = acceptActions(pub, sec, actions);
        for (let guard = 0; guard < 6; guard++) {
            sec = withSeerReadings(pub, sec, acts);
            pub = withLiveTallies(pub, acts);
            const next = step({ pub, sec, acts, rng: secureRandom, now: Date.now(), force: force && guard === 0 });
            if (!next) break;
            pub = next.pub;
            sec = next.sec;
            actions = await hostActions(game, pub);
            acts = acceptActions(pub, sec, actions);
        }

        hostSec = { gameId: g, sec };
        const secret = sec;
        const hostKeys = keyring.identity.publicKeys;
        await hostWrite(
            `vault:${g}`,
            JSON.stringify(secret),
            async () => ({ k: "vault", g, box: await keyring!.seal(hostKeys.ek, secret) }) satisfies VaultRec,
            () => gameRecs(g, "vault")[0]?.[0]
        );
        for (const player of pub.players) {
            const dossier = dossierFor(player.id, pub, secret, acts);
            if (!dossier) continue;
            await hostWrite(
                `dossier:${g}:${player.id}`,
                JSON.stringify(dossier),
                async () =>
                    ({ k: "dossier", g, to: player.id, box: await keyring!.seal(player.keys.ek, dossier, DOSSIER_PAD) }) satisfies DossierRec,
                () => gameRecs(g, "dossier").find(([, r]) => r.to === player.id)?.[0]
            );
        }
        await writeState(game, pub);
        await renderBoard(game, pub);
        scheduleHostTimer(pub);
    }

    /**
     * Seats the lobby in join order. A player's keys are pinned the first
     * time the host seats them, so a forged seat can't take over their role.
     */
    function lobbyPlayers(game: Game): { players: PublicPlayer[]; deck: PublicState["deck"] } {
        const pinned = new Map(game.pub.players.map((p) => [p.id, p.keys.ek]));
        const chosen = new Map<PlayerId, SeatRec>();
        const ordered = gameRecs(game.state.g, "seat").map(([, r]) => r).sort((a, b) => a.ts - b.ts);
        for (const seat of ordered) {
            if (chosen.has(seat.p)) continue;
            const pin = pinned.get(seat.p);
            if (pin && pin !== seat.keys.ek) continue;
            chosen.set(seat.p, seat);
        }
        const players = [...chosen.values()]
            .slice(0, MAX_PLAYERS)
            .map((r): PublicPlayer => ({ id: r.p, name: r.name.slice(0, 40), color: r.color, keys: r.keys, alive: true }));
        const deck = game.pub.deckCustom ? game.pub.deck : suggestedRoles(Math.max(players.length, MIN_PLAYERS));
        return { players, deck };
    }

    function scheduleHostTimer(pub: PublicState): void {
        if (hostTimer) clearTimeout(hostTimer);
        hostTimer = null;
        if (pub.deadline === null) return;
        // Also wake for the minimum-night threshold, which can complete a phase without any new action.
        const wake = Math.min(pub.deadline, pub.phase === "night" ? pub.phaseStartedAt + 8_100 : Infinity);
        const delay = Math.max(250, (wake <= Date.now() ? pub.deadline : wake) - Date.now() + 100);
        hostTimer = setTimeout(() => {
            hostTimer = null;
            refresh();
        }, delay);
    }

    // -----------------------------------------------------------------------
    // Board visuals (host only)

    const boardSig = { table: "", chat: "" };

    async function renderBoard(game: Game, pub: PublicState): Promise<void> {
        const town = (await townLines({ ...game, pub })).map((l) => l.rec);
        await replaceVisual(game, "table", renderTable(pub, lang, CARD_BACK, cardArt(lang)));
        await replaceVisual(game, "chat", renderChat(pub, lang, town));
    }

    async function replaceVisual(
        game: Game,
        part: "table" | "chat",
        view: { sig: string; element: (at: { x: number; y: number }) => DrawdyElementSchema }
    ): Promise<void> {
        const existing = gameRecs(game.state.g, "visual").filter(([, r]) => r.part === part);
        if (boardSig[part] === view.sig && existing.length > 0) return;
        let at: { x: number; y: number } | null = null;
        try {
            const { rects } = await call("command:scene:element-rects", { drawdyElementIds: [game.state.frameId] });
            const frame = rects[0]?.rect;
            if (frame) at = { x: frame.x + BOARD[part].x, y: frame.y + BOARD[part].y };
        } catch {
            // Frame gone; visuals are decoration, the game goes on.
        }
        if (!at) return;
        boardSig[part] = view.sig;
        const id = generateId();
        const rec: VisualRec = { k: "visual", g: game.state.g, part };
        const element = {
            ...view.element(at),
            drawdyElementId: id,
            frameId: game.state.frameId,
            meta: { [META_KEY]: rec },
        } as DrawdyElementSchema;
        try {
            await call("command:scene:add-drawdy-elements", { elements: [element] });
            recs.set(id, rec);
            await call("command:scene:update-drawdy-elements", {
                updates: [{ drawdyElementId: id, properties: { locked: true } }],
            }).catch(() => {});
            await removeElements(existing.map(([eid]) => eid));
        } catch {
            boardSig[part] = "";
        }
    }

    // -----------------------------------------------------------------------
    // Intents from the panel

    async function createGame(hostPlays: boolean): Promise<void> {
        const current = activeGame();
        if (current && current.pub.phase !== "over") {
            notice = { code: "game-running" };
            return;
        }
        if (!keyring) return;
        // Clear the previous game, including its table.
        await removeElements([...recs.keys()]);
        if (current) await removeElements([current.state.frameId]);

        const g = randomId();
        const frameId = generateId();
        const stateId = generateId();
        const now = Date.now();
        let center = { x: 0, y: 0 };
        try {
            const { rect } = await call("command:camera:get-viewport-rect");
            center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        } catch {
            // Default to the origin.
        }
        const origin = { x: Math.round(center.x - BOARD.frame.width / 2), y: Math.round(center.y - BOARD.frame.height / 2) };
        const pub = newLobby({ gameId: g, hostId: me.id, hostName: me.name, hostPlays, deck: suggestedRoles(MIN_PLAYERS), now });
        const base = { k: "state" as const, g, created: now, rev: 0, hk: keyring.identity.publicKeys, json: JSON.stringify(pub), frameId };
        const state: StateRec = { ...base, tags: { [me.id]: await keyring.mac(keyring.identity.publicKeys.ek, stateMacText(base)) } };
        await call("command:scene:add-drawdy-elements", {
            elements: [
                {
                    type: "frame",
                    drawdyElementId: frameId,
                    name: t(lang).appName,
                    position: [origin.x, origin.y],
                    width: BOARD.frame.width,
                    height: BOARD.frame.height,
                    rotation: 0,
                    fillColor: BOARD.frame.fill,
                    meta: {},
                },
                {
                    type: "shape",
                    componentType: "rect",
                    drawdyElementId: stateId,
                    x: origin.x + 4,
                    y: origin.y + BOARD.frame.height - 6,
                    width: 2,
                    height: 2,
                    strokeColor: "transparent",
                    fillColor: "transparent",
                    strokeWidth: 0,
                    opacity: 0,
                    frameId,
                    meta: { [META_KEY]: state },
                },
            ],
        });
        recs.set(stateId, state);
        trusted.set(stateId, { rec: state, pub });
        pinnedHost.set(g, state.hk.ek);
        call("command:scene:update-drawdy-elements", {
            updates: [{ drawdyElementId: stateId, properties: { locked: true } }],
        }).catch(() => {});
        hostSec = null;
        judged.clear();
        hostWritten.clear();
        boardSig.table = boardSig.chat = "";
        if (hostPlays) await joinGame();
        call("command:camera:fly-to-rect", {
            rect: { x: origin.x, y: origin.y, width: BOARD.frame.width, height: BOARD.frame.height },
            flyDurationMs: 500,
            zoom: 1,
        }).catch(() => {});
    }

    async function joinGame(): Promise<void> {
        const game = activeGame();
        if (!game || !keyring || game.pub.phase !== "lobby") return;
        if (seats(game.state.g).has(me.id)) return;
        if (game.pub.players.length >= MAX_PLAYERS) {
            notice = { code: "table-full" };
            return;
        }
        const seat: SeatRec = {
            k: "seat",
            g: game.state.g,
            p: me.id,
            name: me.name,
            color: me.color,
            ts: Date.now(),
            keys: keyring.identity.publicKeys,
        };
        await addRecord(seat, game);
    }

    async function leaveGame(): Promise<void> {
        const game = activeGame();
        if (!game || game.pub.phase !== "lobby") return;
        const mine = gameRecs(game.state.g, "seat").filter(([, r]) => r.p === me.id).map(([id]) => id);
        await removeElements(mine);
    }

    async function configure(m: Extract<WebviewToDriver, { t: "config" }>): Promise<void> {
        const game = activeGame();
        if (!game || game.pub.hostId !== me.id || game.pub.phase !== "lobby") return;
        const pub: PublicState = {
            ...game.pub,
            deck: m.deck ?? game.pub.deck,
            deckCustom: m.deck ? !m.suggested : game.pub.deckCustom,
            pace: m.pace ?? game.pub.pace,
            hostPlays: m.hostPlays ?? game.pub.hostPlays,
        };
        await writeState(game, pub);
        if (m.hostPlays === true) await joinGame();
        if (m.hostPlays === false) await leaveGame();
    }

    async function start(): Promise<void> {
        const game = activeGame();
        if (!game || game.pub.hostId !== me.id || game.pub.phase !== "lobby") return;
        const problem = deckProblem(game.pub.deck, game.pub.players.length);
        if (problem) {
            notice = { code: "deck", problem };
            return;
        }
        const { pub, sec } = startGame(game.pub, secureRandom, Date.now());
        hostSec = { gameId: game.state.g, sec };
        hostWritten.clear();
        // Seal the vault before the state announces the night, so a reload mid-start can recover.
        await hostWrite(
            `vault:${game.state.g}`,
            JSON.stringify(sec),
            async () => ({ k: "vault", g: game.state.g, box: await keyring!.seal(keyring!.identity.publicKeys.ek, sec) }),
            () => gameRecs(game.state.g, "vault")[0]?.[0]
        );
        await writeState(game, pub);
    }

    async function act(body: ActionBody): Promise<void> {
        const game = activeGame();
        if (!game || !keyring) return;
        const sealed: SealedAction = { body, seq: game.pub.seq, ts: Date.now() };
        const rec: ActRec = { k: "act", g: game.state.g, box: await keyring.seal(game.state.hk.ek, sealed) };
        await addRecord(rec, game);
    }

    async function chat(channel: "town" | "pack", raw: string): Promise<void> {
        const game = activeGame();
        const text = raw.trim().slice(0, MAX_CHAT_LENGTH);
        if (!game || !keyring || !text) return;
        if (!canSpeak(game.pub, me.id, game.pub.seq, channel)) {
            notice = { code: "cannot-speak" };
            return;
        }
        const base = { g: game.state.g, p: me.id, ts: Date.now(), ps: game.pub.seq };
        if (channel === "town") {
            const rec: TownMsgRec = { k: "msg", ...base, text, tag: await keyring.mac(game.state.hk.ek, townMacText({ ...base, text })) };
            await addRecord(rec, game);
            return;
        }
        const dossier = await readDossier(game);
        if (!dossier?.pack) return;
        const letter: PackLetter = { from: me.id, text };
        const recipients = [
            ...game.pub.players.filter((p) => p.alive && dossier.pack!.includes(p.id)).map((p) => p.keys.ek),
            game.state.hk.ek,
        ];
        const boxes = await Promise.all(recipients.map((ek) => keyring!.seal(ek, letter, PACK_PAD)));
        const rec: PackMsgRec = { k: "pack", g: base.g, ts: base.ts, ps: base.ps, boxes: shuffle(boxes, secureRandom) };
        await addRecord(rec, game);
    }

    async function endGame(): Promise<void> {
        const game = activeGame();
        if (!game || game.pub.hostId !== me.id || game.pub.phase === "over") return;
        const sec = await hostSecret(game);
        await writeState(game, abandonGame(game.pub, sec, Date.now()));
    }

    async function handleIntent(m: WebviewToDriver): Promise<void> {
        switch (m.t) {
            case "ready":
                if (!langChosen) lang = m.lang;
                return;
            case "lang":
                lang = m.lang;
                langChosen = true;
                await call("command:kv-storage:set", { key: "prefs", payload: { lang } }).catch(() => {});
                return;
            case "create":
                return createGame(m.hostPlays);
            case "join":
                return joinGame();
            case "leave":
                return leaveGame();
            case "config":
                return configure(m);
            case "start":
                return start();
            case "act":
                return act(m.body);
            case "chat":
                return chat(m.channel, m.text);
            case "advance":
                forceAdvance = true;
                return;
            case "end":
                return endGame();
            case "focus-board": {
                const game = activeGame();
                if (game) {
                    await call("command:camera:fly-to-elements", {
                        drawdyElementIds: [game.state.frameId],
                        flyDurationMs: 450,
                        zoom: 1,
                    }).catch(() => {});
                }
                return;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Refresh loop: one pass at a time, coalescing bursts of events.

    /** Host ticks and intents share one queue, so a tick can't overwrite a click like "End game". */
    let queue: Promise<unknown> = Promise.resolve();
    function serial<T>(fn: () => Promise<T>): Promise<T> {
        const run = queue.then(fn, fn);
        queue = run.catch(() => {});
        return run;
    }

    let running: Promise<void> | null = null;
    let again = false;
    let lastView: View | null = null;

    function refresh(): void {
        if (!engaged) return;
        if (running) {
            again = true;
            return;
        }
        running = (async () => {
            do {
                again = false;
                await serial(pass).catch((err) => {
                    // A failed pass must still reach the panel, or it freezes on a stale phase with no explanation.
                    notice = { code: "failed", detail: String(err?.stack ?? err?.message ?? err) };
                    post({ t: "view", view: { ...currentView(), notice } });
                });
            } while (again);
        })().finally(() => {
            running = null;
        });
    }

    async function pass(): Promise<void> {
        await engaged;
        await verifyStates();
        let game = activeGame();
        if (game && game.pub.hostId === me.id) {
            await hostTick(game);
            game = activeGame();
        } else if (hostTimer) {
            clearTimeout(hostTimer);
            hostTimer = null;
        }
        const dossier = game ? await readDossier(game) : null;
        const town = game ? await townLines(game) : [];
        const pack = game ? await packLines(game, dossier) : [];
        const godSec = game && game.pub.hostId === me.id && !game.pub.hostPlays ? await hostSecret(game) : null;
        lastView = buildView({
            me,
            now: Date.now(),
            pub: game?.pub ?? null,
            seated: game ? seats(game.state.g).has(me.id) : false,
            dossier,
            godRoles: godSec?.roles ?? null,
            online: new Set(presence.map((u) => u.id)),
            town,
            pack,
            busy,
            notice,
            lang,
        });
        post({ t: "view", view: lastView });
    }

    function currentView(): View {
        return lastView ?? { now: Date.now(), lang, me, game: null, busy, notice };
    }

    function post(message: DriverToWebview): void {
        if (!ids.webview) return;
        call("command:webview:post-message", { webviewDomId: ids.webview, message }).catch(() => {});
    }

    // -----------------------------------------------------------------------
    // Module

    return {
        async activate(ctx) {
            issue = ctx.issueCommand;
            driverId = ctx.manifest.driverId;
            generateId = ctx.generateId;
            ids.button = `${driverId}:open`;
            ids.webview = `${driverId}:panel`;
            ids.menu = `${driverId}:menu-open`;

            await call("command:dom:create-action-button", { domElementId: ids.button, svg: ACTION_ICON });
            await call("subscription:dom:element-clicked", { domElementId: ids.button });
            await call("command:context-menu:add", { menuId: ids.menu, menuTitle: t(lang).menuTitle }).catch(() => {});
            await call("subscription:context-menu:clicked", { menuId: ids.menu }).catch(() => {});
            await call("subscription:webview:message", { webviewDomId: ids.webview });
        },

        async onEvent(e: DriverSubscriptionEvent) {
            switch (e.type) {
                case "subscription:dom:element-clicked":
                    if (e.body.domElementId === ids.button) await openPanel();
                    return;
                case "subscription:context-menu:clicked":
                    if (e.body.menuId === ids.menu) await openPanel();
                    return;
                case "subscription:webview:message": {
                    if (e.body.webviewDomId !== ids.webview) return;
                    const m = e.body.message as WebviewToDriver;
                    if (!m || typeof m !== "object" || typeof m.t !== "string") return;
                    if (m.t !== "ready") await engaged?.catch(() => {});
                    notice = null;
                    busy = m.t !== "ready" && m.t !== "focus-board";
                    try {
                        await serial(async () => {
                            await verifyStates();
                            await handleIntent(m);
                        });
                    } catch (err) {
                        notice = { code: "failed", detail: String((err as Error)?.message ?? err) };
                    } finally {
                        busy = false;
                    }
                    refresh();
                    return;
                }
                case "subscription:scene:elements-added":
                case "subscription:scene:elements-updated":
                    if (ingest(e.body.drawdyElements)) refresh();
                    return;
                case "subscription:scene:elements-removed":
                    if (ingest(e.body.drawdyElements, true)) refresh();
                    return;
                case "subscription:collaboration:presence-changed": {
                    presence = e.body.users;
                    const sig = signature(e.body.users);
                    if (sig !== presenceSig) {
                        presenceSig = sig;
                        refresh();
                    }
                    return;
                }
                default:
                    return;
            }
        },
    };
}
