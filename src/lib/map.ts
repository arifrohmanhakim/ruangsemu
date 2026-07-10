// Ngumpul — Map Definition
// Tile-based map with rooms, walls, doors, and collision detection

export interface RoomDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  door: DoorDef;
}

export interface DoorDef {
  x: number;
  y: number;
  w: number; // door opening width
  /** 'top' | 'bottom' | 'left' | 'right' — which wall the door is on */
  side: 'top' | 'bottom' | 'left' | 'right';
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const MAP_W = 1200;
export const MAP_H = 900;
export const TILE = 40;
export const AVATAR_R = 16;

// ─── ROOM DEFINITIONS ─────────────────────────────────
// All rooms are enclosed spaces with walls and exactly one door each.
// Wall thickness = 8px (rendered as solid fill)

export const ROOMS: RoomDef[] = [
  {
    id: 'ruang_kerja',
    name: 'Ruang Kerja 💼',
    x: 30,
    y: 30,
    w: 360,
    h: 280,
    color: 'rgba(72, 202, 228, 0.07)',
    door: { x: 315, y: 310, w: 70, side: 'bottom' },
  },
  {
    id: 'pantry',
    name: 'Pantry 🍕',
    x: 470,
    y: 30,
    w: 360,
    h: 280,
    color: 'rgba(255, 179, 71, 0.07)',
    door: { x: 470, y: 145, w: 70, side: 'left' },
  },
  {
    id: 'meeting',
    name: 'Meeting Room 📊',
    x: 30,
    y: 430,
    w: 360,
    h: 280,
    color: 'rgba(255, 65, 98, 0.07)',
    door: { x: 315, y: 430, w: 70, side: 'top' },
  },
];

// ─── CUSTOM ROOMS (loaded from Supabase, created by owner) ───
let customRooms: RoomDef[] = [];

/** Set custom rooms from DB. Call once on mount. */
export function setCustomRooms(rooms: RoomDef[]) {
  customRooms = rooms;
}

/** Add one custom room (after creation). */
export function addCustomRoom(room: RoomDef) {
  customRooms.push(room);
}

/** Get all rooms (static + custom). */
export function getAllRooms(): RoomDef[] {
  return [...ROOMS, ...customRooms];
}

// ─── WALL SEGMENTS ────────────────────────────────────
// Auto-generated from room definitions.
// Each room's 4 walls minus the door opening.

const WALL_T = 8; // wall thickness used in rendering (visual)
const DOOR_HALF = 8; // extra padding for collision around doors

const wallSegmentsCache: WallSegment[] | null = null;

export function getWallSegments(): WallSegment[] {
  const walls: WallSegment[] = [];

  for (const room of getAllRooms()) {
    const x1 = room.x;
    const y1 = room.y;
    const x2 = room.x + room.w;
    const y2 = room.y + room.h;
    const d = room.door;
    const dh = DOOR_HALF;

    // Top wall
    if (d.side === 'top') {
      walls.push({ x1, y1, x2: d.x - dh, y2: y1 });
      walls.push({ x1: d.x + d.w + dh, y1, x2, y2: y1 });
    } else {
      walls.push({ x1, y1, x2, y2: y1 });
    }

    // Bottom wall
    if (d.side === 'bottom') {
      walls.push({ x1, y1: y2, x2: d.x - dh, y2 });
      walls.push({ x1: d.x + d.w + dh, y1: y2, x2, y2 });
    } else {
      walls.push({ x1, y1: y2, x2, y2 });
    }

    // Left wall
    if (d.side === 'left') {
      walls.push({ x1, y1, x2: x1, y2: d.y - dh });
      walls.push({ x1, y1: d.y + d.w + dh, x2: x1, y2 });
    } else {
      walls.push({ x1, y1, x2: x1, y2 });
    }

    // Right wall
    if (d.side === 'right') {
      walls.push({ x1: x2, y1, x2: x2, y2: d.y - dh });
      walls.push({ x1: x2, y1: d.y + d.w + dh, x2, y2 });
    } else {
      walls.push({ x1: x2, y1, x2: x2, y2 });
    }
  }

  // Outer boundary walls (map edge)
  walls.push({ x1: 0, y1: 0, x2: MAP_W, y2: 0 });
  walls.push({ x1: 0, y1: MAP_H, x2: MAP_W, y2: MAP_H });
  walls.push({ x1: 0, y1: 0, x2: 0, y2: MAP_H });
  walls.push({ x1: MAP_W, y1: 0, x2: MAP_W, y2: MAP_H });

  return walls;
}

// ─── COLLISION DETECTION ──────────────────────────────
// Circle vs line segment intersection test.

function distPointSegment(
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    // Degenerate segment (point)
    return Math.sqrt((cx - x1) ** 2 + (cy - y1) ** 2);
  }

