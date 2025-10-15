import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.qrseat-data');

// CRITICAL: Session data structure with message history
interface SessionData {
  session: string;
  messages: Array<{
    id: string;
    ver: number;
    timestamp: number;
  }>;
}

// CRITICAL: Load session data with message history
async function loadSessionData(session: string): Promise<SessionData> {
  const filePath = path.join(DATA_DIR, `${session}.json`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Ensure data has messages array
    if (!data.messages || !Array.isArray(data.messages)) {
      return { session, messages: [] };
    }
    
    return data as SessionData;
  } catch {
    // File doesn't exist or is invalid
    return { session, messages: [] };
  }
}

// CRITICAL: Save session data
async function saveSessionData(data: SessionData) {
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