import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.qrseat-data');

const DEFAULT_MESSAGE_TTL = 5 * 60 * 1000; // 5 minutes

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

function purgeExpiredMessages(sessionData: SessionData, now = Date.now()): boolean {
  const originalLength = sessionData.messages.length;

  sessionData.messages = sessionData.messages.filter((message) => {
    const expiresAt = message.expiresAt ?? (message.timestamp + DEFAULT_MESSAGE_TTL);
    return expiresAt > now;
  });

  return sessionData.messages.length !== originalLength;
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

    const removed = purgeExpiredMessages(sessionData);

    if (removed) {
      await saveSessionData(sessionData);
    }

    return sessionData;
  } catch {
    // File doesn't exist or is invalid
    return { session, messages: [], lastVer: 0 };
  }
}

// CRITICAL: Save session data
async function saveSessionData(data: SessionData) {
  if (typeof data.lastVer !== 'number') {
    data.lastVer = data.messages.reduce((max, message) => (message.ver > max ? message.ver : max), 0);
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${data.session}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = searchParams.get('session');

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Missing session parameter' },
        { status: 400 }
      );
    }

    // CRITICAL: Load session data
    const sessionData = await loadSessionData(session);

    // CRITICAL: Get first message (if any)
    const firstMessage = sessionData.messages[0];

    if (firstMessage) {
      console.log(`[QRSeat] Returning and DELETING message: session=${session}, id=${firstMessage.id}, ver=${firstMessage.ver}`);
      
      // CRITICAL: Remove message from array (consume it)
      sessionData.messages.shift();
      
      // Save updated session data (without this message)
      await saveSessionData(sessionData);
      
      return NextResponse.json({
        ok: true,
        id: firstMessage.id,
        time: Date.now()
      });
    }

    // No messages available
    return NextResponse.json({ ok: true, time: Date.now() });
  } catch (error) {
    console.error('[QRSeat] Next error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}