import type { DriverModule, DriverSubscriptionEvent } from "@drawdy/driver-protocol";
import { createDriver } from "../src/driver";
import type { View, WebviewToDriver } from "../src/protocol";

type El = { id: string; type: string; meta: Record<string, unknown>; locked: boolean; frameId?: string; x: number; y: number; width: number; height: number; schema?: unknown };

const DRIVER_ID = "test.werewolf";

// Drawdy's driver worker has no crypto.subtle; neither do the tests.
const webCrypto = globalThis.crypto;
Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: <T extends ArrayBufferView>(a: T) => webCrypto.getRandomValues(a as never) as T },
});

/** A shared scene that several fake Drawdy clients write to, delivering scene events to all of them. */
export class FakeBoard {
    elements = new Map<string, El>();
    clients: FakeClient[] = [];
    private nextId = 0;
    commandLog: string[] = [];
    closed = false;

    /** Stops every client, so leftover host timers die instead of keeping the process alive. */
    close(): void {
        this.closed = true;
    }

    newId(): string {
        return `el${this.nextId++}`;
    }

    broadcast(type: "added" | "updated" | "removed", els: El[]): void {
        const snapshot = els.map((e) => ({ id: e.id, meta: structuredClone(e.meta) }));
        for (const c of this.clients) c.sceneEvent(type, snapshot);
    }
}

export class FakeClient {
    readonly driver: DriverModule = createDriver();
    readonly kv = new Map<string, Record<string, unknown>>();
    readonly subs = new Map<string, { type: string; req: unknown }>();
    views: View[] = [];
    webviewOpen = false;
    online = true;
    private subSeq = 0;

    constructor(
        readonly board: FakeBoard,
        readonly user: { id: string; name: string; color: string }
    ) {
        board.clients.push(this);
    }

    get view(): View | null {
        return this.views.at(-1) ?? null;
    }

    async activate(): Promise<void> {
        await this.driver.activate({
            issueCommand: ((r: never) => this.handle(r)) as never,
            manifest: { driverId: DRIVER_ID, driverName: "W", driverVersion: "0.0.0", main: "main.js", permissions: [] },
            styling: {} as never,
            generateId: () => this.board.newId(),
        });
    }

    async openPanel(): Promise<void> {
        const sub = this.findSub("subscription:dom:element-clicked");
        await this.deliver({ type: "subscription:dom:element-clicked", subscriptionId: sub, body: { domElementId: `${DRIVER_ID}:open`, clientX: 0, clientY: 0 } } as DriverSubscriptionEvent);
        await this.fromWebview({ t: "ready", lang: "en" });
    }

    async fromWebview(message: WebviewToDriver): Promise<void> {
        const sub = this.findSub("subscription:webview:message");
        await this.deliver({ type: "subscription:webview:message", subscriptionId: sub, body: { webviewDomId: `${DRIVER_ID}:panel`, message } } as DriverSubscriptionEvent);
    }

    sceneEvent(kind: "added" | "updated" | "removed", els: { id: string; meta: unknown }[]): void {
        if (!this.online || this.board.closed) return;
        for (const [id, s] of this.subs) {
            if (s.type !== `subscription:scene:elements-${kind}`) continue;
            setTimeout(() => {
                void this.deliver({ type: s.type, subscriptionId: id, body: { drawdyElements: els, properties: ["meta"] } } as DriverSubscriptionEvent);
            }, 0);
        }
    }

    private findSub(type: string): string {
        for (const [id, s] of this.subs) if (s.type === type) return id;
        throw new Error(`${this.user.name} has no ${type} subscription`);
    }

    private async deliver(e: DriverSubscriptionEvent): Promise<void> {
        await this.driver.onEvent(e);
    }

