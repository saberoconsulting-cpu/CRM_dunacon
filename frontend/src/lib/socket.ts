// src/lib/socket.ts
// Cliente de Socket.IO para actualizaciones en tiempo real
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let lastToken: string | null = null;
let firstFailureAt: number = 0;

export function getSocket(token: string): Socket {
  if (socket) return socket;
  // Si hubo un error hace menos de 10 s, devolvemos un socket "muerto" que no re-intenta en cada página.
  if (firstFailureAt && Date.now() - firstFailureAt < 10000) {
    return createLazyDead();
  }
  firstFailureAt = 0;
  lastToken = token;
  const socketUrl = process.env.NEXT_PUBLIC_API || (typeof window !== 'undefined' ? window.location.origin : undefined);
  socket = io(socketUrl, {
    // polling primero, luego intenta mejorar a websocket (opcional).
    // Así, si el reverse proxy no está enrutando wss, la app no rompe ni
    // llena la consola de "WebSocket connection failed": queda en polling.
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 900,
    timeout: 8000,
    auth: { token },
  });
  socket.on('connect_error', () => {
    if (!firstFailureAt) firstFailureAt = Date.now();
  });
  return socket;
}

let deadSocket: Socket | null = null;
function createLazyDead(): Socket {
  if (deadSocket) return deadSocket;
  deadSocket = io('http://localhost:1', { reconnection: false, autoConnect: false }) as Socket;
  return deadSocket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
