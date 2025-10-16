import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.qrseat-data');

interface Viewer {
  deviceId: string;
  operatorName: string;
  operatorId: number;
  timestamp: number;
}

// GET: Get all viewers for a specific operator
// POST: Register a viewer (add/update)
// DELETE: Unregister a viewer

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operatorId = searchParams.get('operatorId');
    
    if (!operatorId) {
      return NextResponse.json({ ok: false, error: 'Missing operatorId' }, { status: 400 });
    }
    
    await fs.mkdir(DATA_DIR, { recursive: true });
    const viewersFile = path.join(DATA_DIR, 'viewers.json');
    
    let viewers: Viewer[] = [];
    try {
      const data = await fs.readFile(viewersFile, 'utf-8');
      viewers = JSON.parse(data);
    } catch (err) {
      // File doesn't exist yet
      viewers = [];
    }
    
    // Filter viewers for this operator and remove stale entries (>10 seconds old)
    const now = Date.now();
    const activeViewers = viewers.filter(v => 
      v.operatorId === parseInt(operatorId) && 
      (now - v.timestamp) < 10000
    );
    
    return NextResponse.json({ ok: true, viewers: activeViewers });
  } catch (err) {
    console.error('Error getting viewers:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, operatorName, operatorId } = body;
    
    if (!deviceId || !operatorName || !operatorId) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing required fields: deviceId, operatorName, operatorId' 
      }, { status: 400 });
    }
    
    await fs.mkdir(DATA_DIR, { recursive: true });
    const viewersFile = path.join(DATA_DIR, 'viewers.json');
    
    let viewers: Viewer[] = [];
    try {
      const data = await fs.readFile(viewersFile, 'utf-8');
      viewers = JSON.parse(data);
    } catch (err) {
      viewers = [];
    }
    
    // Remove stale entries (>10 seconds old)
    const now = Date.now();
    viewers = viewers.filter(v => (now - v.timestamp) < 10000);
    
    // Remove existing entry for this device (if any)
    viewers = viewers.filter(v => v.deviceId !== deviceId);
    
    // Add new entry
    viewers.push({
      deviceId,
      operatorName,
      operatorId: parseInt(operatorId),
      timestamp: now
    });
    
    await fs.writeFile(viewersFile, JSON.stringify(viewers, null, 2));
    
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error registering viewer:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: 'Missing deviceId' }, { status: 400 });
    }
    
    await fs.mkdir(DATA_DIR, { recursive: true });
    const viewersFile = path.join(DATA_DIR, 'viewers.json');
    
    let viewers: Viewer[] = [];
    try {
      const data = await fs.readFile(viewersFile, 'utf-8');
      viewers = JSON.parse(data);
    } catch (err) {
      viewers = [];
    }
    
    // Remove this device
    viewers = viewers.filter(v => v.deviceId !== deviceId);
    
    await fs.writeFile(viewersFile, JSON.stringify(viewers, null, 2));
    
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error unregistering viewer:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}