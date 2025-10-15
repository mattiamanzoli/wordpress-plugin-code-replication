"use client";

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Settings, Play, Square, Users, Shield, X } from "lucide-react";
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
  if (typeof window === 'undefined') return 0;
  try {
    const stored = localStorage.getItem('qrseat-operator');
    return stored ? parseInt(stored) : 0;
  } catch {
    return 0;
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
  const router = useRouter();
  const [session, setSession] = useState<string>('');
  const [operator, setOperator] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Inizializzazione...');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [senderUrl, setSenderUrl] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('https://seatable.tuo/view/row/{id}');
  const [pollingInterval, setPollingInterval] = useState<number>(500);
  const [target, setTarget] = useState<'_self' | '_blank'>('_self');
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [blockedUrl, setBlockedUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [activeOperators, setActiveOperators] = useState<Set<number>>(new Set());
  const [adminOperatorStates, setAdminOperatorStates] = useState<Record<number, { active: boolean; loading: boolean }>>({});
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsSessionActive = useRef<boolean>(false);

  // CRITICAL: Define addLog BEFORE any useEffect that uses it
  const addLog = useCallback((message: string, isError: boolean = false) => {
    const now = new Date().toLocaleTimeString();
    const prefix = isError ? '[ERRORE]' : '[INFO]';
    const logEntry = `${now} ${prefix} ${message}`;
    setLogs(prev => [logEntry, ...prev.slice(0, 19)]);
  }, []);

  // Check which operators have active sessions
  const checkActiveOperators = useCallback(async (currentOperator?: number) => {
    const activeOps = new Set<number>();
    
    // Use passed operator or fall back to state
    const operatorToSkip = currentOperator !== undefined ? currentOperator : operator;
    
    // Check all 5 operators
    for (let i = 1; i <= 5; i++) {
      // CRITICAL: Skip checking current operator to avoid self-blocking
      if (i === operatorToSkip) continue;
      
      const operatorSession = generateOperatorSession(i);
      try {
        const response = await fetch(`/api/qrseat/status?session=${encodeURIComponent(operatorSession)}`);
        const data = await response.json();
        
        if (data.ok && data.active === true) {
          activeOps.add(i);
        }
      } catch (err) {
        // Ignore errors for individual checks
      }
    }
    
    setActiveOperators(activeOps);
  }, [operator]);

  // Admin: Check detailed status of all operators
  const checkAdminOperatorStates = useCallback(async () => {
    const states: Record<number, { active: boolean; loading: boolean }> = {};
    
    // OPTIMIZED: Don't show loading if we already have data
    // Just fetch in background and update only if changed
    for (let i = 1; i <= 5; i++) {
      const operatorSession = generateOperatorSession(i);
      try {
        const response = await fetch(`/api/qrseat/status?session=${encodeURIComponent(operatorSession)}`);
        const data = await response.json();
        
        states[i] = { 
          active: data.ok && data.active === true, 
          loading: false 
        };
      } catch (err) {
        states[i] = { active: false, loading: false };
      }
    }
    
    // CRITICAL: Only update if state actually changed (prevents unnecessary re-renders)
    setAdminOperatorStates(prev => {
      // Compare new state with previous state
      let hasChanged = false;
      for (let i = 1; i <= 5; i++) {
        if (!prev[i] || prev[i].active !== states[i].active || prev[i].loading !== states[i].loading) {
          hasChanged = true;
          break;
        }
      }
      
      // Only update if something changed
      return hasChanged ? states : prev;
    });
  }, []);

  // Admin: Stop a specific operator session
  const stopOperatorSession = async (targetOperator: number) => {
    if (targetOperator === operator) {
      addLog('❌ Non puoi fermare la tua stessa sessione da qui!', true);
      return;
    }
    
    const targetSession = generateOperatorSession(targetOperator);
    addLog(`🔄 Tentativo di fermare sessione Operatore ${targetOperator}...`);
    
    try {
      const response = await fetch('/api/qrseat/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: targetSession, active: false })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error('Aggiornamento stato fallito');
      }
      
      addLog(`✅ Sessione Operatore ${targetOperator} fermata con successo`);
      checkAdminOperatorStates();
      checkActiveOperators();
    } catch (err) {
      addLog(`❌ Errore nel fermare Operatore ${targetOperator}: ${err}`, true);
    }
  };

  // Load config on mount
  useEffect(() => {
    const config = loadConfig();
    if (config) {
      if (config.baseUrl) setBaseUrl(config.baseUrl);
      if (config.pollingInterval) setPollingInterval(config.pollingInterval);
      if (config.target) setTarget(config.target);
    }
    
    // CRITICAL: Do NOT load operator from localStorage on mount
    // Force user to manually select operator every time
    setOperator(0);
    
    // CRITICAL: Check active operators on mount (chiamata diretta)
    const checkInitialOperators = async () => {
      const activeOps = new Set<number>();
      for (let i = 1; i <= 5; i++) {
        const operatorSession = generateOperatorSession(i);
        try {
          const response = await fetch(`/api/qrseat/status?session=${encodeURIComponent(operatorSession)}`);
          const data = await response.json();
          if (data.ok && data.active === true) {
            activeOps.add(i);
          }
        } catch (err) {
          // Ignore
        }
      }
      setActiveOperators(activeOps);
    };
    checkInitialOperators();
  }, []); // FIXED: Dipendenze vuote per evitare loop

  // CRITICAL: Periodically refresh active operators list
  useEffect(() => {
    const interval = setInterval(() => {
      checkActiveOperators();
      if (operator > 0) {
        checkAdminOperatorStates();
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [checkActiveOperators, checkAdminOperatorStates, operator]);

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
    const button = document.getElementById(buttonId);
    
    try {
      // Try modern Clipboard API first
      await navigator.clipboard.writeText(text);
      
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copiato!';
        setTimeout(() => {
          button.textContent = originalText || 'Copia';
        }, 1500);
      }
      addLog('✅ Testo copiato negli appunti');
    } catch (err) {
      // FALLBACK: Use legacy method for iframe/blocked contexts
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (successful) {
          if (button) {
            const originalText = button.textContent;
            button.textContent = 'Copiato!';
            setTimeout(() => {
              button.textContent = originalText || 'Copia';
            }, 1500);
          }
          addLog('✅ Testo copiato (metodo alternativo)');
        } else {
          throw new Error('Fallback copy failed');
        }
      } catch (fallbackErr) {
        // If both methods fail, show error message
        addLog('⚠️ Impossibile copiare automaticamente. Copia manualmente il testo.', true);
        if (button) {
          const originalText = button.textContent;
          button.textContent = '❌ Copia manuale';
          setTimeout(() => {
            button.textContent = originalText || 'Copia';
          }, 2000);
        }
      }
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
    
    // CRITICAL: Do NOT generate session automatically - wait for operator selection
    if (!sessionId) {
      addLog('⚠️ Nessuna sessione attiva. Seleziona un operatore per iniziare.');
      setStatus('Nessuna sessione - Seleziona un operatore');
      return;
    }

    // Existing session from URL
    addLog(`Sessione esistente: ${sessionId}`);
    saveSessionToStorage(sessionId);
    setSession(sessionId);

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
  }, [searchParams, addLog]);

  // Handle operator change
  const handleOperatorChange = async (newOperator: number) => {
    // CRITICAL: Prevent selecting placeholder
    if (newOperator === 0) return;
    
    addLog(`🔄 Cambio operatore a ${newOperator}...`);
    
    // CRITICAL: Block operator change if current session is active
    if (isSessionActive) {
      addLog('❌ Impossibile cambiare operatore: sessione attiva!', true);
      setError('Ferma la sessione prima di cambiare operatore.');
      setTimeout(() => setError(''), 3000);
      return;
    }
    
    // Set operator immediately
    setOperator(newOperator);
    saveOperator(newOperator);
    
    // CRITICAL: Reset state when changing operator
    addLog(`✅ Operatore ${newOperator} selezionato, inizializzazione...`);
    setStatus('Inizializzazione...');
    setBlockedUrl('');
    setIsSessionActive(false);
    prevIsSessionActive.current = false;
    
    // Generate new session for selected operator
    const newSession = generateOperatorSession(newOperator);
    setSession(newSession);
    saveSessionToStorage(newSession);
    
    // CRITICAL: Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('session', newSession);
    window.history.replaceState(null, '', url.toString());
    addLog(`✅ URL aggiornato: ${url.toString()}`);
    
    // CRITICAL: Generate sender URL and QR code DIRECTLY (don't wait for useEffect)
    const senderUrlObj = new URL(window.location.origin);
    senderUrlObj.pathname = '/sender';
    senderUrlObj.searchParams.set('session', newSession);
    const senderUrlStr = senderUrlObj.toString();
    
    setSenderUrl(senderUrlStr);
    addLog(`✅ URL Sender aggiornato: ${senderUrlStr}`);
    
    // CRITICAL: Regenerate QR code immediately
    try {
      const qrUrl = await generateQrCode(senderUrlStr);
      setQrDataUrl(qrUrl);
      addLog(`✅ QR Code rigenerato per Operatore ${newOperator}`);
      addLog(`✅ Cambiato a Operatore ${newOperator} - Sessione: ${newSession}`);
      addLog('Sistema pronto. Premi "Avvia Sessione" per iniziare.');
      setStatus('Sessione in pausa - Premi "Avvia Sessione"');
    } catch (err) {
      addLog('Errore generazione QR: ' + err, true);
    }
    
    // CRITICAL: Refresh active operators list after change
    checkActiveOperators(newOperator);
    
    // If switching to any operator, load admin panel
    if (newOperator > 0) {
      checkAdminOperatorStates();
    }
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
          
          {/* Error Banner */}
          {error && (
            <div className="mt-4 mx-auto max-w-md bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          {/* Operator Selector */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Seleziona Operatore:
            </label>
            <select
              value={operator}
              onChange={(e) => handleOperatorChange(parseInt(e.target.value))}
              disabled={isSessionActive}
              className="px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value={0} disabled>Seleziona un operatore...</option>
              <option value={1}>Operatore 1</option>
              <option value={2}>Operatore 2</option>
              <option value={3}>Operatore 3</option>
              <option value={4}>Operatore 4</option>
              <option value={5}>Operatore 5</option>
            </select>
            {operator > 0 && (
              <Badge variant="outline" className="text-base px-4 py-1">
                Sessione: operator-{operator}
              </Badge>
            )}
          </div>
          
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              onClick={toggleSession}
              variant={isSessionActive ? "destructive" : "default"}
              size="lg"
              disabled={!session || operator === 0}
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
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="lg"
                    onClick={() => {
                      window.open(blockedUrl, '_blank', 'noopener,noreferrer');
                      setBlockedUrl('');
                    }}
                  >
                    Apri Link
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={() => setBlockedUrl('')}
                    className="px-3"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin Panel - Available to ALL operators */}
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              Pannello Controllo Operatori
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((op) => {
                const state = adminOperatorStates[op];
                const isCurrentOperator = op === operator;
                
                return (
                  <div 
                    key={op}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={isCurrentOperator ? "default" : "outline"}>
                        Operatore {op} {isCurrentOperator && '(Tu)'}
                      </Badge>
                      {state?.loading ? (
                        <span className="text-sm text-gray-500">Caricamento...</span>
                      ) : (
                        <Badge 
                          variant={state?.active ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {state?.active ? '🟢 ATTIVA' : '🔴 INATTIVA'}
                        </Badge>
                      )}
                    </div>
                    {!isCurrentOperator && state?.active && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => stopOperatorSession(op)}
                      >
                        Ferma Sessione
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

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
                    disabled={!session}
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
                    href={senderUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-sm truncate hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {senderUrl || '—'}
                  </a>
                  <Button
                    id="copy-url"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(senderUrl, 'copy-url')}
                    disabled={!senderUrl}
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