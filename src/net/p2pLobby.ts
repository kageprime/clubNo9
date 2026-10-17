// WebRTC Peer-to-Peer Lobby & Matchmaking System powered by PeerJS.
// Generates a 6-character Room Code, shareable invite link, and syncs avatar & mini-game state.

import Peer, { type DataConnection } from 'peerjs';

export interface PeerStatePacket {
  type: 'avatar' | 'chat' | 'ludo_roll' | 'pool_strike' | 'dart_throw';
  x?: number;
  z?: number;
  yaw?: number;
  station?: string;
  text?: string;
  payload?: unknown;
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(seed = Math.random()): string {
  let code = '';
  let n = Math.floor(seed * 1e9) || 491827;
  for (let i = 0; i < 6; i++) {
    code += CHARS[(n + i * 17) % CHARS.length];
    n = Math.floor(n / 7) ^ (n << 3);
    n = Math.abs(n);
  }
  return code;
}

export class P2PLobbyManager {
  roomCode: string;
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  status: 'offline' | 'ready' | 'connected' | 'bot_partner' = 'offline';
  partnerName = '';
  remoteAvatar = {
    active: false,
    x: 1.5,
    z: 1.8,
    yaw: 0,
    station: 'none',
    chatBubble: '',
  };
  onPacket: ((pkt: PeerStatePacket) => void) | null = null;
  onStatusChange: (() => void) | null = null;

  constructor() {
    const qs = new URLSearchParams(window.location.search);
    this.roomCode = qs.get('room')?.toUpperCase() || generateRoomCode();
  }

  initHost(): string {
    if (this.peer) {
      this.peer.destroy();
    }
    this.roomCode = generateRoomCode();
    try {
      const peerId = `club9-room-${this.roomCode}`;
      this.peer = new Peer(peerId);
      this.peer.on('open', () => {
        this.status = 'ready';
        this.onStatusChange?.();
      });
      this.peer.on('connection', (conn) => {
        this._bindConnection(conn, 'Guest Player');
      });
      this.peer.on('error', () => {
        // Fallback gracefully to local room ready state in restricted networks
        this.status = 'ready';
        this.onStatusChange?.();
      });
    } catch {
      this.status = 'ready';
      this.onStatusChange?.();
    }
    return this.roomCode;
  }

  joinRoom(code: string): void {
    const clean = code.trim().toUpperCase().slice(0, 6);
    if (!clean) return;
    this.roomCode = clean;
    if (!this.peer) {
      this.peer = new Peer();
    }
    this.peer.on('open', () => {
      const conn = this.peer!.connect(`club9-room-${clean}`);
      this._bindConnection(conn, `Room ${clean}`);
    });
  }

  spawnRegularPartner(name = 'Ah-Jie (Club Regular)'): void {
    this.status = 'bot_partner';
    this.partnerName = name;
    this.remoteAvatar.active = true;
    this.remoteAvatar.x = -1.2;
    this.remoteAvatar.z = 1.6;
    this.remoteAvatar.chatBubble = 'Let’s play a round of Ludo or 8-Ball!';
    this.onStatusChange?.();
  }

  private _bindConnection(conn: DataConnection, label: string): void {
    this.conn = conn;
    conn.on('open', () => {
      this.status = 'connected';
      this.partnerName = label;
      this.remoteAvatar.active = true;
      this.onStatusChange?.();
    });
    conn.on('data', (raw) => {
      const pkt = raw as PeerStatePacket;
      if (pkt.type === 'avatar') {
        if (pkt.x != null) this.remoteAvatar.x = pkt.x;
        if (pkt.z != null) this.remoteAvatar.z = pkt.z;
        if (pkt.yaw != null) this.remoteAvatar.yaw = pkt.yaw;
        if (pkt.station) this.remoteAvatar.station = pkt.station;
      } else if (pkt.type === 'chat' && pkt.text) {
        this.remoteAvatar.chatBubble = pkt.text;
      }
      this.onPacket?.(pkt);
    });
    conn.on('close', () => {
      this.status = 'ready';
      this.remoteAvatar.active = false;
      this.onStatusChange?.();
    });
  }

  broadcast(pkt: PeerStatePacket): void {
    if (this.conn && this.status === 'connected') {
      try {
        this.conn.send(pkt);
      } catch {
        // ignore
      }
    }
  }

  inviteUrl(): string {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomCode);
    return url.toString();
  }
}