    private async handle(r: { type: string; req?: any }): Promise<{ res: { value?: unknown; error?: unknown } }> {
        const ok = (value: unknown = {}) => ({ res: { value } });
        const b = this.board;
        if (b.closed) return { res: { error: { type: "runtime", message: "board closed" } } };
        b.commandLog.push(`${this.user.name} ${r.type}`);
        if (r.type.startsWith("subscription:")) {
            const id = `s${this.subSeq++}`;
            this.subs.set(id, { type: r.type, req: r.req });
            return ok({ subscriptionId: id });
        }
        switch (r.type) {
            case "command:dom:create-action-button":
            case "command:context-menu:add":
                return ok({ created: true, added: true });
            case "command:webview:create":
                this.webviewOpen = true;
                return ok({ created: true });
            case "command:webview:post-message": {
                const m = r.req.message as { t: string; view?: View };
                if (m.t === "view") this.views.push(structuredClone(m.view!));
                return ok({ posted: true });
            }
            case "command:collaboration:get-all-users-in-board":
                return ok({
                    users: [this, ...b.clients.filter((c) => c !== this && c.online)].map((c) => ({
                        ...c.user,
                        isHost: false,
                        isSelf: c === this,
                        cursorPosition: null,
                    })),
                });
            case "command:kv-storage:get":
                return ok({ got: this.kv.get(r.req.key) });
            case "command:kv-storage:set":
                this.kv.set(r.req.key, r.req.payload);
                return ok({});
            case "command:camera:get-viewport-rect":
                return ok({ rect: { x: 0, y: 0, width: 1600, height: 1000 } });
            case "command:camera:fly-to-rect":
            case "command:camera:fly-to-elements":
                return ok({});
            case "command:scene:get-drawdy-elements":
                return ok({ drawdyElements: [...b.elements.values()].map((e) => ({ id: e.id, meta: structuredClone(e.meta) })) });
            case "command:scene:element-rects":
                return ok({
                    rects: (r.req.drawdyElementIds as string[])
                        .map((id) => b.elements.get(id))
                        .filter(Boolean)
                        .map((e) => ({ drawdyElementId: e!.id, rect: { x: e!.x, y: e!.y, width: e!.width, height: e!.height } })),
                });
            case "command:scene:add-drawdy-elements": {
                const els: El[] = (r.req.elements as any[]).map((s) => ({
                    id: s.drawdyElementId,
                    type: s.type,
                    meta: structuredClone(s.meta ?? {}),
                    locked: false,
                    frameId: s.frameId,
                    x: s.x ?? s.position?.[0] ?? 0,
                    y: s.y ?? s.position?.[1] ?? 0,
                    width: s.width ?? 0,
                    height: s.height ?? 0,
                    schema: s.schema,
                }));
                const taken = els.filter((e) => b.elements.has(e.id)).map((e) => e.id);
                if (taken.length) return { res: { error: { type: "bad-argument", body: { existingIds: taken } } } };
                for (const e of els) b.elements.set(e.id, e);
                b.broadcast("added", els);
                return ok({ added: true });
            }
            case "command:scene:update-drawdy-elements": {
                const touched: El[] = [];
                for (const u of r.req.updates as { drawdyElementId: string; properties: any }[]) {
                    const e = b.elements.get(u.drawdyElementId);
                    if (!e) continue;
                    if (u.properties.meta) e.meta = { ...e.meta, ...structuredClone(u.properties.meta) };
                    if (u.properties.locked !== undefined) e.locked = u.properties.locked;
                    touched.push(e);
                }
                b.broadcast("updated", touched);
                return ok({ updated: touched.length });
            }
            case "command:scene:remove-drawdy-elements": {
                const gone = (r.req.drawdyElementIds as string[]).map((id) => b.elements.get(id)).filter(Boolean) as El[];
                for (const e of gone) b.elements.delete(e.id);
                b.broadcast("removed", gone);
                return ok({ removed: gone.length });
            }
            default:
                return { res: { error: { type: "runtime", message: `fake does not implement ${r.type}` } } };
        }
    }
}

/** Runs time faster for the whole process so phase timers and the minimum night pass quickly. */
export function warpTime(speed: number): () => void {
    const realNow = Date.now.bind(Date);
    const realSetTimeout = globalThis.setTimeout;
    const t0 = realNow();
    Date.now = () => Math.round(t0 + (realNow() - t0) * speed);
    globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) =>
        realSetTimeout(fn, Math.max(0, (ms ?? 0) / speed), ...rest)) as typeof setTimeout;
    return () => {
        Date.now = realNow;
        globalThis.setTimeout = realSetTimeout;
    };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