  let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
}

export function checkCollision(
  x: number,
  y: number,
  r: number,
  walls: WallSegment[]
): boolean {
  for (const w of walls) {
    const dist = distPointSegment(x, y, w.x1, w.y1, w.x2, w.y2);
    if (dist < r) return true;
  }
  return false;
}

/**
 * Try to move from (x, y) by (dx, dy). Returns the new position after
 * collision resolution (slide along walls).
 */
export function tryMove(
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
  walls: WallSegment[]
): { x: number; y: number } {
  let nx = x;
  let ny = y;

  // Try X movement
  if (dx !== 0) {
    const tx = x + dx;
    if (!checkCollision(tx, y, r, walls)) {
      nx = tx;
    }
  }

  // Try Y movement (from potentially updated X)
  if (dy !== 0) {
    const ty = y + dy;
    if (!checkCollision(nx, ty, r, walls)) {
      ny = ty;
    }
  }

  return { x: nx, y: ny };
}

// ─── ROOM DETECTION ───────────────────────────────────
/**
 * Detect which room a point is inside.
 * Returns the room id, or null if in the corridor.
 */
export function detectRoom(x: number, y: number): string | null {
  for (const room of getAllRooms()) {
    if (
      x >= room.x &&
      x <= room.x + room.w &&
      y >= room.y &&
      y <= room.y + room.h
    ) {
      return room.id;
    }
  }
  return null;
}

/**
 * Get a safe position outside a room's door.
 * Used to push avatar back when private room is blocked.
 */
export function getDoorOutsidePos(roomId: string): { x: number; y: number } | null {
  const room = getAllRooms().find((r) => r.id === roomId);
  if (!room) return null;

  const d = room.door;
  const margin = 24; // jarak dari pintu biar gak nempel

  switch (d.side) {
    case 'bottom':
      // Pintu di dinding bawah → luar ada di bawah
      return { x: d.x + d.w / 2, y: room.y + room.h + margin };
    case 'top':
      // Pintu di dinding atas → luar ada di atas
      return { x: d.x + d.w / 2, y: room.y - margin };
    case 'left':
      // Pintu di dinding kiri → luar ada di kiri
      return { x: room.x - margin, y: d.y + d.w / 2 };
    case 'right':
      // Pintu di dinding kanan → luar ada di kanan
      return { x: room.x + room.w + margin, y: d.y + d.w / 2 };
  }
}

/**
 * Get a RoomDef by id.
 */
export function getRoomById(id: string): RoomDef | undefined {
  return getAllRooms().find((r) => r.id === id);
}

/**
 * Auto-find the next available position for a new room.
 * Uses a simple grid: columns of (w+gap), rows of (h+gap).
 */
export function findNextRoomPos(w: number, h: number, gap = 40): { x: number; y: number } {
  const existing = getAllRooms();
  // Try positions in a 3-column grid
  const cols = 3;
  const roomW = w;
  const roomH = h;
  const startX = 30;
  const startY = 30;
  const colGap = 80; // gap between columns
  const rowGap = 80; // gap between rows

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = startX + col * (roomW + colGap);
      const cy = startY + row * (roomH + rowGap);

      // Check boundaries
      if (cx + roomW > MAP_W - 30 || cy + roomH > MAP_H - 30) continue;

      // Check overlap with existing rooms
      let overlaps = false;
      for (const r of existing) {
        if (
          cx < r.x + r.w + gap &&
          cx + roomW + gap > r.x &&
          cy < r.y + r.h + gap &&
          cy + roomH + gap > r.y
        ) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return { x: cx, y: cy };
    }
  }
  // Fallback
  return { x: 30, y: 30 + existing.length * (roomH + rowGap) };
}
