"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate username format: operatore1, operatore2, etc.
    const usernameMatch = username.toLowerCase().match(/^operatore([1-5])$/);
    
    if (!usernameMatch) {
      setError('Username deve essere nel formato "operatore1", "operatore2", ecc. (1-5)');
      setLoading(false);
      return;
    }

    const operatorNum = parseInt(usernameMatch[1]);

    // Validate password matches username
    if (password.toLowerCase() !== username.toLowerCase()) {
      setError('Password deve essere uguale allo username');
      setLoading(false);
      return;
    }

    // Validate operator name
    if (!operatorName.trim()) {
      setError('Inserisci il tuo nome');
      setLoading(false);
      return;
    }

    // Check if operator session is already active
    try {
      const operatorSession = `operator-${operatorNum}`;
      const response = await fetch(`/api/qrseat/status?session=${encodeURIComponent(operatorSession)}`);
      const data = await response.json();
      
      if (data.ok && data.active === true) {
        setError(`Operatore ${operatorNum} è già attivo. Scegli un altro operatore o attendi che si disconnetta.`);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('Errore verifica stato operatore:', err);
    }

    // Save to localStorage
    try {
      localStorage.setItem('qrseat-operator', operatorNum.toString());
      localStorage.setItem('qrseat-operator-name', operatorName.trim());
      localStorage.setItem('qrseat-logged-in', 'true');
      
      // Generate device ID if not exists
      if (!localStorage.getItem('qrseat-device-id')) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let deviceId = 'device-';
        for (let i = 0; i < 16; i++) {
          deviceId += chars[Math.floor(Math.random() * chars.length)];
        }
        localStorage.setItem('qrseat-device-id', deviceId);
      }

      // Redirect to receiver with operator session
      router.push(`/receiver?session=operator-${operatorNum}`);
    } catch (err) {
      setError('Errore salvataggio credenziali');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <LogIn className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Login Operatore</CardTitle>
          <CardDescription>
            Accedi con le tue credenziali operatore
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="operatore1, operatore2, ecc..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
              <p className="text-xs text-gray-500">
                Formato: operatore1, operatore2, operatore3, operatore4, operatore5
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Stesso dello username"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="operator-name">Il tuo Nome</Label>
              <Input
                id="operator-name"
                type="text"
                placeholder="Es: Marco, Luigi, Sara..."
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                required
                autoComplete="name"
              />
              <p className="text-xs text-gray-500">
                Inserisci il tuo nome per identificarti nel sistema
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Accesso...' : 'Accedi'}
            </Button>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">
                ℹ️ Credenziali
              </h4>
              <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <p>• Username: <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded">operatore1</code> ... <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded">operatore5</code></p>
                <p>• Password: uguale allo username</p>
                <p>• Esempio: <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded">operatore1</code> / <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded">operatore1</code></p>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}