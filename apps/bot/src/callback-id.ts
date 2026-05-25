import { randomBytes } from "node:crypto";

const CALLBACK_ID_BYTES = 8;

export function createCallbackId(): string {
  return randomBytes(CALLBACK_ID_BYTES).toString("base64url");
}
