import React, { useState } from 'react';
import { LogIn, UserPlus, HelpCircle, AlertCircle, X } from 'lucide-react';
import { AuthService } from '../services/authService';
import { HelpService } from '../services/helpService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';

interface LoginPageProps {
  onClose?: () => void;
  onNavigateRegister: () => void;
  onNavigateHelp: () => void;
  onSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onClose,
  onNavigateRegister,
  onNavigateHelp,
  onSuccess,
}) => {
  const { refreshUser } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName } = useWebsiteBranding();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password support modal (Section 9: No OTP, Admin support request)
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotName, setForgotName] = useState('');
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMobile = mobile.trim().replace(/[^0-9]/g, '');
    if (!cleanMobile || !password) return;

    if (cleanMobile.length !== 10) {
      setErrorMsg('कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const res = await AuthService.login(cleanMobile, password);
    setIsLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      // Disappear immediately without delay
      onSuccess();
      refreshUser().catch(() => {});
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotMobile.trim()) return;

    await HelpService.submitHelpRequest({
      name: forgotName.trim() || 'Password Recovery Request',
      mobile: forgotMobile.trim(),
      description: `खाता पासवर्ड रिकवरी अनुरोध। मोबाइल नंबर: ${mobile || forgotMobile || 'अज्ञात'}`,
    });
    setForgotSubmitted(true);
  };

  return (
    <div className="pb-24 pt-4 px-3 max-w-sm mx-auto">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs relative space-y-4">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-800 flex items-center justify-center mx-auto mb-1">
            <LogIn className="w-5 h-5" />
          </div>
          <h2 style={{ fontSize: '20px' }} className="font-bold text-slate-900">{t.login}</h2>
          <p style={{ fontSize: '14px' }} className="text-slate-500">
            {lang === 'hi' ? `${websiteName} में आपका स्वागत है` : `Welcome to ${websiteName}`}
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3 text-xs">
          <div>
            <label
              style={{ fontSize: '14px', paddingTop: '4px', paddingBottom: '4px' }}
              className="block font-semibold text-slate-700 mb-1"
            >
              {t.mobile} (Mobile Number)
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (
                  !/^[0-9]$/.test(e.key) &&
                  !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key) &&
                  !e.ctrlKey &&
                  !e.metaKey
                ) {
                  e.preventDefault();
                }
              }}
              onPaste={(e) => {
                e.preventDefault();
                const paste = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 10);
                setMobile(paste);
              }}
              placeholder="10 अंकों का मोबाइल नंबर"
              required
              style={{ fontSize: '13px' }}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 font-mono"
            />
          </div>

          <div>
            <div
              style={{ marginTop: '0px', paddingTop: '4px', paddingBottom: '4px' }}
              className="flex items-center justify-between mb-1"
            >
              <label style={{ fontSize: '14px' }} className="font-semibold text-slate-700">{t.password}</label>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                style={{ fontSize: '13px' }}
                className="text-[11px] text-teal-700 hover:underline"
              >
                पासवर्ड भूल गए?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{ paddingTop: '10px', paddingBottom: '10px' }}
            className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition disabled:opacity-50"
          >
            {isLoading ? t.loading : t.login}
          </button>
        </form>

        <div style={{ paddingTop: '0px' }} className="pt-2 border-t border-slate-100 flex flex-col gap-2">
          <button
            type="button"
            onClick={onNavigateRegister}
            style={{ borderColor: '#aab1c1', backgroundColor: '#ffc5c5' }}
            className="w-full py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span style={{ fontSize: '14px' }}>{t.createAccount}</span>
          </button>

          <button
            type="button"
            onClick={onNavigateHelp}
            className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-medium flex items-center justify-center gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span style={{ fontSize: '13px' }}>सहायता चाहिए? (Get Help)</span>
          </button>
        </div>
      </div>

      {/* Forgot Password Modal (Section 9) */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 shadow-2xl space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
              खाता पासवर्ड रिकवरी सहायता
            </h3>
            {forgotSubmitted ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-xs text-teal-800 font-semibold">
                  अनुरोध दर्ज कर लिया गया है।
                </p>
                <p className="text-[11px] text-slate-600">
                  एडमिन टीम आपके मोबाइल नंबर पर फोन करके सत्यापन करेगी और नया पासवर्ड सेट करने में मदद करेगी।
                </p>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2 bg-slate-100 rounded-xl text-xs font-semibold"
                >
                  {t.close}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3 text-xs">
                <p className="text-[11px] text-slate-600">
                  सुरक्षा कारणों से अपना नाम और पंजीकृत मोबाइल नंबर दर्ज करें। एडमिन आपसे संपर्क करेंगे।
                </p>
                <div>
                  <label className="block font-semibold mb-1">पूरा नाम</label>
                  <input
                    type="text"
                    value={forgotName}
                    onChange={(e) => setForgotName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">मोबाइल नंबर</label>
                  <input
                    type="tel"
                    value={forgotMobile}
                    onChange={(e) => setForgotMobile(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3 py-1.5 border rounded-lg text-slate-600"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-teal-700 text-white rounded-lg font-bold"
                  >
                    अनुरोध भेजें
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
