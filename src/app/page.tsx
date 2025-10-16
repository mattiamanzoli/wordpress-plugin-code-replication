"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Zap, QrCode, ArrowRight, Settings } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-6">
            <QrCode className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            QR-Seatable Bridge
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Collega il tuo smartphone al desktop tramite QR code. Scansiona codici sul telefono e reindirizza automaticamente il browser desktop.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/receiver">
              <Button size="lg" className="w-full sm:w-auto text-lg">
                <Monitor className="w-5 h-5 mr-2" />
                Apri Receiver (Desktop)
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/sender">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg">
                <Smartphone className="w-5 h-5 mr-2" />
                Apri Sender (Mobile)
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/config">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto text-lg">
                <Settings className="w-5 h-5 mr-2" />
                Configurazione
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                <Monitor className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle>Receiver (Desktop)</CardTitle>
              <CardDescription>
                Mostra il QR code di pairing e resta in ascolto per gli ID scansionati dal telefono
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Genera automaticamente una sessione unica</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>QR code per connettere il sender</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Polling in tempo reale con log live</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Redirect automatico al link Seatable</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                <Smartphone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle>Sender (Mobile)</CardTitle>
              <CardDescription>
                Scansiona QR code con la fotocamera e invia l&apos;ID al receiver desktop
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Scanner QR integrato con accesso camera</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Controllo torcia per ambienti bui</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Feedback tattile (vibrazione) su scan</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Modalità param o raw per estrazione ID</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Funzionalità</CardTitle>
              <CardDescription>
                Sistema robusto di pairing e comunicazione tra dispositivi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>REST API per send e next con gestione sessioni</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>TTL automatico per pulizia messaggi</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Configurazione personalizzabile</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Supporto dark mode completo</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* How it Works */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">
            Come Funziona
          </h2>
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                  Apri il Receiver sul Desktop
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  La pagina Receiver genera automaticamente una sessione unica e mostra un QR code di pairing. Questa sessione collega il tuo desktop al telefono.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                  Scansiona il QR Code di Pairing
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Con il tuo smartphone, scansiona il QR code mostrato sul desktop. Questo aprirà automaticamente la pagina Sender con la sessione già configurata.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                  Scansiona i QR Code
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Ora puoi scansionare qualsiasi QR code contenente un ID o URL. Il Sender invierà automaticamente l&apos;ID alla sessione attiva e il Receiver reindirizza il browser desktop al link corrispondente.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                  Configurazione Personalizzata
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Personalizza la Base URL (con placeholder {'{id}'}), l&apos;intervallo di polling, la modalità di estrazione ID e altre opzioni direttamente dalle pagine Receiver e Sender.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <Card className="max-w-2xl mx-auto bg-gradient-to-br from-blue-500 to-purple-600 border-0">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold text-white mb-4">
                Pronto per Iniziare?
              </h2>
              <p className="text-blue-50 mb-6">
                Apri il Receiver sul tuo desktop e scansiona il QR code con il telefono. È semplicissimo!
              </p>
              <Link href="/receiver">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  <Monitor className="w-5 h-5 mr-2" />
                  Inizia Ora
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400">
          <p>QR-Seatable Bridge • Next.js 15 App</p>
          <p className="text-sm mt-2">
            Ricreato dal plugin WordPress originale
          </p>
        </div>
      </footer>
    </div>
  );
}