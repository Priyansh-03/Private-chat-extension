import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import { decryptMessage, encryptMessage } from "../../src/lib/crypto";

describe("encryptMessage / decryptMessage", () => {
  it("round-trips plaintext between two real keypairs", () => {
    const alice = nacl.box.keyPair();
    const bob = nacl.box.keyPair();
    const alicePub = encodeBase64(alice.publicKey);
    const aliceSecret = encodeBase64(alice.secretKey);
    const bobPub = encodeBase64(bob.publicKey);
    const bobSecret = encodeBase64(bob.secretKey);

    const { ciphertext, nonce } = encryptMessage("hello bob", bobPub, aliceSecret);
    const plaintext = decryptMessage(ciphertext, nonce, alicePub, bobSecret);

    expect(plaintext).toBe("hello bob");
  });

  it("fails to decrypt with the wrong secret key", () => {
    const alice = nacl.box.keyPair();
    const bob = nacl.box.keyPair();
    const mallory = nacl.box.keyPair();

    const { ciphertext, nonce } = encryptMessage("secret", encodeBase64(bob.publicKey), encodeBase64(alice.secretKey));
    const plaintext = decryptMessage(ciphertext, nonce, encodeBase64(alice.publicKey), encodeBase64(mallory.secretKey));

    expect(plaintext).toBeNull();
  });

  it("returns null instead of throwing on malformed base64 input", () => {
    expect(decryptMessage("not-base64!!!", "also-not-base64", "xx", "yy")).toBeNull();
  });
});
