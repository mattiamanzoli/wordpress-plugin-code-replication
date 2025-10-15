"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flashlight, Camera, Settings, Scan, Square, Play, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import jsQR from "jsqr";

// Extract ID from QR content
function extractId(content: string, mode: 'param' | 'raw'): string {
  if (mode === 'raw') {
    return String(content || '').trim();
  }
  
  try {
    const url = new URL(String(content));
    const idFromParam = url.searchParams.get('id');
    if (idFromParam) return idFromParam;
    
    const hash = url.hash || '';
    const idFromHash = hash.replace(/^#?id=/, '');
    if (idFromHash) return idFromHash;
    
    return '';
  } catch (e) {
    const match = content.match(/[?&]id=([^&]+)/);
    return match ? match[1] : String(content || '').trim();
  }
}

// Vibrate on success
function vibrateSuccess() {
  if ('vibrate' in navigator) {
    navigator.vibrate(500);
  }
}

// Load config from localStorage
function loadConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('qrseat-config');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// Load/save session from localStorage
function loadSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('qrseat-session');
  } catch {
    return null;
  }
}

function saveSession(session: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('qrseat-session', session);
    console.log('[SESSION] Salvata in localStorage:', session);
  } catch (err) {
    console.error('[SESSION] Errore salvataggio:', err);
  }
}

// Load/save operator selection
function loadOperator(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const stored = localStorage.getItem('qrseat-operator');
    return stored ? parseInt(stored) : 1;
  } catch {
    return 1;
  }
}

function saveOperator(operatorId: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('qrseat-operator', operatorId.toString());
  } catch (err) {
    console.error('Errore salvataggio operatore:', err);
  }
}

// Generate session ID based on operator
function generateOperatorSession(operatorId: number): string {
  return `operator-${operatorId}`;
}

