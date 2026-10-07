import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, CheckCircle, HelpCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';

const DISMISS_KEY = 'kaammitra_pwa_popup_dismissed_at';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export const PWAInstallPopup: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { lang } = useTranslation();
  const { websiteName, websiteNameEn, logoUrl } = useWebsiteBranding();

  const [isOpen, setIsOpen] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showUninstallModal, setShowUninstallModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    // 1. Guard: If already installed in standalone mode, NEVER show install popup
    if (isInstalled) {
      setIsOpen(false);
      return;
    }

    // 2. Guard: Check if user dismissed prompt within cooldown period
    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (lastDismissed && Date.now() - Number(lastDismissed) < DISMISS_COOLDOWN_MS) {
      return;
    }

    // 3. Open prompt after 2.5 seconds if installable or iOS
    const timer = setTimeout(() => {
      if (!isInstalled && (isInstallable || isIOS)) {
        setIsOpen(true);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isIOS]);

  const handleDismiss = () => {
    setIsOpen(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setIsOpen(false);
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        setInstallSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setInstallSuccess(false);
        }, 2000);
      } else {
        handleDismiss();
      }
    } else {
      // In browsers where beforeinstallprompt didn't fire yet, show guided instructions
      handleDismiss();
    }
  };

  if (isInstalled && !showUninstallModal) {
    return null;
  }

  return (
    <>
      {/* 1. Timed Install App Popup */}
      {isOpen && !isInstalled && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl border border-slate-200 relative animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition cursor-pointer"
              title="बंद करें"
            >
              <X className="w-5 h-5" />
            </button>

            {/* App Icon and Heading */}
            <div className="flex items-center gap-3.5 mb-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-md border-2 border-teal-600 shrink-0 bg-teal-50 flex items-center justify-center">
                <img
                  src={logoUrl || '/logo.jpg'}
                  alt="App Logo"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/pwa-192x192.png';
                  }}
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                  {lang === 'hi' ? `${websiteName} ऐप इंस्टॉल करें` : `Install ${websiteNameEn || websiteName} App`}
                </h3>
                <span className="inline-block mt-0.5 px-2 py-0.5 bg-teal-100 text-teal-800 text-[10px] font-bold rounded-md">
                  {lang === 'hi' ? 'आधिकारिक ऐप • तेज़ व सुरक्षित' : 'Official PWA • Fast & Safe'}
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              {lang === 'hi'
                ? 'बिना ब्राउज़र खोले, एक क्लिक में सीधे ऐप खोलें। नए काम, सेवा विशेषज्ञों और मैसेज के त्वरित नोटिफिकेशन पाएं।'
                : 'Open the app directly from your home screen with fast offline access and real-time message alerts.'}
            </p>

            {/* Action Buttons */}
            {installSuccess ? (
              <div className="py-2.5 px-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{lang === 'hi' ? 'ऐप सफलतापूर्वक इंस्टॉल हो गया!' : 'App Installed Successfully!'}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer text-center"
                >
                  {lang === 'hi' ? 'बाद में (Later)' : 'Later'}
                </button>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="py-2.5 px-4 bg-teal-700 hover:bg-teal-800 active:scale-98 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer text-center"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>{lang === 'hi' ? 'इंस्टॉल करें' : 'Install App'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. iOS Safari Installation Step-by-Step Modal */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-teal-700" />
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi' ? 'iPhone पर इंस्टॉल करें' : 'Install on iPhone'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 text-xs sm:text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  Safari ब्राउज़र में नीचे स्थित <strong>Share (शेयर)</strong> आइकन पर टैप करें।
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  नीचे स्क्रॉल करें और <strong>Add to Home Screen (होम स्क्रीन पर जोड़ें)</strong> चुनें।
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs transition cursor-pointer"
            >
              {lang === 'hi' ? 'समझ गए (Done)' : 'Got it'}
            </button>
          </div>
        </div>
      )}

      {/* 3. Uninstall Instructions Modal */}
      {showUninstallModal && (
        <div
          className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowUninstallModal(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi' ? 'ऐप अनइंस्टॉल करने का तरीका' : 'How to Uninstall App'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUninstallModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs sm:text-sm text-slate-700">
              <p className="font-semibold text-slate-900 text-xs">
                {lang === 'hi'
                  ? 'ब्राउज़र सुरक्षा नियमों के अनुसार, PWA ऐप को सीधे आपके डिवाइस से अनइंस्टॉल किया जाता है:'
                  : 'According to browser security standards, PWAs are uninstalled directly from your device:'}
              </p>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-teal-800">📱 Android:</p>
                <p>होम स्क्रीन पर ऐप आइकन को 1-2 सेकंड दबाए रखें (Long Press) और <strong>'Uninstall' (हटाएं)</strong> चुनें।</p>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-teal-800">💻 Desktop (Chrome / Edge):</p>
                <p>ऐप के शीर्ष बार में तीन डॉट्स (⋮) पर क्लिक करें और <strong>'{websiteNameEn || websiteName} अनइंस्टॉल करें...'</strong> चुनें।</p>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-teal-800">🍎 iPhone / iPad:</p>
                <p>होम स्क्रीन पर {websiteNameEn || websiteName} आइकन को दबाए रखें और <strong>'Bookmark हटाएं'</strong> या <strong>'ऐप हटाएं'</strong> चुनें।</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowUninstallModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition cursor-pointer"
            >
              {lang === 'hi' ? 'ठीक है (OK)' : 'OK'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
