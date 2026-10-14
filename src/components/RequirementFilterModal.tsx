import React, { useState, useEffect } from 'react';
import { X, Filter, RotateCcw, Check, Navigation, Loader2, Tag, ChevronRight } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { SearchableCategoryModal } from './SearchableCategoryModal';

interface RequirementFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: string[];
  selectedCategories: string[];
  selectedRadiusKm?: number;
  onApply: (categories: string[], radiusKm?: number) => void;
  onReset: () => void;
  hasUserCoordinates: boolean;
  onRequestDetectLocation?: () => void;
  isDetectingLocation?: boolean;
}

// Exactly 7 radius options as mandated by Point 19
const RADIUS_OPTIONS = [1, 2, 5, 10, 20, 30, 50];

export const RequirementFilterModal: React.FC<RequirementFilterModalProps> = ({
  isOpen,
  onClose,
  availableCategories,
  selectedCategories,
  selectedRadiusKm,
  onApply,
  onReset,
  hasUserCoordinates,
  onRequestDetectLocation,
  isDetectingLocation = false,
}) => {
  const { lang } = useTranslation();
  usePopupBackDismiss(isOpen, onClose);

  const [localCategories, setLocalCategories] = useState<string[]>(selectedCategories);
  const [localRadius, setLocalRadius] = useState<number | undefined>(selectedRadiusKm);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    setLocalCategories(selectedCategories);
    setLocalRadius(selectedRadiusKm);
  }, [selectedCategories, selectedRadiusKm, isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(localCategories, localRadius);
    onClose();
  };

  const handleReset = () => {
    setLocalCategories([]);
    setLocalRadius(undefined);
    onReset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-bold">
              {lang === 'hi' ? 'फ़िल्टर' : 'Filter'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          {/* FILTER 1: काम / Category (Point 17: Compact searchable selector) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-teal-700" />
                <span>{lang === 'hi' ? 'काम / Category' : 'Work / Category'}</span>
              </label>
              {localCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLocalCategories([])}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {lang === 'hi' ? 'हटाएं' : 'Clear'}
                </button>
              )}
            </div>

            {/* Compact Category trigger button (Point 17) */}
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-slate-50/70 hover:bg-slate-100 flex items-center justify-between text-xs sm:text-sm transition cursor-pointer"
            >
              <span className="font-semibold text-slate-800">
                {localCategories.length > 0
                  ? lang === 'hi'
                    ? `${localCategories.length} कैटेगरी चुनी गई`
                    : `${localCategories.length} categories selected`
                  : lang === 'hi'
                  ? '🔍 Category चुनें...'
                  : '🔍 Select Category...'}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {/* Display active category chips */}
            {localCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {localCategories.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-900 border border-teal-200 text-xs font-semibold"
                  >
                    <span>{c}</span>
                    <button
                      type="button"
                      onClick={() => setLocalCategories(localCategories.filter((x) => x !== c))}
                      className="w-4 h-4 rounded-full hover:bg-teal-200 inline-flex items-center justify-center font-bold text-teal-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* FILTER 2: 📍 दूरी / Radius (1, 2, 5, 10, 20, 30, 50 km - Point 19) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-slate-800">
                {lang === 'hi' ? '📍 दूरी का दायरा (Radius)' : '📍 Distance Radius'}
              </label>
              {localRadius !== undefined && (
                <button
                  type="button"
                  onClick={() => setLocalRadius(undefined)}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {lang === 'hi' ? 'हटाएं' : 'Clear'}
                </button>
              )}
            </div>

            {!hasUserCoordinates && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                <span className="text-amber-900 leading-snug">
                  {lang === 'hi'
                    ? 'सटीक दूरी के लिए लोकेशन सक्रिय करें:'
                    : 'Enable GPS for exact distance filter:'}
                </span>
                {onRequestDetectLocation && (
                  <button
                    type="button"
                    onClick={onRequestDetectLocation}
                    disabled={isDetectingLocation}
                    className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-bold text-[11px] hover:bg-amber-700 flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isDetectingLocation ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Navigation className="w-3 h-3" />
                    )}
                    <span>{lang === 'hi' ? 'GPS ऑन' : 'GPS'}</span>
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 pt-1">
              {RADIUS_OPTIONS.map((km) => {
                const isSelected = localRadius === km;
                return (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setLocalRadius(isSelected ? undefined : km)}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border text-center transition cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {km} km
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'hi' ? 'रीसेट करें' : 'Reset'}</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-1.5 px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{lang === 'hi' ? 'लागू करें' : 'Apply'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Searchable Category Modal - Point 17 */}
      <SearchableCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={availableCategories}
        selectedCategories={localCategories}
        isMultiSelect={true}
        onSelect={(selected) => setLocalCategories(selected)}
      />
    </div>
  );
};
