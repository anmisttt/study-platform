export function encodeUpdateBase64(update: Uint8Array): string {
  return Buffer.from(update).toString("base64");
}

export function decodeUpdateBase64(updateBase64: string): Uint8Array {
  return new Uint8Array(Buffer.from(updateBase64, "base64"));
}
