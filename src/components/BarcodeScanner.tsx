/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Camera, Keyboard, CheckCircle, RefreshCcw, Tablet, AlertTriangle, Play } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product } from '../types';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  availableProducts: Product[];
}

export default function BarcodeScanner({ onScan, availableProducts }: BarcodeScannerProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'portable' | 'simulate'>('portable');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  // Buffer state for background physical scanner tracking
  const keyBufferRef = useRef<{ char: string; time: number }[]>([]);
  const lastKeyTimeRef = useRef<number>(0);

  // --- Handlers for Camera Scanner using html5-qrcode ---
  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);
    // Give state a moment to render the container
    setTimeout(async () => {
      try {
        const html5Qrcode = new Html5Qrcode("reader");
        qrScannerRef.current = html5Qrcode;

        const scanConfig = {
          fps: 10,
          qrbox: (width: number, height: number) => {
            // Custom scanning region box for barcodes (wide and short)
            const size = Math.min(width, height);
            return {
              width: Math.floor(width * 0.8),
              height: Math.floor(size * 0.4)
            };
          }
        };

        const successCallback = (decodedText: string) => {
          // Success
          playScanSound();
          onScan(decodedText);
          stopCamera();
        };

        const errorCallback = (errorMessage: string) => {
          // This triggers constantly for every frames with no codes, ignore it in UI
        };

        let isStarted = false;

        // 1. Try environment/rear camera first
        try {
          await html5Qrcode.start(
            { facingMode: "environment" },
            scanConfig,
            successCallback,
            errorCallback
          );
          isStarted = true;
        } catch (envErr) {
          console.warn("Could not launch environmental rear-camera, trying next fallback...", envErr);
        }

        // 2. Try user/front camera next
        if (!isStarted) {
          try {
            await html5Qrcode.start(
              { facingMode: "user" },
              scanConfig,
              successCallback,
              errorCallback
            );
            isStarted = true;
          } catch (userErr) {
            console.warn("Could not launch user/front camera, searching for any camera device ID...", userErr);
          }
        }

        // 3. Try fallback to any listed camera device
        if (!isStarted) {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            await html5Qrcode.start(
              devices[0].id,
              scanConfig,
              successCallback,
              errorCallback
            );
            isStarted = true;
          } else {
            throw new Error("Nenhuma câmera física detectada ou permissão de vídeo negada.");
          }
        }
      } catch (err: any) {
        console.error("Camera error:", err);
        setCameraError(
          `Não foi possível acessar a câmera (${err.message || err}). Verifique as permissões de vídeo do seu navegador ou mude para a aba de Leitor Portátil / Simulador.`
        );
        setIsScanning(false);
      }
    }, 150);
  };

  const stopCamera = async () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner", err);
      }
    }
    qrScannerRef.current = null;
    setIsScanning(false);
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  // --- Physical Keyboard / Portable Barcode Reader listener ---
  // A physical/portable scanner acts as a keyboard and types numbers fast, sending an Enter key at the end.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      
      // If we are typing in standard form inputs (except the dedicated barcode scanner input),
      // we don't want the background global reader to steal keypresses.
      if (
        document.activeElement?.tagName === 'INPUT' && 
        !(document.activeElement as HTMLInputElement).classList.contains('portable-input')
      ) {
        return;
      }

      // Ignore modifiers
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      // Reset buffer if delay since last character is too long (> 100ms)
      if (now - lastKeyTimeRef.current > 100) {
        keyBufferRef.current = [];
      }
      
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 4) {
          const barcode = keyBufferRef.current.map(k => k.char).join('');
          e.preventDefault();
          playScanSound();
          onScan(barcode);
          // Highlight the background scanner input briefly
          const bgInput = document.querySelector('.portable-input') as HTMLInputElement;
          if (bgInput) {
            bgInput.value = barcode;
            setTimeout(() => { bgInput.value = ''; }, 1000);
          }
        }
        keyBufferRef.current = [];
      } else if (e.key.length === 1) {
        keyBufferRef.current.push({ char: e.key, time: now });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [onScan]);

  const playScanSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6 Note
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.log('AudioContext not allowed or not supported:', e);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      playScanSound();
      onScan(manualInput.trim());
      setManualInput('');
    }
  };

  return (
    <div id="barcode-scanner-widget" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-slate-800">
      {/* Tab selection */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <button
          id="tab-portable-scanner"
          onClick={() => setActiveTab('portable')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'portable'
              ? 'bg-white text-amber-700 border-b-2 border-amber-600 font-bold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
          }`}
        >
          <Keyboard size={16} />
          <span>Leitor Portátil (Físico)</span>
        </button>

        <button
          id="tab-camera-scanner"
          onClick={() => setActiveTab('camera')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'camera'
              ? 'bg-white text-amber-700 border-b-2 border-amber-600 font-bold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
          }`}
        >
          <Camera size={16} />
          <span>Câmera Android</span>
        </button>

        <button
          id="tab-simulate-scanner"
          onClick={() => setActiveTab('simulate')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'simulate'
              ? 'bg-white text-amber-700 border-b-2 border-amber-600 font-bold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
          }`}
        >
          <Play size={16} />
          <span>Simulador</span>
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'portable' && (
          <div className="space-y-4" id="portable-scanner-pane">
            <div className="flex items-center gap-4 bg-slate-50 p-4 border border-slate-200/60 rounded-lg">
              <div className="bg-amber-500/10 text-amber-600 p-2.5 rounded-lg flex-shrink-0 animate-pulse">
                <Tablet size={24} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Leitor Portátil Ativo em Segundo Plano</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Basta apontar o seu leitor portátil (USB/Bluetooth/Android Integrado) e escanear qualquer código. O sistema detectará automaticamente!
                </p>
              </div>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <label htmlFor="barcode-search-input" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Ou digite/escaneie no campo abaixo:
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="barcode-search-input"
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Cole, digite ou bipe com o leitor aqui..."
                    className="portable-input w-full bg-slate-50 border border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-850 placeholder-slate-400 rounded-lg py-2.5 px-4 font-mono text-sm leading-relaxed outline-none"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="bg-amber-550 hover:bg-amber-600 text-slate-850 font-semibold transition-colors px-5 rounded-lg text-sm flex items-center justify-center gap-2 shadow-sm border border-amber-400 cursor-pointer"
                >
                  <CheckCircle size={16} />
                  <span>Confirmar</span>
                </button>
              </div>
            </form>

            <div className="text-[11px] text-slate-450 border-t border-slate-100 pt-3">
              💡 <span className="font-semibold text-slate-650">Dica:</span> Leitores portáteis funcionam digitando o código rapidamente. Certifique-se de que o layout do teclado externo esteja configurado como padrão no Android ou computador.
            </div>
          </div>
        )}

        {activeTab === 'camera' && (
          <div className="space-y-4" id="camera-scanner-pane">
            {cameraError ? (
              <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg flex items-start gap-3">
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-red-500" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{cameraError}</p>
                  <p className="text-[11px] text-red-500/80">
                    O iframe do AI Studio costuma restringir a câmera. Se necessário, abra o applet em uma nova aba usando o botão no cabeçalho ou use a aba do simulador ao lado para testar.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-medium">
                  Posicione o código de barras de forma horizontal dentro do quadrado de marcação.
                </p>
                <div className="relative border-2 border-slate-200 rounded-lg overflow-hidden bg-slate-50 aspect-video max-w-md mx-auto">
                  <div id="reader" className="w-full h-full"></div>
                  
                  {/* Visual reticle overlay over camera */}
                  {isScanning && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                      <div className="w-[80%] h-[35%] border-2 border-amber-500 rounded-md bg-transparent relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                        {/* Scanning animated red line */}
                        <div className="absolute left-0 right-0 h-[2px] bg-red-500 animate-bounce shadow-lg shadow-red-500" style={{ top: '50%' }}></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    onClick={async () => {
                       await stopCamera();
                       await startCamera();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-800 font-bold py-1.5 px-3.5 border border-slate-200 hover:bg-slate-50 rounded-lg bg-white shadow-sm transition-colors cursor-pointer"
                  >
                    <RefreshCcw size={12} />
                    <span>Reiniciar Câmera</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'simulate' && (
          <div className="space-y-4" id="simulate-scanner-pane">
            <p className="text-xs text-slate-500 font-medium">
              Perfeito para realizar testes sem scanner físico ou câmera física: escolha um dos produtos abaixo para simular uma leitura instantânea.
            </p>
            {availableProducts.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Cadastre produtos primeiro para vê-los aqui no simulador</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left max-h-[180px] overflow-y-auto pr-1">
                {availableProducts.map((p) => (
                  <button
                    key={p.barcode}
                    onClick={() => {
                      playScanSound();
                      onScan(p.barcode);
                    }}
                    className="p-2.5 rounded-lg border border-slate-200 hover:border-amber-400 bg-slate-50/50 hover:bg-white duration-150 transition-all flex flex-col items-start gap-1 cursor-pointer shadow-sm animate-fade-in"
                  >
                    <div className="flex justify-between items-start w-full gap-1">
                      <span className="font-bold text-xs text-slate-800 line-clamp-1">{p.name}</span>
                      <span className="text-[10px] bg-slate-100 text-slate-655 px-1.5 uppercase rounded-sm flex-shrink-0 font-bold">
                        {p.packaging}
                      </span>
                    </div>
                    <code className="text-[10px] text-amber-600 font-mono tracking-wider font-bold">{p.barcode}</code>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
