"use client";

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Settings, Play, Square, Users, Shield, X, LogOut } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Generate random session ID
function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  for (let i = 0; i < 22; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Generate unique device ID
function generateDeviceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'device-';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Load/save device ID
function loadDeviceId(): string {
  if (typeof window === 'undefined') return generateDeviceId();
  try {
    const stored = localStorage.getItem('qrseat-device-id');
    if (stored) return stored;
    const newId = generateDeviceId();
    localStorage.setItem('qrseat-device-id', newId);
    return newId;
  } catch {
    return generateDeviceId();
  }
}

// Load/save operator name
function loadOperatorName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('qrseat-operator-name');
  } catch {
    return null;
  }
}

function saveOperatorName(name: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('qrseat-operator-name', name);
  } catch (err) {
    console.error('Errore salvataggio nome operatore:', err);
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
  const [activeViewers, setActiveViewers] = useState<Record<number, string[]>>({});
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsSessionActive = useRef<boolean>(false);
  
  // MODIFIED: Remove name dialog states, get from localStorage
  const [operatorName, setOperatorName] = useState<string>('');
  const [deviceId] = useState<string>(() => loadDeviceId());
  const viewerPollingRef = useRef<NodeJS.Timeout | null>(null);

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

  // NEW: Fetch active viewers for all operators
  const fetchActiveViewers = useCallback(async () => {
    try {
      const response = await fetch('/api/qrseat/viewers');
      const data = await response.json();
      
      if (data.ok && Array.isArray(data.viewers)) {
        // Group viewers by operatorId
        const viewersByOperator: Record<number, string[]> = {};
        
        for (let i = 1; i <= 5; i++) {
          viewersByOperator[i] = [];
        }
        
        data.viewers.forEach((viewer: any) => {
          if (viewer.operatorId >= 1 && viewer.operatorId <= 5) {
            viewersByOperator[viewer.operatorId].push(viewer.operatorName);
          }
        });
        
        setActiveViewers(viewersByOperator);
      }
    } catch (err) {
      console.error('Errore fetch viewers:', err);
    }
  }, []);

  // Admin: Stop a specific operator session
  const stopOperatorSession = async (targetOperator: number) => {
    console.group('🖱️ CLICK: Ferma Sessione Operatore');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('👤 Operatore target:', targetOperator);
    console.log('👤 Operatore corrente:', operator);
    console.log('🔐 Sessione target:', generateOperatorSession(targetOperator));
    
    if (targetOperator === operator) {
      console.warn('⚠️ Tentativo di fermare propria sessione, negato');
      addLog('❌ Non puoi fermare la tua stessa sessione da qui!', true);
      console.groupEnd();
      return;
    }
    
    const targetSession = generateOperatorSession(targetOperator);
    addLog(`🔄 Tentativo di fermare sessione Operatore ${targetOperator}...`);
    
    try {
      console.log('📡 Invio richiesta al server...');
      const requestBody = { session: targetSession, active: false };
      console.log('📦 Body richiesta:', requestBody);
      
      const response = await fetch('/api/qrseat/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📡 Risposta ricevuta, status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📦 Dati risposta:', data);
      
      if (!data.ok) {
        throw new Error('Aggiornamento stato fallito');
      }
      
      addLog(`✅ Sessione Operatore ${targetOperator} fermata con successo`);
      console.log('✅ Sessione fermata, refresh stati...');
      checkAdminOperatorStates();
      checkActiveOperators();
      
      console.log('✅ Stop operatore completato');
      console.groupEnd();
    } catch (err) {
      console.error('❌ ERRORE durante stop operatore:', err);
      console.log('📊 Context errore:', {
        targetOperator,
        targetSession,
        currentOperator: operator,
        error: err
      });
      addLog(`❌ Errore nel fermare Operatore ${targetOperator}: ${err}`, true);
      console.groupEnd();
    }
  };

  // NEW: Register viewer with server
  const registerViewer = useCallback(async (operatorId: number, name: string) => {
    try {
      const response = await fetch('/api/qrseat/viewers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          operatorName: name,
          operatorId
        })
      });
      
      const data = await response.json();
      if (data.ok) {
        addLog(`✅ Registrato come "${name}" su Operatore ${operatorId}`);
      }
    } catch (err) {
      console.error('Errore registrazione viewer:', err);
    }
  }, [deviceId, addLog]);

  // NEW: Unregister viewer from server
  const unregisterViewer = useCallback(async () => {
    try {
      await fetch(`/api/qrseat/viewers?deviceId=${encodeURIComponent(deviceId)}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Errore unregister viewer:', err);
    }
  }, [deviceId]);

  // NEW: Check if someone else started the session and redirect
  const checkSessionConflict = useCallback(async () => {
    if (!operator || !operatorName || isSessionActive) return;
    
    try {
      // Check if session became active
      const operatorSession = generateOperatorSession(operator);
      const statusResponse = await fetch(`/api/qrseat/status?session=${encodeURIComponent(operatorSession)}`);
      const statusData = await statusResponse.json();
      
      if (statusData.ok && statusData.active === true) {
        // Session is now active - check if WE started it
        // If isSessionActive is still false, someone ELSE started it
        addLog(`⚠️ Operatore ${operator} avviato da un altro dispositivo! Reindirizzamento...`, true);
        
        // Unregister and redirect
        await unregisterViewer();
        router.push('/receiver');
      }
    } catch (err) {
      console.error('Errore check session conflict:', err);
    }
  }, [operator, operatorName, isSessionActive, unregisterViewer, router, addLog]);

  // NEW: Check if logged in and redirect to login if not
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('qrseat-logged-in');
    const storedOperator = localStorage.getItem('qrseat-operator');
    const storedName = localStorage.getItem('qrseat-operator-name');
    
    if (!isLoggedIn || !storedOperator || !storedName) {
      router.push('/login');
      return;
    }
    
    // Load operator and name from localStorage
    const operatorNum = parseInt(storedOperator);
    setOperator(operatorNum);
    setOperatorName(storedName);
    addLog(`✅ Benvenuto, ${storedName}! Operatore ${operatorNum} caricato.`);
  }, [router, addLog]);

  // NEW: Logout function
  const handleLogout = async () => {
    if (isSessionActive) {
      addLog('❌ Ferma la sessione prima di fare logout!', true);
      return;
    }
    
    // Unregister viewer
    await unregisterViewer();
    
    // Clear localStorage
    localStorage.removeItem('qrseat-logged-in');
    localStorage.removeItem('qrseat-operator');
    localStorage.removeItem('qrseat-operator-name');
    
    // Redirect to login
    router.push('/login');
  };

  // NEW: Register viewer when operator changes
  useEffect(() => {
    if (operator > 0 && operatorName) {
      registerViewer(operator, operatorName);
      
      // Start polling for session conflicts
      viewerPollingRef.current = setInterval(() => {
        checkSessionConflict();
      }, 2000);
      
      return () => {
        if (viewerPollingRef.current) {
          clearInterval(viewerPollingRef.current);
          viewerPollingRef.current = null;
        }
      };
    }
  }, [operator, operatorName, registerViewer, checkSessionConflict]);

  // NEW: Unregister on unmount
  useEffect(() => {
    return () => {
      unregisterViewer();
    };
  }, [unregisterViewer]);

  // MODIFIED: Load config on mount - NO operator dialog, NO operator dropdown
  useEffect(() => {
    const config = loadConfig();
    if (config) {
      if (config.baseUrl) setBaseUrl(config.baseUrl);
      if (config.pollingInterval) setPollingInterval(config.pollingInterval);
      if (config.target) setTarget(config.target);
    }
    
    // Check active operators on mount
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
  }, []);

  // CRITICAL: Periodically refresh active operators list
  useEffect(() => {
    const interval = setInterval(() => {
      checkActiveOperators();
      // FIXED: Always update admin panel, even without operator selected
      checkAdminOperatorStates();
      // NEW: Fetch active viewers for admin panel
      fetchActiveViewers();
    }, 2000); // OPTIMIZED: Reduced from 3000ms to 2000ms for faster sync
    
    return () => clearInterval(interval);
  }, [checkActiveOperators, checkAdminOperatorStates, fetchActiveViewers]);

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
    console.group('🖱️ CLICK: Copia negli Appunti');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🆔 Button ID:', buttonId);
    console.log('📝 Testo da copiare:', text);
    console.log('📏 Lunghezza testo:', text.length);
    console.log('🔐 Session corrente:', session);
    console.log('👤 Operatore corrente:', operator);
    
    const button = document.getElementById(buttonId);
    
    try {
      // Try modern Clipboard API first
      await navigator.clipboard.writeText(text);
      
      console.log('✅ Metodo: Clipboard API (moderno)');
      console.log('✅ Risultato: Successo');
      
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copiato!';
        console.log('🔄 Testo bottone cambiato:', originalText, '→', 'Copiato!');
        setTimeout(() => {
          button.textContent = originalText || 'Copia';
          console.log('🔄 Testo bottone ripristinato:', 'Copiato!', '→', originalText || 'Copia');
        }, 1500);
      }
      addLog('✅ Testo copiato negli appunti');
      console.groupEnd();
    } catch (err) {
      console.warn('⚠️ Clipboard API fallito:', err);
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
        
        console.log('🔄 Metodo: execCommand (fallback)');
        console.log('📊 Risultato execCommand:', successful);
        
        if (successful) {
          if (button) {
            const originalText = button.textContent;
            button.textContent = 'Copiato!';
            console.log('🔄 Testo bottone cambiato:', originalText, '→', 'Copiato!');
            setTimeout(() => {
              button.textContent = originalText || 'Copia';
              console.log('🔄 Testo bottone ripristinato:', 'Copiato!', '→', originalText || 'Copia');
            }, 1500);
          }
          addLog('✅ Testo copiato (metodo alternativo)');
          console.log('✅ Risultato finale: Successo (metodo alternativo)');
          console.groupEnd();
        } else {
          throw new Error('Fallback copy failed');
        }
      } catch (fallbackErr) {
        console.error('❌ Tutti i metodi di copia falliti:', fallbackErr);
        console.log('🖼️ Context:', {
          isIframe: window.self !== window.top,
          hasClipboard: !!navigator.clipboard,
          documentHasFocus: document.hasFocus()
        });
        // If both methods fail, show error message
        addLog('⚠️ Impossibile copiare automaticamente. Copia manualmente il testo.', true);
        if (button) {
          const originalText = button.textContent;
          button.textContent = '❌ Copia manuale';
          console.log('🔄 Testo bottone cambiato:', originalText, '→', '❌ Copia manuale');
          setTimeout(() => {
            button.textContent = originalText || 'Copia';
            console.log('🔄 Testo bottone ripristinato:', '❌ Copia manuale', '→', originalText || 'Copia');
          }, 2000);
        }
        console.groupEnd();
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

  // MODIFIED: Initialize session - use operator from localStorage
  useEffect(() => {
    if (!operator || !operatorName) return; // Wait for login check
    
    let sessionId = searchParams.get('session');
    
    if (!sessionId && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      sessionId = urlParams.get('session');
    }
    
    // Generate session for logged-in operator
    if (!sessionId) {
      sessionId = generateOperatorSession(operator);
    }

    addLog(`Sessione inizializzata: ${sessionId}`);
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
  }, [operator, operatorName, searchParams, addLog]);

  // Handle operator change
  const handleOperatorChange = async (newOperator: number) => {
    console.group('🖱️ CLICK: Cambio Operatore');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('👤 Operatore precedente:', operator);
    console.log('👤 Nuovo operatore:', newOperator);
    console.log('🔐 Session precedente:', session);
    console.log('🟢 Sessione attiva?', isSessionActive);
    console.log('📊 Operatori attivi:', Array.from(activeOperators));
    
    // CRITICAL: Block operator change if session is active
    if (isSessionActive) {
      console.warn('⚠️ Tentativo di cambio operatore con sessione attiva, negato');
      addLog('❌ Ferma la sessione prima di cambiare operatore!', true);
      console.groupEnd();
      return;
    }
    
    addLog(`🔄 Cambio operatore a ${newOperator}...`);
    
    // Set operator immediately
    setOperator(newOperator);
    saveOperator(newOperator);
    console.log('✅ Operatore salvato in state e localStorage');
    
    // CRITICAL: Reset state when changing operator
    addLog(`✅ Operatore ${newOperator} selezionato, inizializzazione...`);
    setStatus('Inizializzazione...');
    setBlockedUrl('');
    setIsSessionActive(false);
    prevIsSessionActive.current = false;
    console.log('🔄 Stati resettati (status, blockedUrl, isSessionActive)');
    
    // Generate new session for selected operator
    const newSession = generateOperatorSession(newOperator);
    console.log('🆕 Nuova sessione generata:', newSession);
    setSession(newSession);
    saveSessionToStorage(newSession);
    
    // CRITICAL: Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('session', newSession);
    window.history.replaceState(null, '', url.toString());
    console.log('🔗 URL aggiornato:', url.toString());
    addLog(`✅ URL aggiornato: ${url.toString()}`);
    
    // CRITICAL: Generate sender URL and QR code DIRECTLY (don't wait for useEffect)
    const senderUrlObj = new URL(window.location.origin);
    senderUrlObj.pathname = '/sender';
    senderUrlObj.searchParams.set('session', newSession);
    const senderUrlStr = senderUrlObj.toString();
    
    setSenderUrl(senderUrlStr);
    console.log('📱 URL Sender generato:', senderUrlStr);
    addLog(`✅ URL Sender aggiornato: ${senderUrlStr}`);
    
    // CRITICAL: Regenerate QR code immediately
    try {
      console.log('📸 Inizio generazione QR code...');
      const qrUrl = await generateQrCode(senderUrlStr);
      setQrDataUrl(qrUrl);
      console.log('✅ QR Code generato, lunghezza data URL:', qrUrl.length);
      addLog(`✅ QR Code rigenerato per Operatore ${newOperator}`);
      addLog(`✅ Cambiato a Operatore ${newOperator} - Sessione: ${newSession}`);
      addLog('Sistema pronto. Premi "Avvia Sessione" per iniziare.');
      setStatus('Sessione in pausa - Premi "Avvia Sessione"');
    } catch (err) {
      console.error('❌ Errore generazione QR:', err);
      addLog('Errore generazione QR: ' + err, true);
    }
    
    // CRITICAL: Refresh active operators list after change
    console.log('🔄 Refresh lista operatori attivi...');
    checkActiveOperators(newOperator);
    
    // If switching to any operator, load admin panel
    if (newOperator > 0) {
      console.log('🔄 Caricamento stati admin panel...');
      checkAdminOperatorStates();
    }
    
    console.log('✅ Cambio operatore completato');
    console.groupEnd();
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
    console.group('🖱️ CLICK: Toggle Sessione');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🔐 Session:', session);
    console.log('👤 Operatore:', operator);
    console.log('🟢 Stato corrente:', isSessionActive ? 'ATTIVA' : 'INATTIVA');
    console.log('🔄 Nuovo stato:', !isSessionActive ? 'ATTIVA' : 'INATTIVA');
    
    if (!session) {
      console.error('❌ Nessuna sessione, uscita');
      console.groupEnd();
      return;
    }
    
    const newState = !isSessionActive;
    addLog(`🔄 ${newState ? 'Avvio' : 'Fermo'} sessione...`);
    
    try {
      console.log('📡 Invio richiesta al server...');
      const requestBody = { session, active: newState };
      console.log('📦 Body richiesta:', requestBody);
      
      // CRITICAL: Wait for server confirmation before updating local state
      const response = await fetch('/api/qrseat/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📡 Risposta ricevuta, status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`Errore HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📦 Dati risposta:', data);
      
      if (!data.ok) {
        throw new Error('Aggiornamento stato fallito');
      }
      
      // SUCCESS: Update local state only after server confirmation
      setIsSessionActive(newState);
      console.log('✅ Stato locale aggiornato:', newState);
      addLog(`✅ Sessione ${newState ? 'AVVIATA' : 'FERMATA'} con successo`);
      
      console.log('✅ Toggle sessione completato con successo');
      console.groupEnd();
      
    } catch (err) {
      console.error('❌ ERRORE durante toggle sessione:', err);
      console.log('📊 Context errore:', {
        session,
        operator,
        wasActive: isSessionActive,
        attemptedState: newState,
        error: err
      });
      addLog(`❌ ERRORE aggiornamento stato: ${err}`, true);
      addLog(`⚠️ Stato locale NON modificato per sicurezza`, true);
      console.groupEnd();
    }
  };

  return (
    <>
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
            
            {/* MODIFIED: Show logged-in operator info instead of dropdown */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <Badge variant="default" className="text-base px-4 py-2">
                {operatorName} - Operatore {operator}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1">
                operator-{operator}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                disabled={isSessionActive}
                title={isSessionActive ? 'Ferma la sessione prima di fare logout' : 'Logout'}
              >
                <LogOut className="w-4 h-4" />
              </Button>
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
              {operator === 1 && (
                <Link href="/config">
                  <Button variant="outline" size="lg">
                    <Settings className="w-4 h-4 mr-2" />
                    Configurazione
                  </Button>
                </Link>
              )}
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
                        console.group('🖱️ CLICK: Apri Link Bloccato');
                        console.log('⏰ Timestamp:', new Date().toISOString());
                        console.log('🔗 URL da aprire:', blockedUrl);
                        console.log('🔐 Session:', session);
                        console.log('👤 Operatore:', operator);
                        window.open(blockedUrl, '_blank', 'noopener,noreferrer');
                        console.log('✅ window.open eseguito');
                        setBlockedUrl('');
                        console.log('✅ Banner nascosto');
                        console.groupEnd();
                      }}
                    >
                      Apri Link
                    </Button>
                    <Button
                      size="lg"
                      variant="ghost"
                      onClick={() => {
                        console.group('🖱️ CLICK: Chiudi Banner Bloccato');
                        console.log('⏰ Timestamp:', new Date().toISOString());
                        console.log('🔗 URL bloccato (nascosto):', blockedUrl);
                        setBlockedUrl('');
                        console.log('✅ Banner nascosto');
                        console.groupEnd();
                      }}
                      className="px-3"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Admin Panel - Only visible to Operator 1 */}
          {operator === 1 && (
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
                    const viewers = activeViewers[op] || [];
                    
                    return (
                      <div 
                        key={op}
                        className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
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
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            👥 Operatori fisici: {viewers.length > 0 ? viewers.join(', ') : 'Nessuno'}
                          </div>
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
    </>
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