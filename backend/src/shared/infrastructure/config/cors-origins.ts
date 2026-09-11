// shared/infrastructure/config/cors-origins.ts
// Orígenes permitidos (HTTP y WebSocket) — única fuente de verdad para no
// tener listas que se desincronicen entre main.ts y el gateway de sockets.
const KNOWN_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://crm.saberoconsulting.com',
  'https://crm.dunacon.pe',
];

export function getAllowedOrigins(): string[] {
  const extraFromEnv = process.env.FRONTEND_URL;
  const extra = extraFromEnv ? extraFromEnv.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...KNOWN_ORIGINS, ...extra]));
}
