import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, ZoomIn, Info, CheckCircle2, Play, Zap, Sparkles } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
  scanActionMode?: 'entrada' | 'saida' | 'consulta';
  setScanActionMode?: (mode: 'entrada' | 'saida' | 'consulta') => void;
}

interface CustomCameraDevice {
  id: string;
  label: string;
}

export default function BarcodeScanner({ 
  onScan, 
  onClose,
  scanActionMode,
  setScanActionMode
}: BarcodeScannerProps) {
  const [cameras, setCameras] = useState<CustomCameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('environment');
  const [scanStatus, setScanStatus] = useState<'scanning' | 'success' | 'error' | 'initializing'>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(1);
  const [minZoom, setMinZoom] = useState<number>(1);
  const [supportsZoom, setSupportsZoom] = useState<boolean>(false);
  
  // Ultra fast optimization tools: Only scan retail 1D formats (EAN/UPC) by default (90% faster)
  const [scanMode, setScanMode] = useState<'ean_upc' | 'all'>('ean_upc');
  const [useHardwareAcceleration, setUseHardwareAcceleration] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window;
  });
  
  // Custom test simulation lists for ease of preview in browser iframe
  const SAMPLE_BARCODES = [
    { code: '7891000123456', name: 'Arroz Agulha Tipo 1 Prato Fino (Cadastrado)' },
    { code: '5601008001024', name: 'Azeite de Oliva Extra Virgem Gallo (Cadastrado)' },
    { code: '7894900700046', name: 'Coca-Cola Original Pet 2L (Cadastrado)' },
    { code: '7891024036122', name: 'Sabão em Pó OMO 1.6kg (Cadastrado)' },
    { code: '7891000315507', name: '⚡ [Não Cadastrado] Choc. Garoto Talento Avelã' },
    { code: '7891000248706', name: '⚡ [Não Cadastrado] Nescau Achocolatado Pó 400g' },
    { code: '7896004000108', name: '⚡ [Não Cadastrado] Suco Del Valle Uva/Laranja' }
  ];

  const [simulatedBarcode, setSimulatedBarcode] = useState<string>(SAMPLE_BARCODES[0].code);
  const [customBarcodeInput, setCustomBarcodeInput] = useState<string>('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedCodeRef = useRef<string>('');
  const isTransitioningRef = useRef<boolean>(false);
  const qrCodeId = 'html5-qrcode-reader-element';

  // Helper to generate a friendly beep when a code is scanned
  const playBeepSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 880; // Standard higher beep
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      console.warn('Audio contexts not allowed in current tab context', e);
    }
  };

  const discoverCameras = () => {
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices && devices.length > 0) {
          const formattedDevices = devices.map((d, index) => {
            let label = d.label || '';
            if (label.toLowerCase().includes('back') || label.toLowerCase().includes('trás') || label.toLowerCase().includes('traseira') || label.toLowerCase().includes('environment')) {
              label = `🎥 Traseira: ${label || 'Câmera ' + (index + 1)}`;
            } else if (label.toLowerCase().includes('front') || label.toLowerCase().includes('frente') || label.toLowerCase().includes('frontal') || label.toLowerCase().includes('user')) {
              label = `🤳 Frontal: ${label || 'Câmera ' + (index + 1)}`;
            } else {
              label = `📷 Câmera ${index + 1} (${label || 'Auxiliar'})`;
            }
            return {
              id: d.id,
              label: label
            };
          });
          setCameras(formattedDevices);
        } else {
          setCameras([]);
        }
      })
      .catch(err => {
        console.warn('Error fetching camera list: ', err);
      });
  };

  // Single React lifecycle hook for initializing and teardown on mount,
  // completely avoiding concurrent reactivation loops.
  useEffect(() => {
    startScanner(selectedCameraId || 'environment', 'ean_upc', typeof window !== 'undefined' && 'BarcodeDetector' in window);

    // We fetch the full camera device labels list after the scanner successfully boots.
    // By this time, proper system camera permission is already granted, assuring label access.
    const timer = setTimeout(() => {
      discoverCameras();
    }, 1500);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  // Serialized manual camera and settings switcher to prevent WebRTC hardware race conditions
  const handleConfigChange = async (
    newCameraId: string, 
    newScanMode: 'ean_upc' | 'all', 
    newUseHw: boolean
  ) => {
    if (isTransitioningRef.current) {
      console.log('Transition already in progress, please wait');
      return;
    }
    
    setSelectedCameraId(newCameraId);
    setScanMode(newScanMode);
    setUseHardwareAcceleration(newUseHw);
    setScanStatus('initializing');
    
    // Stop preceding lens first to release hardware tracks properly
    await stopScanner();
    
    // Give the hardware OS a solid 250ms delay to cleanly stop video layers
    await new Promise((resolve) => setTimeout(resolve, 250));
    
    // Start the new chosen lens with upgraded parameters
    await startScanner(newCameraId, newScanMode, newUseHw);
  };

  const startScanner = async (
    cameraId: string, 
    mode: 'ean_upc' | 'all' = scanMode, 
    useHw: boolean = useHardwareAcceleration
  ) => {
    if (isTransitioningRef.current) {
      console.log('Scanner transition already in progress, skipping start');
      return;
    }
    isTransitioningRef.current = true;
    setScanStatus('initializing');

    // Give DOM a microsecond tick to ensure the HTML element exists
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      // Stop preceding scanner object if exists
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
        } catch (e) {
          console.warn('Previous reader stop err:', e);
        }
        scannerRef.current = null;
      }

      // Restricting formats reduces frame matching iterations exponentially (lightspeed efficiency)
      const formatsToSupport = mode === 'ean_upc'
        ? [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E
          ]
        : [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE
          ];

      const html5Qrcode = new Html5Qrcode(qrCodeId, {
        formatsToSupport: formatsToSupport,
        useBarCodeDetectorIfSupported: useHw,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: useHw
        },
        verbose: false
      });
      scannerRef.current = html5Qrcode;

      const cameraIdOrConfig = (cameraId === 'environment') 
        ? { facingMode: "environment" } 
        : cameraId;

      await html5Qrcode.start(
        cameraIdOrConfig,
        {
          fps: useHw ? 28 : 16, // Fast poll on hardware acceleration, balanced low-overhead rate on CPU fallback
          qrbox: (videoWidth, videoHeight) => {
            const isMobile = window.innerWidth < 640;
            // Focus on a narrow, elongated barcode shape.
            // This yields spectacular response times and prevents mobile CPU overheating.
            const w = Math.floor(videoWidth * (isMobile ? 0.90 : 0.70));
            const h = Math.floor(videoHeight * (isMobile ? 0.35 : 0.25));
            return {
              width: Math.max(w, 270),
              height: Math.max(h, 110)
            };
          },
          aspectRatio: undefined, // Standard native aspect ratio for lightning fast rendering on all screens
          videoConstraints: cameraId === 'environment'
            ? { 
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, max: 60 }
              }
            : undefined
        },
        (decodedText) => {
          // Prevent multiple triggers for the same code quickly
          if (decodedText === lastScannedCodeRef.current) return;
          lastScannedCodeRef.current = decodedText;
          
          playBeepSound();
          setScanStatus('success');
          
          // CRITICAL SPEED UP: Fire onScan immediately so parent forms/actions auto-fill instantly!
          onScan(decodedText);
          
          // Snappy recovery delay (only 450ms) to reload laser and receive next scan
          setTimeout(() => {
            if (scannerRef.current) {
              lastScannedCodeRef.current = '';
              setScanStatus('scanning');
            }
          }, 450);
        },
        () => {
          // Silent scan failure is normal (keeps polling)
        }
      );

      setScanStatus('scanning');

      // Attempt to retrieve and check zoom capabilities from video track
      try {
        const videoElement = document.querySelector(`#${qrCodeId} video`) as HTMLVideoElement | null;
        if (videoElement && videoElement.srcObject) {
          const stream = videoElement.srcObject as MediaStream;
          const [track] = stream.getVideoTracks();
          const capabilities = track.getCapabilities() as any;
          if (capabilities && 'zoom' in capabilities) {
            setSupportsZoom(true);
            setMinZoom(capabilities.zoom.min || 1);
            setMaxZoom(capabilities.zoom.max || 10);
            setZoomLevel(((track.getConstraints().advanced?.[0] as any)?.zoom) || 1);
          }
        }
      } catch (zoomErr) {
        console.log('Video zoom advanced controls are not supported on this device/browser', zoomErr);
      }

    } catch (err: any) {
      console.error('Failed to start scanner:', err);
      // Fallback gracefully so we do not crash UI and allow manual simulation
      setScanStatus('error');
      
      const errMsgStr = err?.toString() || '';
      const isNotReadable = errMsgStr.includes('NotReadableError') || err?.name === 'NotReadableError';
      const isOverconstrained = errMsgStr.includes('OverconstrainedError') || err?.name === 'OverconstrainedError';

      if (isNotReadable) {
        setErrorMessage('Câmera em uso por outro aplicativo ou bloqueada pelo sistema. Feche outras abas e tente novamente.');
      } else if (isOverconstrained) {
        setErrorMessage('A câmera não suporta os ajustes de resolução configurados. Tente trocar de câmera.');
      } else {
        setErrorMessage('Não foi possível iniciar a captura de vídeo. Verifique as permissões de câmera.');
      }
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner.isScanning) {
        try {
          await scanner.stop();
        } catch (e) {
          console.error('Error stopping scanner:', e);
        }
      }
    }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const level = parseFloat(e.target.value);
    setZoomLevel(level);
    
    // Apply zoom constraints to the active video track
    try {
      const videoElement = document.querySelector(`#${qrCodeId} video`) as HTMLVideoElement | null;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const [track] = stream.getVideoTracks();
        track.applyConstraints({
          advanced: [{ zoom: level } as any]
        });
      }
    } catch (err) {
      console.warn('Could not apply advanced zoom constraint: ', err);
    }
  };

  const handleSimulateScan = (codeToScan?: string) => {
    const target = (typeof codeToScan === 'string' && codeToScan.trim()) 
      ? codeToScan.trim() 
      : (customBarcodeInput.trim() || simulatedBarcode);
    if (!target) return;
    playBeepSound();
    setScanStatus('success');
    setTimeout(() => {
      onScan(target);
      setScanStatus('scanning');
    }, 450);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header */}
      <div className="bg-slate-950 px-6 py-4 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-sm font-semibold text-emerald-400 font-display uppercase tracking-wider">
            Leitor de Código de Barras (Alta Precisão)
          </span>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-xs font-semibold px-3 py-1 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
          >
            Fechar
          </button>
        )}
      </div>

      {/* Camera Panel Area */}
      <div className="relative aspect-[4/3] sm:aspect-video bg-black flex flex-col items-center justify-center p-2 sm:p-4 min-h-[350px] sm:min-h-[385px]">
        {/* Main Camera Container */}
        <div 
          id={qrCodeId} 
          className="w-full h-full max-h-[410px] rounded-lg overflow-hidden [&>video]:object-cover [&>video]:w-full [&>video]:h-full"
        />

        {/* UI HUD Overlays when scanning */}
        {scanStatus === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
            {/* Focus box border overlay in elegant vibrant emerald green */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-[92%] sm:w-[85%] h-[60%] sm:h-[45%] max-w-[480px] max-h-[180px] border-2 border-emerald-500 rounded-lg focus-box-scan shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                {/* Custom glowing barcode scan beam in neon green */}
                <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-400 opacity-90 shadow-[0_0_15px_#10b981] animate-bounce" />
                
                {/* Four sharp frame boundaries */}
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                <span className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                <span className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br" />

                {/* Focus text indicator */}
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-slate-950/90 px-2.5 py-0.5 rounded text-[10px] text-emerald-400 font-mono tracking-widest uppercase border border-slate-800 whitespace-nowrap">
                  Foco Ampliado Celular
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center text-[9px] sm:text-[10px] text-emerald-400 font-mono bg-slate-950/85 p-2 rounded-lg border border-slate-800/60 mt-1">
              <span>AJUSTE DE FOCO OPTIMIZADO</span>
              <span>PREVIEW TOTAL</span>
            </div>
          </div>
        )}

        {/* Initialize Layer */}
        {scanStatus === 'initializing' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-xs text-slate-300 font-mono uppercase tracking-wider">Iniciando feed de vídeo otimizado...</p>
          </div>
        )}

        {/* Success Scan Feedback Animation - Floating glass badge so Safari never suspends WebRTC tracks */}
        {scanStatus === 'success' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-950/90 backdrop-blur-md border border-emerald-500/30 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.65)] z-30 max-w-[90%] text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
            <span className="text-sm font-bold text-emerald-300 font-display">Código Capturado!</span>
            <span className="text-xs text-slate-200 font-mono tracking-wider">{lastScannedCodeRef.current}</span>
          </div>
        )}

        {/* Camera Permission or Mount Failed View */}
        {scanStatus === 'error' && (
          <div className="absolute inset-0 bg-slate-950 p-6 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 bg-rose-500/15 rounded-full flex items-center justify-center">
              <Camera className="w-6 h-6 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-slate-350 font-semibold mb-1">Câmera indisponível ou em uso</p>
              <p className="text-[11px] text-slate-500 max-w-xs">{errorMessage}</p>
            </div>
            <button
              onClick={() => {
                if (selectedCameraId) {
                  startScanner(selectedCameraId);
                } else {
                  discoverCameras();
                }
              }}
              className="mt-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-mono text-[10px] uppercase font-bold tracking-wider px-3.5 py-2 rounded-lg border border-slate-750 transition-all cursor-pointer shadow-lg hover:border-emerald-500/40"
            >
              Liberar & Tentar Novamente
            </button>
          </div>
        )}
      </div>

      {/* Control Tools Panel */}
      <div className="bg-slate-950 p-4 border-t border-slate-800 space-y-4">
        {/* Toggle Mode row */}
        {scanActionMode && setScanActionMode && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-900 pb-3">
            <div>
              <p className="text-xs font-semibold text-slate-300">Ação do Leitor ao Bipar</p>
              <p className="text-[10px] text-slate-550">Defina se leituras abrem Entrada, Saída ou apenas localizam dados</p>
            </div>
            <div className="flex flex-wrap bg-slate-900 border border-slate-850 rounded-xl p-1 w-full sm:w-auto gap-1">
              <button
                type="button"
                onClick={() => setScanActionMode('consulta')}
                className={`flex-grow sm:flex-initial text-[9.5px] uppercase font-bold tracking-wider px-3.5 py-2.5 rounded-lg transition-all cursor-pointer ${
                  scanActionMode === 'consulta'
                    ? 'bg-sky-550 text-white shadow-[0_0_12px_rgba(14,165,233,0.35)] font-black border border-sky-450/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                🔍 Localizar Info
              </button>
              <button
                type="button"
                onClick={() => setScanActionMode('entrada')}
                className={`flex-grow sm:flex-initial text-[9.5px] uppercase font-bold tracking-wider px-3.5 py-2.5 rounded-lg transition-all cursor-pointer ${
                  scanActionMode === 'entrada'
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.35)] font-black'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                Entrada (+)
              </button>
              <button
                type="button"
                onClick={() => setScanActionMode('saida')}
                className={`flex-grow sm:flex-initial text-[9.5px] uppercase font-bold tracking-wider px-3.5 py-2.5 rounded-lg transition-all cursor-pointer ${
                  scanActionMode === 'saida'
                    ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.35)] font-black'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                Saída (-)
              </button>
            </div>
          </div>
        )}

        {/* Physical Camera Picker + Digital Track Zoom */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
          {cameras.length > 1 && scanStatus !== 'error' && (
            <div className="flex items-center gap-2 border border-slate-800 p-2 rounded-xl bg-slate-900">
              <RefreshCw className="w-4 h-4 text-slate-400" />
              <select
                value={selectedCameraId}
                onChange={(e) => handleConfigChange(e.target.value, scanMode, useHardwareAcceleration)}
                className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer w-full font-mono font-bold"
              >
                <option value="environment" className="bg-slate-900 text-emerald-400 font-bold">
                  ✨ Traseira Automática (Recomendado)
                </option>
                {cameras.map(dev => (
                  <option key={dev.id} value={dev.id} className="bg-slate-900 text-slate-200">
                    {dev.label || `Câmera ${cameras.indexOf(dev) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {supportsZoom && scanStatus === 'scanning' && (
            <div className="flex items-center gap-2 border border-slate-800 p-2 rounded-xl bg-slate-900">
              <ZoomIn className="w-4 h-4 text-emerald-500" />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-mono">1x</span>
                <input
                  type="range"
                  min={minZoom}
                  max={maxZoom}
                  step="0.1"
                  value={zoomLevel}
                  onChange={handleZoomChange}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 font-mono">{zoomLevel.toFixed(1)}x</span>
              </div>
            </div>
          )}
        </div>

        {/* SPEED BARS & ADVANCED OPTIMIZATIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-t border-slate-900 py-3.5">
          {/* Format optimization */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Refinamento de Pesquisa</span>
            </div>
            <p className="text-[10px] text-slate-500">Filtrar formatos de código de barras melhora a velocidade drasticamente.</p>
            <div className="flex bg-slate-900 border border-slate-850 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => handleConfigChange(selectedCameraId, 'ean_upc', useHardwareAcceleration)}
                className={`flex-1 text-[9.5px] uppercase font-bold tracking-wider py-2 rounded-lg transition-all cursor-pointer ${
                  scanMode === 'ean_upc'
                    ? 'bg-emerald-500/15 text-emerald-355 border border-emerald-500/30 font-black'
                    : 'text-slate-450 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                ⚡ EAN & UPC (Mais Rápido)
              </button>
              <button
                type="button"
                onClick={() => handleConfigChange(selectedCameraId, 'all', useHardwareAcceleration)}
                className={`flex-1 text-[9.5px] uppercase font-bold tracking-wider py-2 rounded-lg transition-all cursor-pointer ${
                  scanMode === 'all'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-black'
                    : 'text-slate-450 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                📋 Completo (+ QR / 128)
              </button>
            </div>
          </div>

          {/* Hardware acceleration */}
          <div className="space-y-1.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">Aceleração Nativa de GPU</span>
              </div>
              <p className="text-[10px] text-slate-500">Usa os algoritmos do sistema operacional para leitura em sub-milissegundos.</p>
            </div>
            
            <button
              type="button"
              onClick={() => handleConfigChange(selectedCameraId, scanMode, !useHardwareAcceleration)}
              className={`flex items-center justify-between w-full border text-left rounded-xl p-2.5 transition-all cursor-pointer ${
                useHardwareAcceleration 
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-350 hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] font-bold font-mono tracking-wide">
                {useHardwareAcceleration ? '🚀 ACELERAÇÃO ATIVA' : '🐢 MODO LEGADO (APENAS JS)'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${
                typeof window !== 'undefined' && 'BarcodeDetector' in window
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {typeof window !== 'undefined' && 'BarcodeDetector' in window ? 'Suportado' : 'Não disp.'}
              </span>
            </button>
          </div>
        </div>

        {/* Sandbox Simulation HUD — Critical for direct desktop validation inside sandbox */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-slate-200 font-semibold">Simulador de Estoque Integrado</p>
              <p className="text-[10px] text-slate-400">Excelente para testar sem webcam. Escolha um produto e simule o scaneamento instantâneo:</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={simulatedBarcode}
                onChange={(e) => {
                  setSimulatedBarcode(e.target.value);
                  setCustomBarcodeInput('');
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg text-xs p-2 text-slate-300 font-mono flex-1 focus:border-amber-500 focus:outline-none cursor-pointer"
              >
                {SAMPLE_BARCODES.map(item => (
                  <option key={item.code} value={item.code} className="bg-slate-950 text-slate-300 font-sans">
                    [{item.code}] - {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleSimulateScan(simulatedBarcode)}
                className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-bold px-4 py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Simular Item Selecionado
              </button>
            </div>

            {/* Ou digitar qualquer outro código livremente */}
            <div className="flex gap-2 items-center pt-1 border-t border-slate-850">
              <input
                type="text"
                placeholder="Ou digite/cole qualquer código de barras (Ex: 789...)"
                value={customBarcodeInput}
                onChange={(e) => setCustomBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSimulateScan(customBarcodeInput);
                  }
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg text-xs px-3 py-1.5 text-slate-200 font-mono flex-1 focus:border-emerald-500 focus:outline-none placeholder-slate-600"
              />
              <button
                type="button"
                disabled={!customBarcodeInput.trim()}
                onClick={() => handleSimulateScan(customBarcodeInput)}
                className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 active:scale-95 text-white font-bold px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                Escanear Digitado
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
