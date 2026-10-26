import assert from "node:assert/strict";
import * as node from "node:crypto";
import { test } from "node:test";
import { chachaOpen, chachaSeal, hmacSha256, sha256, x25519, x25519Public } from "../src/primitives";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

test("SHA-256 and HMAC match Node across lengths", () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 200, 4096]) {
        const data = node.randomBytes(n);
        assert.equal(hex(sha256(data)), node.createHash("sha256").update(data).digest("hex"), `sha256 of ${n} bytes`);
        const key = node.randomBytes(n % 3 === 0 ? 80 : 32);
        assert.equal(hex(hmacSha256(key, data)), node.createHmac("sha256", key).update(data).digest("hex"), `hmac of ${n} bytes`);
    }
});

test("X25519 matches RFC 7748 and agrees with Node", () => {
    assert.equal(
        hex(x25519(bytes("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4"), bytes("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c"))),
        "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552"
    );
    assert.equal(
        hex(x25519Public(bytes("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a"))),
        "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a"
    );
    for (let i = 0; i < 5; i++) {
        const a = node.generateKeyPairSync("x25519");
        const b = node.generateKeyPairSync("x25519");
        const aPriv = new Uint8Array(a.privateKey.export({ format: "jwk" }).d ? Buffer.from(a.privateKey.export({ format: "jwk" }).d!, "base64url") : []);
        const bPub = new Uint8Array(Buffer.from(b.publicKey.export({ format: "jwk" }).x!, "base64url"));
        const expected = node.diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });
        assert.equal(hex(x25519(aPriv, bPub)), expected.toString("hex"));
        assert.equal(hex(x25519Public(aPriv)), Buffer.from(a.publicKey.export({ format: "jwk" }).x!, "base64url").toString("hex"));
    }
});

test("ChaCha20-Poly1305 matches Node and rejects tampering", () => {
    for (const n of [0, 1, 15, 16, 17, 64, 65, 4096]) {
        const key = node.randomBytes(32);
        const nonce = node.randomBytes(12);
        const plain = node.randomBytes(n);
        const aad = node.randomBytes(n % 20);
        const cipher = node.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
        cipher.setAAD(aad, { plaintextLength: n });
        const expected = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
        const sealed = chachaSeal(key, nonce, plain, aad);
        assert.equal(hex(sealed), expected.toString("hex"), `seal of ${n} bytes`);
        assert.equal(hex(chachaOpen(key, nonce, sealed, aad)!), hex(plain));
        const bad = sealed.slice();
        bad[0] ^= 1;
        assert.equal(chachaOpen(key, nonce, bad, aad), null);
        assert.equal(chachaOpen(node.randomBytes(32), nonce, sealed, aad), null);
    }
});
