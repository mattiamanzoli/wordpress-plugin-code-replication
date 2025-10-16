"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Config {
  baseUrl: string;
  pollingInterval: number;
  target: '_self' | '_blank';
  mode: 'param' | 'raw';
  redirect: boolean;
  messageTTL: number;
}

const DEFAULT_CONFIG: Config = {
  baseUrl: 'https://seatable.tuo/view/row/{id}',
  pollingInterval: 1200,
  target: '_self',
  mode: 'param',
  redirect: false,
  messageTTL: 300000, // 5 minutes
};

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<boolean>(false);

  // Load config from localStorage on mount
  useEffect(() => {
    const storedConfig = localStorage.getItem('qrseat-config');
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch (err) {
        console.error('Error loading config:', err);
      }
    }
  }, []);

  // Save config to localStorage
  const saveConfig = () => {
    localStorage.setItem('qrseat-config', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Reset to defaults
  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem('qrseat-config');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-slate-500 to-gray-600 rounded-2xl mb-4">
            <Settings className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Configurazione
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Imposta le preferenze globali per QR-Seatable Bridge
          </p>
        </div>

        {/* Success Message */}
        {saved && (
          <div className="text-center">
            <Badge className="bg-green-500">
              ✓ Configurazione salvata con successo!
            </Badge>
          </div>
        )}

        {/* Base URL Settings */}
        <Card>
          <CardHeader>
            <CardTitle>URL di Base</CardTitle>
            <CardDescription>
              Template URL per i redirect. Usa {'{id}'} come placeholder per l&apos;ID estratto dal QR code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                placeholder="https://seatable.tuo/view/row/{id}"
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-2">
                Esempio: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  https://seatable.tuo/view/row/{'{id}'}
                </code>
              </p>
            </div>

            <div>
              <Label htmlFor="target">Target Redirect</Label>
              <select
                id="target"
                value={config.target}
                onChange={(e) => setConfig({ ...config, target: e.target.value as '_self' | '_blank' })}
                className="w-full mt-2 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="_self">Stessa finestra (_self)</option>
                <option value="_blank">Nuova finestra (_blank)</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Determina se il redirect apre il link nella stessa finestra o in una nuova tab.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Receiver Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Impostazioni Receiver</CardTitle>
            <CardDescription>
              Configurazione per la pagina Receiver (desktop)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pollingInterval">Intervallo Polling (ms)</Label>
              <Input
                id="pollingInterval"
                type="number"
                value={config.pollingInterval}
                onChange={(e) => setConfig({ 
                  ...config, 
                  pollingInterval: Math.max(400, parseInt(e.target.value) || 1200) 
                })}
                min="400"
                step="100"
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-2">
                Frequenza con cui il Receiver controlla nuovi messaggi (minimo 400ms, consigliato 800-1500ms).
              </p>
            </div>

            <div>
              <Label htmlFor="messageTTL">TTL Messaggi (ms)</Label>
              <Input
                id="messageTTL"
                type="number"
                value={config.messageTTL}
                onChange={(e) => setConfig({ 
                  ...config, 
                  messageTTL: Math.max(60000, parseInt(e.target.value) || 300000) 
                })}
                min="60000"
                step="60000"
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-2">
                Tempo di conservazione dei messaggi in memoria (minimo 1 minuto, default 5 minuti).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sender Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Impostazioni Sender</CardTitle>
            <CardDescription>
              Configurazione per la pagina Sender (mobile)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="mode">Modalità Estrazione ID</Label>
              <select
                id="mode"
                value={config.mode}
                onChange={(e) => setConfig({ ...config, mode: e.target.value as 'param' | 'raw' })}
                className="w-full mt-2 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="param">Parametro (estrae ?id=...)</option>
                <option value="raw">Raw (usa contenuto completo)</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                <strong>Param:</strong> estrae l&apos;ID dal parametro ?id= nell&apos;URL del QR code.<br />
                <strong>Raw:</strong> usa l&apos;intero contenuto del QR code come ID.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="redirect"
                checked={config.redirect}
                onChange={(e) => setConfig({ ...config, redirect: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <div className="flex-1">
                <Label htmlFor="redirect" className="cursor-pointer">
                  Reindirizza anche il telefono
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Se abilitato, dopo l&apos;invio dell&apos;ID, anche lo smartphone verrà reindirizzato al link finale.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={saveConfig} className="flex-1" size="lg">
            <Save className="w-5 h-5 mr-2" />
            Salva Configurazione
          </Button>
          <Button onClick={resetConfig} variant="outline" className="flex-1" size="lg">
            <RotateCcw className="w-5 h-5 mr-2" />
            Ripristina Default
          </Button>
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              ℹ️ Nota Importante
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Le configurazioni sono salvate nel localStorage del browser. Per applicare le modifiche alle pagine Receiver e Sender, ricaricale dopo aver salvato le impostazioni.
            </p>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-center gap-4 pt-4">
          <Link href="/">
            <Button variant="outline">← Torna alla Home</Button>
          </Link>
          <Link href="/receiver">
            <Button variant="outline">Apri Receiver</Button>
          </Link>
          <Link href="/sender">
            <Button variant="outline">Apri Sender</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}