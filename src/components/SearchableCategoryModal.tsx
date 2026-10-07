import React, { useState, useMemo } from 'react';
import { X, Search, Check, Plus, Tag } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface SearchableCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  selectedCategories: string[];
  isMultiSelect?: boolean;
  onSelect: (selected: string[]) => void;
  allowCustomCategory?: boolean;
  onAddCustomCategory?: (customName: string) => void;
  title?: string;
}

export const SearchableCategoryModal: React.FC<SearchableCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  selectedCategories,
  isMultiSelect = false,
  onSelect,
  allowCustomCategory = false,
  onAddCustomCategory,
  title,
}) => {
  const { lang } = useTranslation();
  usePopupBackDismiss(isOpen, onClose);

  const [searchTerm, setSearchTerm] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Filter categories by search term
  const filteredCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((cat) => cat.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  if (!isOpen) return null;

  const handleToggle = (cat: string) => {
    if (isMultiSelect) {
      const next = selectedCategories.includes(cat)
        ? selectedCategories.filter((c) => c !== cat)
        : [...selectedCategories, cat];
      onSelect(next);
    } else {
      onSelect([cat]);
      onClose();
    }
  };

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customInput.trim();
    if (!clean) return;
    onAddCustomCategory?.(clean);
    if (isMultiSelect) {
      onSelect([...selectedCategories, clean]);
    } else {
      onSelect([clean]);
      onClose();
    }
    setCustomInput('');
    setShowCustomInput(false);
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
            <Tag className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-bold">
              {title || (lang === 'hi' ? 'कैटेगरी चुनें (Category)' : 'Select Category')}
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

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-100 shrink-0 space-y-2">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={lang === 'hi' ? '🔍 Category खोजें...' : '🔍 Search category...'}
              className="w-full h-10 pl-9 pr-8 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
              autoFocus
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            )}
          </div>

          {/* Optional Custom Category Creator */}
          {allowCustomCategory && (
            <div>
              {!showCustomInput ? (
                <button
                  type="button"
                  onClick={() => setShowCustomInput(true)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer py-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'hi' ? '+ अपनी नई Category जोड़ें' : '+ Add Custom Category'}
                  </span>
                </button>
              ) : (
                <form onSubmit={handleCreateCustom} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder={
                      lang === 'hi'
                        ? 'नई कैटेगरी का नाम लिखें...'
                        : 'Enter new category name...'
                    }
                    className="flex-1 h-9 px-3 rounded-lg border border-teal-500 text-xs text-slate-900 focus:outline-none shadow-2xs"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!customInput.trim()}
                    className="px-3 h-9 bg-teal-700 text-white text-xs font-bold rounded-lg hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                  >
                    {lang === 'hi' ? 'जोड़ें' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomInput('');
                    }}
                    className="px-2.5 h-9 bg-slate-100 text-slate-700 text-xs rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    ✕
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Categories List */}
        <div className="p-3 overflow-y-auto flex-1 divide-y divide-slate-100">
          {filteredCategories.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 space-y-1">
              <p>
                {lang === 'hi'
                  ? 'कोई मिलती-जुलती कैटेगरी नहीं मिली।'
                  : 'No matching categories found.'}
              </p>
              {allowCustomCategory && !showCustomInput && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomInput(searchTerm);
                    setShowCustomInput(true);
                  }}
                  className="text-teal-700 font-bold hover:underline"
                >
                  {lang === 'hi'
                    ? `"${searchTerm}" को नई कैटेगरी के रूप में जोड़ें`
                    : `Add "${searchTerm}" as new category`}
                </button>
              )}
            </div>
          ) : (
            filteredCategories.map((cat) => {
              const isSelected = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleToggle(cat)}
                  className={`w-full text-left py-2.5 px-3 rounded-xl flex items-center justify-between text-xs sm:text-sm font-medium transition cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50 text-teal-900 font-bold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  {isSelected && <Check className="w-4 h-4 text-teal-700 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer for multi-select */}
        {isMultiSelect && (
          <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-600">
              {lang === 'hi'
                ? `चयनित: ${selectedCategories.length}`
                : `Selected: ${selectedCategories.length}`}
            </span>
            <div className="flex gap-2">
              {selectedCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSelect([])}
                  className="px-3 py-1.5 text-xs text-rose-600 hover:underline font-semibold"
                >
                  {lang === 'hi' ? 'हटाएं' : 'Clear'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-teal-700 text-white rounded-xl text-xs font-bold hover:bg-teal-800"
              >
                {lang === 'hi' ? 'पूर्ण' : 'Done'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
