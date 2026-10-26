/**
 * Plain-TypeScript cryptography. Drawdy's driver worker has no
 * `crypto.subtle`, and extensions may not import packages, so the game
 * carries its own: SHA-256 and HMAC (RFC 2104), X25519 (RFC 7748) and
 * ChaCha20-Poly1305 (RFC 8439). test/primitives.test.ts checks each one
 * against Node's native implementation. None of this is constant-time;
 * it guards a party game, not a bank.
 */

// ---------------------------------------------------------------------------
// SHA-256

const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
    0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
    0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
    0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
    padded.set(data);
    padded[data.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 2 ** 32));
    view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] += a;
        h[1] += b;
        h[2] += c;
        h[3] += d;
        h[4] += e;
        h[5] += f;
        h[6] += g;
        h[7] += hh;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
    return out;
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    const k = new Uint8Array(64);
    k.set(key.length > 64 ? sha256(key) : key);
    const inner = new Uint8Array(64 + data.length);
    const outer = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) {
        inner[i] = k[i] ^ 0x36;
        outer[i] = k[i] ^ 0x5c;
    }
    inner.set(data, 64);
    outer.set(sha256(inner), 64);
    return sha256(outer);
}

// ---------------------------------------------------------------------------
// X25519

const P = 2n ** 255n - 19n;
const A24 = 121665n;

const mod = (a: bigint) => {
    const r = a % P;
    return r >= 0n ? r : r + P;
};

function powMod(b: bigint, e: bigint): bigint {
    let r = 1n;
    b = mod(b);
    while (e > 0n) {
        if (e & 1n) r = mod(r * b);
        b = mod(b * b);
        e >>= 1n;
    }
    return r;
}

function fromLE(bytes: Uint8Array): bigint {
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    return n;
}

