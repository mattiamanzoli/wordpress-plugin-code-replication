"use client";

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Settings, Play, Square, Users } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";

// Generate random session ID
function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  for (let i = 0; i < 22; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Generate session ID based on operator
function generateOperatorSession(operatorId: number): string {
  return `operator-${operatorId}`;
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

// CRITICAL: Persist session in localStorage
function saveSessionToStorage(sessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('qrseat-receiver-session', sessionId);
  } catch (err) {
    console.error('Errore salvataggio sessione:', err);
  }
}

function loadSessionFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('qrseat-receiver-session');
  } catch {
    return null;
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

// OPTIMIZED: Generate QR code LOCALLY using qrcode library
const generateQrCode = async (url: string): Promise<string> => {
  try {
    // CRITICAL: Generate locally, much faster than API
    // Size increased to 400x400 for better phone recognition
    // Error correction level H for better scanning in poor conditions
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataUrl;
  } catch (err) {
    console.error('QR generation error:', err);
    throw err;
  }
};

function ReceiverContent() {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<string>('');
  const [operator, setOperator] = useState<number>(1);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Inizializzazione...');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [senderUrl, setSenderUrl] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('https://seatable.tuo/view/row/{id}');
  const [pollingInterval, setPollingInterval] = useState<number>(500);
  const [target, setTarget] = useState<'_self' | '_blank'>('_self');
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [blockedUrl, setBlockedUrl] = useState<string>('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsSessionActive = useRef<boolean>(false);

  // CRITICAL: Define addLog BEFORE any useEffect that uses it
  const addLog = useCallback((message: string, isError: boolean = false) => {
    const now = new Date().toLocaleTimeString();
    const prefix = isError ? '[ERRORE]' : '[INFO]';
    const logEntry = `${now} ${prefix} ${message}`;
    setLogs(prev => [logEntry, ...prev.slice(0, 19)]);
  }, []);

  // Load config on mount
  useEffect(() => {
    const config = loadConfig();
    if (config) {
      if (config.baseUrl) setBaseUrl(config.baseUrl);
      if (config.pollingInterval) setPollingInterval(config.pollingInterval);
      if (config.target) setTarget(config.target);
    }
    
    // Load operator selection
    const savedOperator = loadOperator();
    setOperator(savedOperator);
  }, []);

  // CRITICAL: Sync session state with server on mount
  useEffect(() => {
    if (!session) return;
    
    const syncSessionState = async () => {
      try {
        addLog('🔄 Sincronizzazione stato sessione con server...');
        const response = await fetch(`/api/qrseat/status?session=${encodeURIComponent(session)}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.ok && typeof data.active === 'boolean') {
          setIsSessionActive(data.active);
          addLog(`✅ Stato sincronizzato: ${data.active ? 'ATTIVA' : 'INATTIVA'}`);
        }
      } catch (err) {
        addLog(`⚠️ Errore sincronizzazione stato: ${err}`, true);
      }
    };
    
    syncSessionState();
  }, [session, addLog]);

  // Copy to clipboard
  const copyToClipboard = async (text: string, buttonId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      const button = document.getElementById(buttonId);
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copiato!';
        setTimeout(() => {
          button.textContent = originalText || 'Copia';
        }, 1500);
      }
    } catch (err) {
      addLog('Errore copia: ' + err, true);
    }
  };

  // SIMPLIFIED: Poll for new messages - API auto-deletes after returning
  const poll = useRef<() => Promise<void>>();
  
  useEffect(() => {
    poll.current = async () => {
      if (!session || !isSessionActive) return;

      try {
        setStatus(`In ascolto (prossima verifica in ${(pollingInterval / 1000).toFixed(1)}s)...`);
        const response = await fetch(
          `/api/qrseat/next?session=${encodeURIComponent(session)}`,
          { cache: 'no-cache' }
        );

        if (!response.ok) {
          throw new Error(`Errore polling: ${response.statusText}`);
        }

        const data = await response.json();

        // CRITICAL: If ID exists, open page (API auto-deletes message)
        if (data && data.id) {
          const url = baseUrl.replace('{id}', encodeURIComponent(data.id));
          addLog(`✅ ID ricevuto: ${data.id}. Apertura pagina...`);
          setStatus('SCANSIONE RICEVUTA! Apertura...');

          setTimeout(() => {
            const isInIframe = window.self !== window.top;
            
            if (isInIframe) {
              addLog(`[IFRAME] Invio messaggio al parent per aprire: ${url}`);
              window.parent.postMessage({ 
                type: "OPEN_EXTERNAL_URL", 
                data: { url } 
              }, "*");
              addLog(`✅ Pagina aperta! In attesa di nuova scansione...`);
              setStatus('Sessione attiva - In ascolto...');
            } else {
              if (target === '_blank') {
                addLog(`[BROWSER] Apertura nuova finestra: ${url}`);
                const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
                
                if (!newWindow) {
                  addLog(`[BLOCCO] Popup bloccato dal browser!`, true);
                  setBlockedUrl(url);
                } else {
                  addLog(`✅ Pagina aperta! In attesa di nuova scansione...`);
                  setBlockedUrl('');
                  setStatus('Sessione attiva - In ascolto...');
                }
              } else {
                addLog(`[BROWSER] Redirect stessa finestra: ${url}`);
                window.location.href = url;
              }
            }
          }, 500);
        }
      } catch (err) {
        addLog(`Errore di polling: ${err}. Riprovo.`, true);
        setStatus('ERRORE. Riprovo...');
      }
    };
  }, [session, isSessionActive, pollingInterval, baseUrl, target, addLog]);

  // MODIFIED: Initialize session with operator-based ID
  useEffect(() => {
    let sessionId = searchParams.get('session');
    
    if (!sessionId && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      sessionId = urlParams.get('session');
    }
    
    // Generate session based on selected operator
    if (!sessionId) {
      sessionId = generateOperatorSession(operator);
      addLog(`Sessione generata per Operatore ${operator}: ${sessionId}`);
    } else {
      addLog(`Sessione esistente: ${sessionId}`);
    }

    saveSessionToStorage(sessionId);
    setSession(sessionId);

    const url = new URL(window.location.href);
    url.searchParams.set('session', sessionId);
    window.history.replaceState(null, '', url.toString());

    const senderUrlObj = new URL(window.location.origin);
    senderUrlObj.pathname = '/sender';
    senderUrlObj.searchParams.set('session', sessionId);
    const senderUrlStr = senderUrlObj.toString();
    
    setSenderUrl(senderUrlStr);
    
    generateQrCode(senderUrlStr).then(qrUrl => {
      setQrDataUrl(qrUrl);
      addLog('QR Code generato (locale, ottimizzato 400x400)');
      addLog(`URL Sender: ${senderUrlStr}`);
    }).catch(err => {
      addLog('Errore generazione QR: ' + err, true);
    });

    addLog('Sistema pronto. Premi "Avvia Sessione" per iniziare.');
  }, [searchParams, operator, addLog]);

  // Handle operator change
  const handleOperatorChange = (newOperator: number) => {
    setOperator(newOperator);
    saveOperator(newOperator);
    
    // Generate new session for selected operator
    const newSession = generateOperatorSession(newOperator);
    setSession(newSession);
    saveSessionToStorage(newSession);
    
    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('session', newSession);
    window.history.replaceState(null, '', url.toString());
    
    // Update sender URL and QR code
    const senderUrlObj = new URL(window.location.origin);
    senderUrlObj.pathname = '/sender';
    senderUrlObj.searchParams.set('session', newSession);
    const senderUrlStr = senderUrlObj.toString();
    
    setSenderUrl(senderUrlStr);
    
    generateQrCode(senderUrlStr).then(qrUrl => {
      setQrDataUrl(qrUrl);
      addLog(`✅ Cambiato a Operatore ${newOperator} - Nuova sessione: ${newSession}`);
    }).catch(err => {
      addLog('Errore generazione QR: ' + err, true);
    });
  };

  // Log polling interval changes
  useEffect(() => {
    if (session) {
      addLog(`Intervallo polling aggiornato: ${pollingInterval}ms`);
    }
  }, [pollingInterval, session, addLog]);

  // Start/Stop polling based on isSessionActive
  useEffect(() => {
    if (!session || !poll.current) return;

    // CRITICAL: Only log when state actually changes (prevents duplicates)
    if (prevIsSessionActive.current !== isSessionActive) {
      if (isSessionActive) {
        addLog('🟢 Sessione AVVIATA - In ascolto di scansioni');
      } else {
        addLog('🔴 Sessione FERMATA');
      }
      prevIsSessionActive.current = isSessionActive;
    }

    if (isSessionActive) {
      setStatus('Sessione attiva - In ascolto...');
      
      poll.current();
      pollingRef.current = setInterval(() => poll.current!(), pollingInterval);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setStatus('Sessione in pausa - Premi "Avvia Sessione"');
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [session, isSessionActive, pollingInterval, addLog]);

  // Toggle session active state
  const toggleSession = async () => {
    if (!session) return;
    
    const newState = !isSessionActive;
    addLog(`🔄 ${newState ? 'Avvio' : 'Fermo'} sessione...`);
    
    try {
      // CRITICAL: Wait for server confirmation before updating local state
      const response = await fetch('/api/qrseat/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, active: newState })
      });
      
      if (!response.ok) {
        throw new Error(`Errore HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error('Aggiornamento stato fallito');
      }
      
      // SUCCESS: Update local state only after server confirmation
      setIsSessionActive(newState);
      addLog(`✅ Sessione ${newState ? 'AVVIATA' : 'FERMATA'} con successo`);
      
    } catch (err) {
      addLog(`❌ ERRORE aggiornamento stato: ${err}`, true);
      addLog(`⚠️ Stato locale NON modificato per sicurezza`, true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            QR-Seatable Bridge - Receiver
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Scansiona il QR code con il tuo telefono per connettere il sender
          </p>
          
          {/* Operator Selector */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Seleziona Operatore:
            </label>
            <select
              value={operator}
              onChange={(e) => handleOperatorChange(parseInt(e.target.value))}
              className="px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 font-semibold text-lg"
            >
              <option value={1}>Operatore 1</option>
              <option value={2}>Operatore 2</option>
              <option value={3}>Operatore 3</option>
              <option value={4}>Operatore 4</option>
              <option value={5}>Operatore 5</option>
            </select>
            <Badge variant="outline" className="text-base px-4 py-1">
              Sessione: operator-{operator}
            </Badge>
          </div>
          
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              onClick={toggleSession}
              variant={isSessionActive ? "destructive" : "default"}
              size="lg"
            >
              {isSessionActive ? (
                <>
                  <Square className="w-5 h-5 mr-2" />
                  Ferma Sessione
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Avvia Sessione
                </>
              )}
            </Button>
            <Link href="/config">
              <Button variant="outline" size="lg">
                <Settings className="w-4 h-4 mr-2" />
                Configurazione
              </Button>
            </Link>
          </div>
        </div>

        {/* Blocked URL Banner */}
        {blockedUrl && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-950">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 dark:text-red-100 mb-1">
                    ⚠️ Popup Bloccato dal Browser
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Il browser ha bloccato l'apertura automatica. Clicca il pulsante per aprire manualmente.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => {
                    window.open(blockedUrl, '_blank', 'noopener,noreferrer');
                    setBlockedUrl('');
                  }}
                  className="shrink-0"
                >
                  Apri Link
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Session & QR Code */}
          <Card>
            <CardHeader>
              <CardTitle>Sessione Attiva</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Session ID:
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-sm font-mono">
                    {session || '—'}
                  </code>
                  <Button
                    id="copy-session"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(session, 'copy-session')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  URL Sender:
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={senderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-sm truncate hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {senderUrl}
                  </a>
                  <Button
                    id="copy-url"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(senderUrl, 'copy-url')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  QR Code di Pairing
                </p>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="border-4 border-white shadow-lg rounded-lg"
                  />
                ) : (
                  <div className="w-[200px] h-[200px] bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status & Logs */}
          <Card>
            <CardHeader>
              <CardTitle>Status & Log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                  Stato Corrente:
                </label>
                <Badge 
                  variant="outline" 
                  className={`w-full justify-center py-2 text-sm ${isSessionActive ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-50 text-gray-700'}`}
                >
                  {status}
                </Badge>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                  Log Live:
                </label>
                <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-[400px] overflow-y-auto">
                  {logs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap mb-1">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ReceiverPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento...</p>
        </div>
      </div>
    }>
      <ReceiverContent />
    </Suspense>
  );
}