function SenderContent() {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  
  const [session, setSession] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [lastSentId, setLastSentId] = useState<string>('');
  const [mode, setMode] = useState<'param' | 'raw'>('param');
  const [redirect, setRedirect] = useState<boolean>(false);
  const [baseUrl, setBaseUrl] = useState<string>('https://seatable.tuo/view/row/{id}');
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [operator, setOperator] = useState<number>(1);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsSessionActive = useRef<boolean>(false);

  // Add debug log
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setDebugLog(prev => [logEntry, ...prev.slice(0, 19)]);
  };

  // Load config and operator on mount
  useEffect(() => {
    const config = loadConfig();
    if (config) {
      if (config.baseUrl) setBaseUrl(config.baseUrl);
      if (config.mode) setMode(config.mode);
      if (typeof config.redirect === 'boolean') setRedirect(config.redirect);
    }
    
    // Load operator selection
    const savedOperator = loadOperator();
    setOperator(savedOperator);
  }, []);

  // MODIFIED: Initialize session with operator support
  useEffect(() => {
    addDebugLog('🔄 Init sessione...');
    
    let sessionParam = searchParams.get('session');
    addDebugLog(`📥 URL param: ${sessionParam || 'NULL'}`);
    
    if (!sessionParam && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      sessionParam = urlParams.get('session');
      addDebugLog(`📥 window fallback: ${sessionParam || 'NULL'}`);
    }
    
    if (!sessionParam) {
      const storedSession = loadSession();
      if (storedSession) {
        sessionParam = storedSession;
        addDebugLog(`📥 localStorage: ${sessionParam.substring(0, 8)}...`);
      } else {
        // Generate session from selected operator
        sessionParam = generateOperatorSession(operator);
        addDebugLog(`📥 Generated from operator ${operator}: ${sessionParam}`);
      }
    }
    
    if (sessionParam) {
      setSession(sessionParam);
      saveSession(sessionParam);
      setError(null);
      addDebugLog(`✅ Sessione attiva: ${sessionParam.substring(0, 12)}...`);
      
      // Extract operator from session if it's an operator session
      const operatorMatch = sessionParam.match(/^operator-(\d+)$/);
      if (operatorMatch) {
        const detectedOperator = parseInt(operatorMatch[1]);
        if (detectedOperator >= 1 && detectedOperator <= 5) {
          setOperator(detectedOperator);
          saveOperator(detectedOperator);
          addDebugLog(`🔍 Rilevato Operatore ${detectedOperator} dalla sessione`);
        }
      }
      
      checkSessionStatus(sessionParam);
    } else {
      setError('Sessione mancante. Scansiona il QR Code di pairing sul desktop.');
      addDebugLog('❌ NESSUNA SESSIONE - Scansiona QR pairing');
    }
  }, [searchParams, operator]);

  // Handle operator change
  const handleOperatorChange = (newOperator: number) => {
    addDebugLog(`🔄 Cambio operatore: ${operator} → ${newOperator}`);
    
    // CRITICAL: Stop everything first
    stopScanning();
    stopCamera();
    
    // CRITICAL: Stop status polling
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
      statusCheckIntervalRef.current = null;
      addDebugLog('⏸️ Polling stato fermato');
    }
    
    // Clear all state
    setError(null);
    setSuccess(null);
    setProcessing(false);
    setLastSentId('');
    setCameraEnabled(false);
    setCameraReady(false);
    setTorchEnabled(false);
    setSessionActive(false);
    
    // Save new operator
    setOperator(newOperator);
    saveOperator(newOperator);
    
    // Generate new session for selected operator
    const newSession = generateOperatorSession(newOperator);
    setSession(newSession);
    saveSession(newSession);
    
    addDebugLog(`✅ Nuova sessione Operatore ${newOperator}: ${newSession}`);
    
    // CRITICAL: Force immediate status check and restart polling
    checkSessionStatus(newSession);
    
    // Restart polling interval with new session
    statusCheckIntervalRef.current = setInterval(() => {
      checkSessionStatus(newSession);
    }, 2000);
    addDebugLog('🔄 Polling stato riavviato per nuova sessione');
  };

  // CRITICAL: Check session status on server
  const checkSessionStatus = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/qrseat/status?session=${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      
      if (data.ok && typeof data.active === 'boolean') {
        setSessionActive(data.active);
        
        if (!data.active) {
          addDebugLog('⚠️ Sessione NON ATTIVA sul receiver');
          if (isScanning) {
            stopScanning();
            setError('Sessione fermata dal receiver. Avvia la sessione sul desktop.');
          }
        } else {
          addDebugLog('✅ Sessione ATTIVA sul receiver');
        }
      }
    } catch (err) {
      addDebugLog(`❌ Errore controllo stato: ${err}`);
    }
  };

  // CRITICAL: Poll session status every 2 seconds
  useEffect(() => {
    if (!session) return;

    // Initial check
    checkSessionStatus(session);

    // Start interval
    statusCheckIntervalRef.current = setInterval(() => {
      checkSessionStatus(session);
    }, 2000);

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
    };
  }, [session]);

  // Initialize camera
  const startCamera = async () => {
    try {
      // OPTIMIZED: Reduced resolution from 1280x720 to 640x480 for faster processing
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraReady(true);
        addDebugLog('📷 Camera avviata (640x480 ottimizzata)');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Impossibile accedere alla fotocamera. Verifica i permessi.');
      setCameraReady(false);
      addDebugLog('❌ Errore camera');
    }
  };

  // Stop camera
  const stopCamera = () => {
    stopScanning();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setCameraReady(false);
    addDebugLog('📷 Camera fermata');
  };

  // OPTIMIZED: Scan every 150ms instead of 300ms for faster QR detection
  const startScanning = () => {
    if (scanIntervalRef.current) return;
    
    setIsScanning(true);
    addDebugLog('🔍 Scansione AVVIATA (150ms)');

    scanIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || processing) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        handleQRDetected(code.data);
      }
    }, 150); // OPTIMIZED: 150ms instead of 300ms
  };

  // Stop scanning
  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
      setIsScanning(false);
      addDebugLog('🔍 Scansione FERMATA');
    }
  };

  // Handle QR detection
  const handleQRDetected = async (content: string) => {
    if (processing) return;
    
    // CRITICAL: Stop scanning after finding QR
    stopScanning();
    
    addDebugLog(`📷 QR rilevato: ${content.substring(0, 40)}...`);
    
    const id = extractId(content, mode);
    addDebugLog(`🔍 ID estratto: ${id || 'NULLO'}`);
    
    if (!id) {
      setError('ID non trovato nel QR');
      addDebugLog(`❌ ID non valido`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    const currentSession = session || loadSession();
    addDebugLog(`🔐 Controllo sessione...`);
    
    if (!currentSession) {
      setError('Sessione mancante. Impossibile inviare.');
      addDebugLog('❌ ERRORE: Sessione MANCANTE al momento dell\'invio!');
      return;
    }

    addDebugLog(`📤 Invio ID "${id}" con sessione ${currentSession.substring(0, 8)}...`);
    vibrateSuccess();
    
    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/qrseat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: currentSession, id })
      });

      const data = await response.json();
      addDebugLog(`📥 Risposta API: ${JSON.stringify(data)}`);
      
      // CRITICAL: Handle session not active error
      if (response.status === 403 || data.sessionActive === false) {
        setError('❌ SESSIONE NON ATTIVA! Avvia la sessione sul desktop.');
        addDebugLog('❌ BLOCCATO: Sessione NON attiva sul receiver!');
        setSessionActive(false); // Force update UI state
        setTimeout(() => setError(null), 5000);
        return;
      }
      
      if (!data || data.ok !== true) {
        throw new Error('Invio fallito. Controlla il log sul Receiver.');
      }

      setLastSentId(id);
      setSuccess(`ID "${id}" inviato con successo!`);
      addDebugLog(`✅ ID inviato! Ver: ${data.ver}`);

      if (redirect) {
        const url = baseUrl.replace('{id}', encodeURIComponent(id));
        addDebugLog(`↗️ Redirect a: ${url}`);
        setTimeout(() => {
          window.location.href = url;
        }, 1000);
        return;
      }

      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
    } catch (err) {
      setError('Errore invio ID. Controlla la connessione.');
      addDebugLog(`❌ Errore invio: ${err}`);
      console.error(err);
      setTimeout(() => setError(null), 3000);
    } finally {
      setTimeout(() => {
        setProcessing(false);
      }, 1200);
    }
  };

  // Toggle torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;

    try {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      
      if (!capabilities.torch) {
        setError('Torcia non supportata su questo dispositivo');
        setTimeout(() => setError(null), 3000);
        return;
      }

      await track.applyConstraints({
        advanced: [{ torch: !torchEnabled } as any]
      });
      
      setTorchEnabled(prev => !prev);
    } catch (err) {
      console.error('Torch error:', err);
      setError('Errore controllo torcia');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (cameraEnabled) {
      stopCamera();
      setCameraEnabled(false);
    } else {
      startCamera();
      setCameraEnabled(true);
    }
  };

  // Toggle scanning (single shot button)
  const toggleScanning = () => {
    if (isScanning) {
      stopScanning();
    } else {
      // CRITICAL: Check session status before scanning
      if (!sessionActive) {
        setError('Sessione NON ATTIVA sul receiver. Avvia la sessione sul desktop prima di scannerizzare.');
        addDebugLog('❌ Tentativo di scansione con sessione inattiva');
        setTimeout(() => setError(null), 4000);
        return;
      }
      
      if (!cameraEnabled || !cameraReady) {
        setError('Avvia prima la camera');
        setTimeout(() => setError(null), 2000);
        return;
      }
      startScanning();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Scanner Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Scanner QR
              </div>
              <span className="text-sm font-normal text-gray-500">
                Operatore {operator}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Scanner */}
            <div className="relative aspect-square w-full bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                style={{ display: cameraEnabled ? 'block' : 'none' }}
              />
              <canvas
                ref={canvasRef}
                className="hidden"
              />
              {!cameraEnabled && (
                <div className="w-full h-full flex items-center justify-center text-white">
                  <div className="text-center">
                    <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm opacity-75">Camera disabilitata</p>
                  </div>
                </div>
              )}
              {cameraEnabled && !cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-sm">Caricamento camera...</p>
                  </div>
                </div>
              )}
              {isScanning && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-green-500 text-white">
                    🔍 Scansionando...
                  </Badge>
                </div>
              )}
            </div>

            {/* Status Messages */}
            {!sessionActive && session && (
              <Badge variant="outline" className="w-full justify-center py-2 border-orange-500 text-orange-700 bg-orange-50 dark:bg-orange-950 dark:text-orange-300">
                ⚠️ Sessione NON ATTIVA - Avvia sul desktop
              </Badge>
            )}
            
            {error && (
              <Badge variant="destructive" className="w-full justify-center py-2">
                {error}
              </Badge>
            )}
            
            {success && (
              <Badge className="w-full justify-center py-2 bg-green-500">
                {success}
              </Badge>
            )}

            {processing && (
              <Badge variant="outline" className="w-full justify-center py-2">
                Invio in corso...
              </Badge>
            )}

            {/* Controls - IMPROVED UX */}
            <div className="space-y-3">
              <Button
                onClick={toggleScanning}
                disabled={!sessionActive || processing}
                variant={isScanning ? "destructive" : "default"}
                className="w-full h-32 text-2xl font-bold"
              >
                {isScanning ? (
                  <>
                    <Square className="w-10 h-10 mr-3" />
                    Ferma Scansione
                  </>
                ) : (
                  <>
                    <Play className="w-10 h-10 mr-3" />
                    Avvia Scansione
                  </>
                )}
              </Button>
              
              {/* Secondary controls - smaller */}
              <div className="flex gap-2">
                <Button
                  onClick={toggleCamera}
                  variant="outline"
                  className="flex-1"
                  disabled={processing}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {cameraEnabled ? 'Disabilita' : 'Abilita'} Camera
                </Button>
                
                <Button
                  onClick={toggleTorch}
                  variant="outline"
                  className="flex-1"
                  disabled={processing || !cameraEnabled || !cameraReady}
                >
                  <Flashlight className="w-4 h-4 mr-2" />
                  {torchEnabled ? 'Spegni' : 'Accendi'} Torcia
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Sessione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Session ID:
              </label>
              <Input
                type="text"
                value={session}
                onChange={(e) => {
                  const newSession = e.target.value;
                  setSession(newSession);
                  if (newSession) {
                    saveSession(newSession);
                    addDebugLog(`✏️ Sessione modificata manualmente: ${newSession.substring(0, 8)}...`);
                  }
                }}
                placeholder="Inserisci session ID..."
                disabled={processing}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Suggerimento: scansiona il QR Code di pairing mostrato sul desktop
              </p>
            </div>

            {lastSentId && (
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Ultimo ID inviato:
                </label>
                <code className="block mt-1 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-sm font-mono">
                  {lastSentId}
                </code>
              </div>
            )}

            {/* DEBUG LOG */}
            {debugLog.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                  Debug Log (ultimi 20):
                </label>
                <div className="bg-gray-900 text-green-400 font-mono text-xs p-2 rounded max-h-48 overflow-y-auto">
                  {debugLog.map((log, idx) => (
                    <div key={idx} className="mb-0.5">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SenderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento...</p>
        </div>
      </div>
    }>
      <SenderContent />
    </Suspense>
  );
}