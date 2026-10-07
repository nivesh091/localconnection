import React, { useState } from 'react';
import { UserPlus, ArrowLeft, AlertCircle } from 'lucide-react';
import { AuthService } from '../services/authService';
import { LocationService } from '../services/locationService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { LocationPicker, LocationPickerValue } from '../components/LocationPicker';

interface RegisterPageProps {
  onBackToLogin: () => void;
  onSuccess: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onBackToLogin, onSuccess }) => {
  const { refreshUser } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName } = useWebsiteBranding();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationPickerValue | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mobile.trim() || !password) return;

    if (!/^[0-9]{10}$/.test(mobile.trim())) {
      setErrorMsg('कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const canonicalRegLoc = selectedLocation ? LocationService.extractCanonicalLocation(selectedLocation) : null;

    const res = await AuthService.signup({
      name: name.trim(),
      mobile: mobile.trim(),
      password,
      location: selectedLocation && (selectedLocation.state || selectedLocation.district || selectedLocation.place)
        ? {
            place: (canonicalRegLoc?.place || selectedLocation.place || (selectedLocation as any).village || '').trim(),
            district: (canonicalRegLoc?.district || selectedLocation.district || '').trim(),
            state: (canonicalRegLoc?.state || selectedLocation.state || '').trim(),
            landmark: canonicalRegLoc?.subdistrict || selectedLocation.landmark || selectedLocation.subdistrict || null,
            latitude: selectedLocation.latitude || null,
            longitude: selectedLocation.longitude || null,
            location_source: selectedLocation.location_source || 'manual',
          }
        : undefined,
    });

    setIsLoading(false);

    if (res.error) {
      setErrorMsg(res.error || 'कृपया फिर से कोशिश करें।');
    } else {
      // Popup disappears immediately after success
      onSuccess();
      refreshUser().catch(() => {});
    }
  };

  return (
    <div className="pb-24 pt-4 px-3 max-w-sm mx-auto">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs relative space-y-4">
        <button
          onClick={onBackToLogin}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>लॉगिन पर वापस</span>
        </button>

        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-800 flex items-center justify-center mx-auto mb-1">
            <UserPlus className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">{t.createAccount}</h2>
          <p className="text-xs text-slate-500">
            {lang === 'hi' ? `${websiteName} परिवार से जुड़ें` : `Join the ${websiteName} family`}
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {t.name} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="उदा. रमेश कुमार"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
            />
          </div>

          {/* Mobile */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {t.mobile} <span className="text-rose-500">*</span>
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
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 font-mono"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {t.password} (कम से कम 6 अक्षर) <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
            />
          </div>

          {/* Hierarchical Location Picker: State -> District -> Tehsil -> Village */}
          <div className="pt-1">
            <label className="block font-semibold text-slate-700 mb-1">स्थान (वैकल्पिक)</label>
            <LocationPicker
              value={selectedLocation}
              onChange={(newLoc) => setSelectedLocation(newLoc)}
              showLiveLocationOption={false}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition disabled:opacity-50 pt-2"
          >
            {isLoading ? t.loading : 'खाता बनाएं (Register)'}
          </button>
        </form>
      </div>
    </div>
  );
};
