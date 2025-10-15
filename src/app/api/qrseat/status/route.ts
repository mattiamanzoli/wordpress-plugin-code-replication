import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Data directory for persistent storage
const DATA_DIR = path.join(process.cwd(), '.qrseat-data');

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

// Load session status
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

// Save session status
async function saveSessionStatus(status: SessionStatus) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${status.session}-status.json`);
  await fs.writeFile(filePath, JSON.stringify(status, null, 2), 'utf-8');
}

// GET: Check if session is active
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = searchParams.get('session');

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Missing session' },
        { status: 400 }
      );
    }

    const status = await loadSessionStatus(session);
    
    return NextResponse.json({ 
      ok: true, 
      active: status.active,
      lastUpdate: status.lastUpdate
    });
  } catch (error) {
    console.error('[QRSeat] Status check error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: Update session active state
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session, active } = body;

    if (!session || typeof active !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'Missing session or active state' },
        { status: 400 }
      );
    }

    const status: SessionStatus = {
      session,
      active,
      lastUpdate: Date.now()
    };

    await saveSessionStatus(status);
    
    console.log(`[QRSeat] Session status updated: session=${session}, active=${active}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[QRSeat] Status update error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}