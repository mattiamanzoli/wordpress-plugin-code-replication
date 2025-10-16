// Shared in-memory storage for QR-Seatable bridge
// This module ensures both API routes use the same data structure

export interface SessionMessage {
  id: string;
  ver: number;
  time: number;
}

// Global store for session messages
export const sessionMessages = new Map<string, SessionMessage>();

// TTL for messages (in milliseconds) - default 5 minutes
export const MESSAGE_TTL = 5 * 60 * 1000;

// Cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

// Initialize cleanup process
export function initCleanup() {
  if (cleanupInterval) return; // Already initialized

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [session, data] of sessionMessages.entries()) {
      if (now - data.time * 1000 > MESSAGE_TTL) {
        sessionMessages.delete(session);
      }
    }
  }, 60000); // Clean every minute
}

// Start cleanup immediately when module loads
initCleanup();