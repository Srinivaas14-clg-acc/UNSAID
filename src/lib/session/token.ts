/**
 * anon_token / organiser_token generation via crypto.getRandomValues()
 * (Web-standard, no new dependency, Cloudflare-safe). Both are opaque
 * strings, never JWTs, never guessable — per docs/API-CONTRACT.md §0.
 */

const TOKEN_BYTE_LENGTH = 32; // 256 bits of entropy

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateOpaqueToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function generateOrganiserToken(): string {
  return generateOpaqueToken();
}

export function generateAnonToken(): string {
  return generateOpaqueToken();
}
