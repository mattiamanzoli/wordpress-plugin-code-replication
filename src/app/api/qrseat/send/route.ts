import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Data directory for persistent storage
const DATA_DIR = path.join(process.cwd(), '.qrseat-data');

// Message data stored on disk
interface SessionMessage {
  id: string;
  ver: number;
  timestamp: number;
  expiresAt?: number;
}

// CRITICAL: Session data structure with message history
interface SessionData {
  session: string;
  lastVer?: number;
  messages: SessionMessage[];
}

const DEFAULT_MESSAGE_TTL = 5 * 60 * 1000; // 5 minutes
const MIN_MESSAGE_TTL = 60 * 1000; // 1 minute
const MAX_MESSAGE_TTL = 60 * 60 * 1000; // 60 minutes

function sanitizeTTL(rawTtl: unknown): number {
  const parsed = Number(rawTtl);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MESSAGE_TTL;
  }

  if (parsed < MIN_MESSAGE_TTL) {
    return MIN_MESSAGE_TTL;
  }

  if (parsed > MAX_MESSAGE_TTL) {
    return MAX_MESSAGE_TTL;
  }

  return Math.round(parsed);
}

// Session status structure
interface SessionStatus {
  session: string;
  active: boolean;
  lastUpdate: number;
}

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Directory already exists
  }
}

// Clean up old session files (>24h)
async function cleanupOldFiles() {
  try {
    await ensureDataDir();
    const files = await fs.readdir(DATA_DIR);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(DATA_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filePath);
        console.log(`[QRSeat] Cleaned up old session file: ${file}`);
      }
    }
  } catch (err) {
    console.error('[QRSeat] Cleanup error:', err);
  }
}

function purgeExpiredMessages(sessionData: SessionData, now = Date.now()): boolean {
  const originalLength = sessionData.messages.length;

  sessionData.messages = sessionData.messages.filter((message) => {
    const ttlFallback = DEFAULT_MESSAGE_TTL;
    const expiresAt = message.expiresAt ?? (message.timestamp + ttlFallback);
    return expiresAt > now;
  });

  return sessionData.messages.length !== originalLength;
}

function ensureLastVersion(sessionData: SessionData): void {
  if (typeof sessionData.lastVer !== 'number') {
    const highestVersion = sessionData.messages.reduce((max, message) => {
      return message.ver > max ? message.ver : max;
    }, 0);

    sessionData.lastVer = highestVersion;
  }
}

// CRITICAL: Load session data with message history
async function loadSessionData(session: string): Promise<SessionData> {
  const filePath = path.join(DATA_DIR, `${session}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Ensure data has messages array
    if (!data.messages || !Array.isArray(data.messages)) {
      return { session, messages: [], lastVer: 0 };
    }

    const sessionData: SessionData = {
      session,
      lastVer: typeof data.lastVer === 'number' ? data.lastVer : undefined,
      messages: data.messages.map((message: any) => ({
        id: String(message.id ?? ''),
        ver: Number(message.ver ?? 0),
        timestamp: Number(message.timestamp ?? Date.now()),
        expiresAt: typeof message.expiresAt === 'number' ? message.expiresAt : undefined,
      })),
    };

    // Remove any stale message before returning
    const removed = purgeExpiredMessages(sessionData);
    ensureLastVersion(sessionData);

    if (removed) {
      await saveSessionData(sessionData);
    }

    return sessionData;
  } catch {
    // File doesn't exist or is invalid
    return { session, messages: [], lastVer: 0 };
  }
}

// CRITICAL: Save session data with full message history
async function saveSessionData(data: SessionData) {
  ensureLastVersion(data);
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${data.session}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// CRITICAL: Check if ID already exists in message history
function findExistingMessage(sessionData: SessionData, id: string): number | null {
  const now = Date.now();
  const existing = sessionData.messages.find(msg => {
    const expiresAt = msg.expiresAt ?? (msg.timestamp + DEFAULT_MESSAGE_TTL);
    return msg.id === id && expiresAt > now;
  });
  return existing ? existing.ver : null;
}

// CRITICAL: Check if session is active
async function loadSessionStatus(session: string): Promise<SessionStatus> {
  const filePath = path.join(DATA_DIR, `${session}-status.json`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as SessionStatus;
  } catch {
    // File doesn't exist or is invalid - default to inactive
    return { session, active: false, lastUpdate: Date.now() };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session, id, messageTTL } = body;

    if (!session || !id) {
      return NextResponse.json(
        { ok: false, error: 'Missing session or id' },
        { status: 400 }
      );
    }

    const ttl = sanitizeTTL(messageTTL);

    // CRITICAL: Check if session is active BEFORE accepting message
    const sessionStatus = await loadSessionStatus(session);
    if (!sessionStatus.active) {
      console.log(`[BLOCKED] Messaggio rifiutato: sessione ${session} NON ATTIVA`);
      return NextResponse.json(
        { ok: false, error: 'Session not active', sessionActive: false },
        { status: 403 }
      );
    }

    // CRITICAL: Load existing session data
    const sessionData = await loadSessionData(session);

    // CRITICAL: Check if ID already sent in this session's history
    const existingVer = findExistingMessage(sessionData, id);
    if (existingVer !== null) {
      console.log(`[DUPLICATE] ID "${id}" già inviato per sessione ${session} (versione: ${existingVer})`);
      return NextResponse.json({
        ok: true,
        ver: existingVer,
        time: Date.now(),
        duplicate: true
      });
    }

    // CRITICAL: Create new message with incremented version
    const newVer = (sessionData.lastVer ?? sessionData.messages.length) + 1;
    sessionData.lastVer = newVer;

    const now = Date.now();

    sessionData.messages.push({
      id,
      ver: newVer,
      timestamp: now,
      expiresAt: now + ttl,
    });

    // Save updated session data
    await saveSessionData(sessionData);

    console.log(`[QRSeat] New message saved: session=${session}, id=${id}, ver=${newVer}`);
    
    // Cleanup old files (don't await, run in background)
    cleanupOldFiles().catch(console.error);

    return NextResponse.json({ ok: true, ver: newVer, time: Date.now() });
  } catch (error) {
    console.error('[QRSeat] Send error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}