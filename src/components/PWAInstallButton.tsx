import { MonitorSmartphone, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Suppress install prompt when already running in standalone installed mode
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={() => void install()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          <MonitorSmartphone className="w-3.5 h-3.5" />
          <span>Instal Aplikasi</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-300 bg-sky-500/12 hover:bg-sky-500/20 border border-sky-400/30 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Instal di HP / PC</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(6, 8, 13, 0.82)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Panduan instalasi aplikasi di komputer dan HP"
        >
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0e131d] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Instal Aplikasi Fakta Nusantara 3D
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Jalankan langsung dari Layar Utama HP atau Desktop seperti aplikasi bawaan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="Tutup panduan instalasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="rounded-lg bg-[#141b29] border border-white/10 p-3.5 space-y-2 text-xs text-slate-200">
                <div className="font-semibold text-amber-400">iPhone / iPad (Safari):</div>
                <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                  <li>
                    Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah/atas Safari.
                  </li>
                  <li>
                    Gulir ke bawah lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
                  </li>
                  <li>
                    Ketuk <strong>Tambah</strong> untuk memasang ikon aplikasi.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs text-slate-200">
                <div className="rounded-lg bg-[#141b29] border border-white/10 p-3.5 space-y-1.5">
                  <div className="font-semibold text-amber-400">Komputer Desktop (Chrome / Edge):</div>
                  <p className="leading-relaxed text-slate-300">
                    Buka alamat aplikasi di tab browser penuh, lalu klik ikon{' '}
                    <strong>Instal Aplikasi</strong> di sisi kanan bilah alamat (URL bar) atau menu{' '}
                    <strong>⋮ &gt; Simpan dan bagikan &gt; Instal Fakta Nusantara 3D</strong>.
                  </p>
                </div>

                <div className="rounded-lg bg-[#141b29] border border-white/10 p-3.5 space-y-1.5">
                  <div className="font-semibold text-sky-300">HP Android (Chrome):</div>
                  <p className="leading-relaxed text-slate-300">
                    Ketuk menu titik tiga <strong>⋮</strong> di pojok kanan atas Chrome, lalu pilih{' '}
                    <strong>Tambahkan ke layar utama / Instal aplikasi</strong>.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
