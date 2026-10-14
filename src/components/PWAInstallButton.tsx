import React, { useState } from 'react';
import { Download, Info, X, HelpCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { t, lang } = useTranslation();
  const { websiteName, websiteNameEn } = useWebsiteBranding();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showUninstallModal, setShowUninstallModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleInstallClick = async () => {
    if (isInstalled) {
      setShowUninstallModal(true);
      return;
    }

    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        setFeedback(lang === 'hi' ? 'ऐप सफलतापूर्वक इंस्टॉल हो गया!' : 'App installed successfully!');
      } else if (outcome === 'dismissed') {
        setFeedback(lang === 'hi' ? 'इंस्टॉलेशन रद्द किया गया।' : 'Installation dismissed.');
      }
    } else {
      // In desktop/browsers where beforeinstallprompt didn't trigger yet, give helpful instructions
      setFeedback(
        lang === 'hi'
          ? 'ब्राउज़र मेनू (⋮) से "होम स्क्रीन पर जोड़ें" या "ऐप इंस्टॉल करें" चुनें।'
          : 'Choose "Add to Home Screen" or "Install App" from browser menu (⋮).'
      );
    }
  };

  return (
    <div className="w-full pt-2">
      {/* Locked prominent full-width button at the bottom of Profile (Section 50) */}
      <button
        type="button"
        onClick={handleInstallClick}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white rounded-xl font-bold text-sm sm:text-base shadow-sm active:scale-99 transition"
      >
        <Download className="w-5 h-5 shrink-0" />
        <span>{isInstalled ? (lang === 'hi' ? 'ऐप इंस्टॉल है (अनइंस्टॉल गाइड)' : 'App Installed (Uninstall Guide)') : t.downloadApp}</span>
      </button>

      {feedback && (
        <div className="mt-2 p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            {feedback}
          </span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'hi' ? 'iPhone पर इंस्टॉल करें' : 'Install on iPhone'}
              </h3>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs sm:text-sm text-slate-700">
              <p className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </span>
                <span>
                  Safari ब्राउज़र में नीचे दिए गए <strong>Share (शेयर)</strong> बटन पर टैप करें।
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </span>
                <span>
                  नीचे स्क्रॉल करें और <strong>Add to Home Screen (होम स्क्रीन पर जोड़ें)</strong> चुनें।
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl transition"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/* Uninstall Instructions Modal */}
      {showUninstallModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowUninstallModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-teal-700" />
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi' ? 'ऐप अनइंस्टॉल करने का तरीका' : 'How to Uninstall App'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUninstallModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs sm:text-sm text-slate-700">
              <p className="text-xs text-slate-600">
                {lang === 'hi'
                  ? 'PWA ऐप्स को आपके डिवाइस से सीधे इस प्रकार अनइंस्टॉल किया जाता है:'
                  : 'PWAs are uninstalled directly through your device settings:'}
              </p>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-teal-800">📱 Android:</p>
                <p>होम स्क्रीन पर {websiteNameEn || websiteName} आइकन को 1-2 सेकंड दबाए रखें (Long Press) और <strong>'Uninstall' (हटाएं)</strong> चुनें।</p>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-teal-800">💻 Desktop (Chrome / Edge):</p>
                <p>ऐप के शीर्ष बार में तीन डॉट्स (⋮) पर क्लिक करें और <strong>'{websiteNameEn || websiteName} अनइंस्टॉल करें...'</strong> चुनें।</p>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-teal-800">🍎 iPhone / iPad:</p>
                <p>होम स्क्रीन पर {websiteNameEn || websiteName} आइकन को दबाए रखें और <strong>'Bookmark हटाएं'</strong> चुनें।</p>
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
    </div>
  );
};