function toLE(n: bigint, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        out[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    return out;
}

export function x25519(scalar: Uint8Array, u: Uint8Array): Uint8Array {
    const k = scalar.slice(0, 32);
    k[0] &= 248;
    k[31] &= 127;
    k[31] |= 64;
    const kn = fromLE(k);
    const uc = u.slice(0, 32);
    uc[31] &= 127;
    const x1 = mod(fromLE(uc));
    let [x2, z2, x3, z3] = [1n, 0n, x1, 1n];
    let swap = 0n;
    for (let t = 254; t >= 0; t--) {
        const bit = (kn >> BigInt(t)) & 1n;
        if (swap ^ bit) [x2, x3, z2, z3] = [x3, x2, z3, z2];
        swap = bit;
        const a = mod(x2 + z2);
        const aa = mod(a * a);
        const b = mod(x2 - z2);
        const bb = mod(b * b);
        const e = mod(aa - bb);
        const c = mod(x3 + z3);
        const d = mod(x3 - z3);
        const da = mod(d * a);
        const cb = mod(c * b);
        x3 = mod((da + cb) ** 2n);
        z3 = mod(x1 * (da - cb) ** 2n);
        x2 = mod(aa * bb);
        z2 = mod(e * (aa + A24 * e));
    }
    if (swap) [x2, z2] = [x3, z3];
    return toLE(mod(x2 * powMod(z2, P - 2n)), 32);
}

const BASE = (() => {
    const b = new Uint8Array(32);
    b[0] = 9;
    return b;
})();

export function x25519Public(secret: Uint8Array): Uint8Array {
    return x25519(secret, BASE);
}

// ---------------------------------------------------------------------------
// ChaCha20-Poly1305

function chachaBlock(key: Uint32Array, counter: number, nonce: Uint32Array, out: Uint8Array): void {
    const s = new Uint32Array(16);
    s[0] = 0x61707865;
    s[1] = 0x3320646e;
    s[2] = 0x79622d32;
    s[3] = 0x6b206574;
    s.set(key, 4);
    s[12] = counter >>> 0;
    s.set(nonce, 13);
    const x = s.slice();
    const qr = (a: number, b: number, c: number, d: number) => {
        x[a] += x[b];
        x[d] ^= x[a];
        x[d] = (x[d] << 16) | (x[d] >>> 16);
        x[c] += x[d];
        x[b] ^= x[c];
        x[b] = (x[b] << 12) | (x[b] >>> 20);
        x[a] += x[b];
        x[d] ^= x[a];
        x[d] = (x[d] << 8) | (x[d] >>> 24);
        x[c] += x[d];
        x[b] ^= x[c];
        x[b] = (x[b] << 7) | (x[b] >>> 25);
    };
    for (let i = 0; i < 10; i++) {
        qr(0, 4, 8, 12);
        qr(1, 5, 9, 13);
        qr(2, 6, 10, 14);
        qr(3, 7, 11, 15);
        qr(0, 5, 10, 15);
        qr(1, 6, 11, 12);
        qr(2, 7, 8, 13);
        qr(3, 4, 9, 14);
    }
    const view = new DataView(out.buffer, out.byteOffset, 64);
    for (let i = 0; i < 16; i++) view.setUint32(i * 4, (x[i] + s[i]) >>> 0, true);
}

function words(bytes: Uint8Array): Uint32Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const out = new Uint32Array(bytes.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = view.getUint32(i * 4, true);
    return out;
}

function chacha20(key: Uint8Array, nonce: Uint8Array, counter: number, data: Uint8Array): Uint8Array {
    const k = words(key);
    const n = words(nonce);
    const out = new Uint8Array(data.length);
    const block = new Uint8Array(64);
    for (let off = 0; off < data.length; off += 64) {
        chachaBlock(k, counter++, n, block);
        const end = Math.min(64, data.length - off);
        for (let i = 0; i < end; i++) out[off + i] = data[off + i] ^ block[i];
    }
    return out;
}

const P1305 = 2n ** 130n - 5n;

function poly1305(key: Uint8Array, msg: Uint8Array): Uint8Array {
    const r = fromLE(key.slice(0, 16)) & 0x0ffffffc0ffffffc0ffffffc0fffffffn;
    const s = fromLE(key.slice(16, 32));
    let acc = 0n;
    for (let off = 0; off < msg.length; off += 16) {
        const chunk = msg.slice(off, off + 16);
        const n = fromLE(chunk) | (1n << BigInt(chunk.length * 8));
        acc = ((acc + n) * r) % P1305;
    }
    return toLE((acc + s) & ((1n << 128n) - 1n), 16);
}

function macData(aad: Uint8Array, ct: Uint8Array): Uint8Array {
    const pad = (n: number) => (16 - (n % 16)) % 16;
    const out = new Uint8Array(aad.length + pad(aad.length) + ct.length + pad(ct.length) + 16);
    out.set(aad, 0);
    out.set(ct, aad.length + pad(aad.length));
    const lens = new DataView(out.buffer, out.length - 16);
    lens.setUint32(0, aad.length, true);
    lens.setUint32(8, ct.length, true);
    return out;
}

/** Returns ciphertext followed by the 16-byte tag. */
export function chachaSeal(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array, aad: Uint8Array = new Uint8Array(0)): Uint8Array {
    const otk = chacha20(key, nonce, 0, new Uint8Array(32));
    const ct = chacha20(key, nonce, 1, plain);
    const out = new Uint8Array(ct.length + 16);
    out.set(ct);
    out.set(poly1305(otk, macData(aad, ct)), ct.length);
    return out;
}

/** Returns the plaintext, or null when the tag does not match. */
export function chachaOpen(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array, aad: Uint8Array = new Uint8Array(0)): Uint8Array | null {
    if (sealed.length < 16) return null;
    const ct = sealed.slice(0, sealed.length - 16);
    const tag = sealed.slice(sealed.length - 16);
    const otk = chacha20(key, nonce, 0, new Uint8Array(32));
    if (!equal(poly1305(otk, macData(aad, ct)), tag)) return null;
    return chacha20(key, nonce, 1, ct);
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

// ---------------------------------------------------------------------------
// Randomness

/** `getRandomValues` exists outside secure contexts too; the fallback only covers hosts that strip it entirely. */
export function randomBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
    if (c?.getRandomValues) return c.getRandomValues(out);
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
}
