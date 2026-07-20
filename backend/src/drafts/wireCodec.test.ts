import { describe, expect, it } from "vitest";
import { decodeUpdateBase64, encodeUpdateBase64 } from "./wireCodec";

// Mirrors the frontend btoa-based encoder in useCollaborativeDraft.ts so we can
// assert the two independent implementations agree on the wire format.
function frontendEncodeBase64(update: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < update.length; index += 1) {
    binary += String.fromCharCode(update[index]!);
  }
  return btoa(binary);
}

function frontendDecodeBase64(updateBase64: string): Uint8Array {
  const binary = atob(updateBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

describe("wireCodec", () => {
  it("round-trips arbitrary bytes including values > 127", () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 200, 254, 255]);
    const decoded = decodeUpdateBase64(encodeUpdateBase64(original));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("round-trips an empty array", () => {
    const decoded = decodeUpdateBase64(encodeUpdateBase64(new Uint8Array()));
    expect(decoded.length).toBe(0);
  });

  it("round-trips a large random payload", () => {
    const original = new Uint8Array(4096);
    for (let index = 0; index < original.length; index += 1) {
      original[index] = Math.floor(Math.random() * 256);
    }
    const decoded = decodeUpdateBase64(encodeUpdateBase64(original));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("produces the same base64 as the frontend btoa-based encoder", () => {
    const payloads: Uint8Array[] = [
      new Uint8Array([0, 1, 2, 3]),
      new Uint8Array([128, 200, 255]),
      new Uint8Array([255, 254, 253, 128, 64, 32, 1, 0]),
    ];

    for (const payload of payloads) {
      expect(encodeUpdateBase64(payload)).toBe(frontendEncodeBase64(payload));
    }
  });

  it("decodes base64 produced by the frontend encoder", () => {
    const original = new Uint8Array([13, 200, 42, 255, 0, 99]);
    const encodedByFrontend = frontendEncodeBase64(original);

    expect(Array.from(decodeUpdateBase64(encodedByFrontend))).toEqual(Array.from(original));
    expect(Array.from(frontendDecodeBase64(encodeUpdateBase64(original)))).toEqual(
      Array.from(original),
    );
  });
});
