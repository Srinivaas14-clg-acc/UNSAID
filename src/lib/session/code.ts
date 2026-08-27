import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 4-char join code generator, unambiguous alphabet (no 0/O/1/I), collision-
 * checked against the DB before returning.
 */

// Excludes 0/O and 1/I to avoid visual ambiguity on a phone screen.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 20;

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/**
 * Generates a 4-char join code and verifies it isn't already in use in
 * `sessions`. Retries up to MAX_ATTEMPTS times on collision. Throws if
 * exhausted — the caller (POST /api/sessions) maps this to `internal_error`
 * (500) per API-CONTRACT.md.
 */
export async function generateUniqueSessionCode(): Promise<string> {
  const supabase = getSupabaseServerClient();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();

    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw new Error(`Join code collision check failed: ${error.message}`);
    }

    if (!data) {
      return code;
    }
  }

  throw new Error("Join code generation exhausted retries");
}
