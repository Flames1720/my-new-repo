/**
 * Supabase Realtime room manager for multiplayer FPS.
 * Uses Presence for roster + Broadcast for high-frequency game state.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { NetEvent, PlayerId, PlayerPresence, PlayerState, RoomInfo } from './types';

const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;

let sharedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (sharedClient) return sharedClient;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  sharedClient = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 40 } },
  });
  return sharedClient;
}

function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export class MultiplayerRoom {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private localId: PlayerId;
  private localName: string;
  private room: RoomInfo | null = null;
  private presence: Map<PlayerId, PlayerPresence> = new Map();
  private lastStates: Map<PlayerId, PlayerState> = new Map();

  onPresenceSync: (players: PlayerPresence[]) => void = () => {};
  onState: (state: PlayerState) => void = () => {};
  onEvent: (event: NetEvent) => void = () => {};
  onStatus: (status: string) => void = () => {};

  constructor(localId: PlayerId, localName = 'Player') {
    this.localId = localId;
    this.localName = localName.slice(0, 24);
    this.client = getClient();
  }

  get isConnected() {
    return !!this.channel;
  }

  get roomInfo() {
    return this.room;
  }

  get players(): PlayerPresence[] {
    return Array.from(this.presence.values());
  }

  /** Create a new room and join it as host. Returns the short room code. */
  async create(maxPlayers = 8): Promise<string | null> {
    if (!this.client) {
      this.onStatus('Supabase not configured');
      return null;
    }
    const code = makeRoomCode();
    return this.join(code, maxPlayers, true);
  }

  /** Join an existing room by code. */
  async join(code: string, maxPlayers = 8, asHost = false): Promise<string | null> {
    if (!this.client) {
      this.onStatus('Supabase not configured');
      return null;
    }
    await this.leave();

    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(normalized)) {
      this.onStatus('Invalid room code');
      return null;
    }

    const topic = `arena:${normalized}`;
    this.room = {
      code: normalized,
      channel: topic,
      hostId: asHost ? this.localId : undefined,
      maxPlayers,
    };

    this.channel = this.client.channel(topic, {
      config: {
        broadcast: { self: false },
        presence: { key: this.localId },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel!.presenceState();
        this.presence.clear();
        for (const [key, entries] of Object.entries(state)) {
          const entry = (entries as any[])[0];
          if (entry) {
            this.presence.set(key, {
              id: key,
              name: entry.name || 'Player',
              team: entry.team,
              ready: entry.ready,
              joinedAt: entry.joinedAt || Date.now(),
            });
          }
        }
        this.onPresenceSync(this.players);
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        const s = payload as PlayerState;
        if (s?.id && s.id !== this.localId) {
          this.lastStates.set(s.id, s);
          this.onState(s);
        }
      })
      .on('broadcast', { event: 'event' }, ({ payload }) => {
        const e = payload as NetEvent;
        if (e) this.onEvent(e);
      });

    const status = await new Promise<string>((resolve) => {
      this.channel!.subscribe((s) => {
        if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          resolve(s);
        }
      });
    });

    if (status !== 'SUBSCRIBED') {
      this.onStatus(`Room join failed: ${status}`);
      await this.leave();
      return null;
    }

    await this.channel.track({
      name: this.localName,
      joinedAt: Date.now(),
      ready: false,
    });

    this.onStatus(`Joined room ${normalized}`);
    return normalized;
  }

  /** Send high-frequency local player state (throttle externally to ~15–20 Hz). */
  sendState(state: Omit<PlayerState, 'id' | 't'>) {
    if (!this.channel) return;
    const payload: PlayerState = {
      ...state,
      id: this.localId,
      t: Date.now(),
    };
    void this.channel.send({
      type: 'broadcast',
      event: 'state',
      payload,
    });
  }

  /** Send discrete events (shoot, hit, death, match). */
  sendEvent(event: NetEvent) {
    if (!this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'event',
      payload: event,
    });
  }

  async leave() {
    if (this.channel) {
      await this.channel.untrack();
      await this.client?.removeChannel(this.channel);
      this.channel = null;
    }
    this.presence.clear();
    this.lastStates.clear();
    this.room = null;
    this.onStatus('Left room');
  }
}
