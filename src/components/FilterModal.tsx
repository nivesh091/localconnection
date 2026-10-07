import React, { useState } from 'react';
import { X, Filter, RotateCcw, Check } from 'lucide-react';
import { WorkerCategory, SearchFilterState } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { useAuth } from '../context/AuthContext';
import { DistanceService } from '../services/distanceService';
import { LocationService } from '../services/locationService';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: WorkerCategory[];
  currentFilters: SearchFilterState;
  onApplyFilters: (filters: SearchFilterState) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  categories,
  currentFilters,
  onApplyFilters,
}) => {
  const { t, lang } = useTranslation();
  const { location: userLocation } = useAuth();

  usePopupBackDismiss(isOpen, onClose);

  const [categoryId, setCategoryId] = useState(currentFilters.categoryId || '');
  const [radiusKm, setRadiusKm] = useState<number | undefined>(currentFilters.radiusKm);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(currentFilters.maxPricePerDay);
  const [minExp, setMinExp] = useState<number | undefined>(currentFilters.minExperienceYears);

  if (!isOpen) return null;

  const handleReset = () => {
    setCategoryId('');
    setRadiusKm(undefined);
    setMaxPrice(undefined);
    setMinExp(undefined);
  };

  const handleApply = () => {
    let lat = currentFilters.userLat;
    let lng = currentFilters.userLng;

    if (lat === undefined || lng === undefined) {
      const userCoords = DistanceService.extractCoordinates(userLocation);
      if (userCoords) {
        lat = userCoords.lat;
        lng = userCoords.lng;
      } else {
        const lastPos = LocationService.getLastKnownPosition();
        if (lastPos) {
          lat = lastPos.latitude;
          lng = lastPos.longitude;
        }
      }
    }

    onApplyFilters({
      ...currentFilters,
      categoryId: categoryId || undefined,
      radiusKm: radiusKm || undefined,
      maxPricePerDay: maxPrice || undefined,
      minExperienceYears: minExp || undefined,
      userLat: lat,
      userLng: lng,
    });
    onClose();
  };

  const radiusOptions = [1, 2, 5, 10, 20, 50, 100, 200];
  const expOptions = [
    { value: 1, label: '1+ वर्ष' },
    { value: 3, label: '3+ वर्ष' },
    { value: 5, label: '5+ वर्ष' },
    { value: 10, label: '10+ वर्ष' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-700" />
            <h3 className="text-base font-bold text-slate-900">{t.filter}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter order strictly (Section 28) */}
        <div className="py-4 space-y-4 text-xs sm:text-sm">
          {/* 1. Worker Category */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              1. {t.category}
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 bg-white"
            >
              <option value="">{t.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'hi' ? c.name_hi : c.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Location Radius */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              2. {t.radius}
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {radiusOptions.map((r) => {
                const isSelected = radiusKm === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadiusKm(isSelected ? undefined : r)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition ${
                      isSelected
                        ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {r} km
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Pricing: Per Day only (Section 14 & 28) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              3. {t.pricePerDay} (अधिकतम)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-500">₹</span>
              <input
                type="number"
                min="0"
                step="50"
                value={maxPrice || ''}
                onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="उदा. 800"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          {/* 4. Experience */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              4. {t.experience}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {expOptions.map((exp) => {
                const isSelected = minExp === exp.value;
                return (
                  <button
                    key={exp.value}
                    type="button"
                    onClick={() => setMinExp(isSelected ? undefined : exp.value)}
                    className={`py-2 px-1 rounded-xl text-xs font-semibold border transition text-center ${
                      isSelected
                        ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {exp.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 5. Find Button & Reset */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>रीसेट करें</span>
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs active:scale-98 transition"
          >
            <Check className="w-4 h-4" />
            <span>5. {t.find}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
