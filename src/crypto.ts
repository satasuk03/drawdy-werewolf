/**
 * Everything the board carries is visible to every collaborator, so private
 * game data (roles, night actions, wolf chat) is sealed with a key that only
 * two players share, derived by X25519. The same shared secret yields a MAC
 * key, which proves to the host who wrote a chat message and proves to each
 * player that the game state came from the host.
 */
import { chachaOpen, chachaSeal, equal, hmacSha256, randomBytes, x25519, x25519Public } from "./primitives";

/** Base64 of a 32-byte X25519 public key. */
export type PublicKeys = { ek: string };

export type Identity = { publicKeys: PublicKeys; secret: Uint8Array };

export type StoredIdentity = { v: 2; pub: string; secret: string };

const text = new TextEncoder();

export function createIdentity(): { identity: Identity; stored: StoredIdentity } {
    const secret = randomBytes(32);
    const pub = toB64(x25519Public(secret));
    return { identity: { publicKeys: { ek: pub }, secret }, stored: { v: 2, pub, secret: toB64(secret) } };
}

/** Returns null for anything that is not a stored identity of this version. */
export function loadIdentity(s: unknown): Identity | null {
    const st = s as Partial<StoredIdentity> | undefined;
    if (st?.v !== 2 || typeof st.pub !== "string" || typeof st.secret !== "string") return null;
    const secret = fromB64(st.secret);
    if (secret.length !== 32 || toB64(x25519Public(secret)) !== st.pub) return null;
    return { publicKeys: { ek: st.pub }, secret };
}

type Shared = { aead: Uint8Array; mac: Uint8Array };

/** Derives and caches the keys this identity shares with each peer. */
export class Keyring {
    private shared = new Map<string, Shared | null>();

    constructor(readonly identity: Identity) {}

    private keysWith(peer: string): Shared | null {
        let s = this.shared.get(peer);
        if (s === undefined) {
            const pub = typeof peer === "string" ? fromB64(peer) : new Uint8Array(0);
            if (pub.length !== 32) {
                s = null;
            } else {
                const secret = x25519(this.identity.secret, pub);
                s = { aead: hmacSha256(secret, text.encode("werewolf/aead")), mac: hmacSha256(secret, text.encode("werewolf/mac")) };
            }
            this.shared.set(peer, s);
        }
        return s;
    }

    /**
     * Seals `value` for the holder of `peer`'s secret. The plaintext is padded
     * to a multiple of `padTo` bytes so a box's length says nothing about what
     * is inside (a werewolf's dossier is longer than a villager's).
     */
    async seal(peer: string, value: unknown, padTo = 256): Promise<string> {
        const keys = this.keysWith(peer);
        if (!keys) throw new Error("bad peer key");
        const json = text.encode(JSON.stringify(value));
        // Trailing spaces are valid JSON whitespace.
        const plain = new Uint8Array(Math.ceil((json.length + 1) / padTo) * padTo).fill(0x20);
        plain.set(json);
        const nonce = randomBytes(12);
        return `${toB64(nonce)}.${toB64(chachaSeal(keys.aead, nonce, plain))}`;
    }

    /** Returns null when the box was not sealed between these two keys. */
    async open<T>(peer: string, box: string): Promise<T | null> {
        const keys = this.keysWith(peer);
        const [nonce, ct] = typeof box === "string" ? box.split(".") : [];
        if (!keys || !nonce || !ct) return null;
        try {
            const plain = chachaOpen(keys.aead, fromB64(nonce), fromB64(ct));
            return plain ? (JSON.parse(new TextDecoder().decode(plain)) as T) : null;
        } catch {
            return null;
        }
    }

    /** A tag only this identity and `peer` can produce. */
    async mac(peer: string, message: string): Promise<string> {
        const keys = this.keysWith(peer);
        if (!keys) throw new Error("bad peer key");
        return toB64(hmacSha256(keys.mac, text.encode(message)));
    }

    async verifyMac(peer: string, message: string, tag: unknown): Promise<boolean> {
        const keys = this.keysWith(peer);
        if (!keys || typeof tag !== "string") return false;
        return equal(hmacSha256(keys.mac, text.encode(message)), fromB64(tag));
    }
}

function toB64(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

function fromB64(s: string): Uint8Array {
    try {
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return new Uint8Array(0);
    }
}

export function randomId(n = 9): string {
    return toB64(randomBytes(n)).replace(/\+/g, "-").replace(/\//g, "_");
}

export function secureRandom(): number {
    const b = randomBytes(4);
    return (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0) / 2 ** 32;
}
