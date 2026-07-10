const ADJS = [
  'Lucid', 'Swift', 'Brave', 'Witty', 'Calm', 'Wild', 'Cool', 'Neon',
  'Lunar', 'Solar', 'Hazy', 'Zen', 'Rapid', 'Dusk', 'Frost', 'Ember'
];
const NOUNS = [
  'Cat', 'Fox', 'Owl', 'Bear', 'Wolf', 'Deer', 'Mole', 'Moth',
  'Bat', 'Hawk', 'Lynx', 'Puma', 'Mink', 'Crow', 'Elk', 'Vole'
];

export function generatePeerId(): string {
  const adj = ADJS[Math.floor(Math.random() * ADJS.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return adj + noun + num;
}

export function getPeerId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('ruangsemu_peer_id');
  if (!id) {
    id = generatePeerId();
    localStorage.setItem('ruangsemu_peer_id', id);
  }
  return id;
}

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RM-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const BROADCAST_MS = 50;

export function clock(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "&#039;");
}

export function randomPos() {
  return {
    x: 200 + Math.random() * 400,
    y: Math.round(450 + (Math.random() - 0.5) * 200),
  };
}
