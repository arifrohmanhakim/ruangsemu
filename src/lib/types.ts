export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  peerId?: string;
}

export interface Room {
  id: string;
  name: string;
  hostUserId: string;
  createdAt: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  peer_id: string;
  name: string;
  x: number;
  y: number;
  current_area: string | null;
  last_seen: string;
  created_at: string;
}

export interface PeerState {
  x: number;
  y: number;
  name: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  text: string;
  sender: string;
  senderId: string;
  time: string;
  isSelf: boolean;
  isSystem: boolean;
}

export interface HistoryMessage {
  id: string;
  room_id: string;
  area_id: string;
  sender_user_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

export interface AreaConfig {
  id?: number;
  room_id: string;
  area_id: string;
  visibility: 'public' | 'private';
  pin: string | null;
  updated_at?: string;
}

export type MessageData =
  | { type: 'mv'; x: number; y: number; name: string }
  | { type: 'join'; peerId: string; name: string }
  | { type: 'pl'; peers: string[] }
  | { type: 'pj'; pid: string; name: string }
  | { type: 'chat'; text: string; time: string; areaId: string }
  | { type: 'nm'; name: string }
  | { type: 'typing'; typing: boolean };
