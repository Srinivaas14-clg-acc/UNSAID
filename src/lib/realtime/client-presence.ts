/**
 * Client-side Supabase Realtime Presence helper.
 *
 * Named distinctly from whatever backend-lead creates in src/lib/realtime/
 * (e.g. presence.ts, a server-side wrapper) to avoid collision — this file
 * is the browser-side counterpart, used directly from PresenceBadge via
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Degrades gracefully: if the public env vars are unset, joinPresenceChannel
 * returns null and callers fall back to polling GET /presence.
 */

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

let _browserClient: ReturnType<typeof createClient> | null = null;

function getBrowserClient() {
  if (_browserClient) return _browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  _browserClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _browserClient;
}

export interface PresenceChannelHandle {
  channel: RealtimeChannel;
  leave: () => void;
}

/**
 * Joins a presence channel scoped to a session code. `onSync` fires whenever
 * the presence state changes with the current count of tracked participants.
 * Returns null if Supabase public env vars aren't configured — caller should
 * fall back to the /presence polling route in that case.
 */
export function joinPresenceChannel(
  code: string,
  selfKey: string,
  onSync: (count: number) => void
): PresenceChannelHandle | null {
  const client = getBrowserClient();
  if (!client) return null;

  const channel = client.channel(`session:${code}:presence`, {
    config: { presence: { key: selfKey } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      onSync(Object.keys(state).length);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ online_at: new Date().toISOString() });
      }
    });

  return {
    channel,
    leave: () => {
      client.removeChannel(channel);
    },
  };
}
