import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Check,
  Loader2,
  AlertCircle,
  Plus,
  Mic,
  MapPin,
  IndianRupee,
  Tag,
  Image as ImageIcon,
  Trash2,
  ChevronDown,
  Crop,
  RefreshCw,
} from 'lucide-react';
import { Requirement } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { LocationPicker, LocationPickerValue } from './LocationPicker';
import { LocationService } from '../services/locationService';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioPlayer } from './AudioPlayer';
import { formatError } from '../lib/supabase';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { ImageCropperModal } from './ImageCropperModal';

interface RequirementFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    category: string;
    shortRequirement: string;
    location: LocationPickerValue;
    maximumBudget: number;
    minimumExperienceYears?: number | null;
    additionalInfo?: string | null;
    keywords?: string[];
    voiceBlob?: Blob | null;
    removeExistingVoice?: boolean;
    photoBlobs?: Blob[];
    remainingPhotoStoragePaths?: string[];
  }) => Promise<{ success: boolean; error?: string }>;
  initialRequirement?: Requirement | null;
  existingCategories: string[];
}

export const RequirementFormModal: React.FC<RequirementFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialRequirement,
  existingCategories,
}) => {
  const { user, location: userLocation } = useAuth();
  const { lang } = useTranslation();
  usePopupBackDismiss(isOpen, onClose);

  // 1. Category Field (Simplified direct input + compact picker - Sections 1-4)
  const [category, setCategory] = useState<string>('');
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  // 2. क्या करवाना है
  const [shortRequirement, setShortRequirement] = useState<string>('');

  // 3. Location (Single Section - Points 31-36)
  const [locationValue, setLocationValue] = useState<LocationPickerValue | null>(null);
  const [isEditingLocation, setIsEditingLocation] = useState<boolean>(false);

  // 4. Maximum Budget & 5. Experience
  const [maximumBudget, setMaximumBudget] = useState<string>('');
  const [minimumExperience, setMinimumExperience] = useState<string>('');

  // 6. Keywords (Points 21-22)
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState<string>('');

  // 7. अपनी आवश्यकता विस्तार में बताएं (Optional)
  const [additionalInfo, setAdditionalInfo] = useState<string>('');

  // 8. Voice recording (Points 26-27)
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [existingVoiceUrl, setExistingVoiceUrl] = useState<string | null>(null);
  const [removeExistingVoice, setRemoveExistingVoice] = useState<boolean>(false);

  // 9. Photos (Staging flow: Select -> Preview Modal -> Optional Crop -> Confirm -> Form list)
  const [existingPhotos, setExistingPhotos] = useState<{ url: string; path: string }[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<{ file: File; preview: string; isCropped?: boolean }[]>([]);
  const [stagingPhoto, setStagingPhoto] = useState<{
    file: File;
    previewUrl: string;
    isCropped: boolean;
    replaceTarget?: { type: 'new' | 'existing'; index: number } | null;
  } | null>(null);
  const [isCroppingStaging, setIsCroppingStaging] = useState<boolean>(false);
  const [isPreparingCrop, setIsPreparingCrop] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<{ type: 'new' | 'existing'; index: number } | null>(null);

  // Submission & Validation
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Combined categories list (existing categories + popular suggestions)
  const allCategories = React.useMemo(() => {
    const suggestions = [
      'Plumber',
      'Electrician',
      'Painter',
      'Carpenter',
      'Mason',
      'AC Repair',
      'Mechanic',
      'Driver',
      'Welder',
      'Farm Worker',
    ];
    const set = new Set([...existingCategories, ...suggestions]);
    if (initialRequirement?.category) set.add(initialRequirement.category);
    return Array.from(set).filter(Boolean);
  }, [existingCategories, initialRequirement?.category]);

  const filteredPickerCategories = React.useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) return allCategories;
    return allCategories.filter((c) => c.toLowerCase().includes(term));
  }, [allCategories, categorySearch]);

  // Populate initial values on open / change
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setIsSubmitting(false);

    if (initialRequirement) {
      setCategory(initialRequirement.category || '');
      setShortRequirement(initialRequirement.short_requirement || '');
      setMaximumBudget(
        initialRequirement.maximum_budget !== undefined && initialRequirement.maximum_budget !== null
          ? String(initialRequirement.maximum_budget)
          : ''
      );
      setMinimumExperience(
        initialRequirement.minimum_experience_years !== null &&
          initialRequirement.minimum_experience_years !== undefined
          ? String(initialRequirement.minimum_experience_years)
          : ''
      );
      setAdditionalInfo(initialRequirement.additional_info || '');
      setKeywords(Array.isArray(initialRequirement.keywords) ? [...initialRequirement.keywords] : []);

      // Independent saved location from requirement (including Tehsil)
      const initSubdistrict =
        initialRequirement.subdistrict ||
        initialRequirement.tehsil ||
        initialRequirement.location?.landmark ||
        initialRequirement.location?.subdistrict ||
        '';
      setLocationValue({
        place: initialRequirement.place || '',
        subdistrict: initSubdistrict,
        district: initialRequirement.district || '',
        state: initialRequirement.state || '',
        latitude: initialRequirement.latitude ?? null,
        longitude: initialRequirement.longitude ?? null,
        location_source: 'manual',
      });
      setIsEditingLocation(false);

      setExistingVoiceUrl(initialRequirement.voice_url || null);
      setVoiceBlob(null);
      setRemoveExistingVoice(false);

      // Existing photos
      const loadedPhotos: { url: string; path: string }[] = [];
      const paths = initialRequirement.photo_storage_paths || [];
      const urls = initialRequirement.photos || [];
      for (let i = 0; i < urls.length; i++) {
        if (urls[i]) {
          loadedPhotos.push({ url: urls[i], path: paths[i] || '' });
        }
      }
      setExistingPhotos(loadedPhotos);
      setNewPhotoFiles([]);
      setStagingPhoto(null);
      setIsCroppingStaging(false);
    } else {
      // New requirement defaults
      setCategory('');
      setIsCategoryPickerOpen(false);
      setCategorySearch('');
      setShortRequirement('');
      setMaximumBudget('');
      setMinimumExperience('');
      setAdditionalInfo('');
      setKeywords([]);
      setKeywordInput('');

      // Point 32: Automatically use user's current profile location as DEFAULT
      if (userLocation && (userLocation.place || userLocation.district)) {
        const userSubdistrict =
          userLocation.subdistrict ||
          userLocation.tehsil ||
          userLocation.landmark ||
          '';
        setLocationValue({
          place: userLocation.place || '',
          subdistrict: userSubdistrict,
          district: userLocation.district || '',
          state: userLocation.state || '',
          latitude: userLocation.latitude ?? null,
          longitude: userLocation.longitude ?? null,
          location_source: 'manual',
        });
        setIsEditingLocation(false);
      } else {
        setLocationValue(null);
        setIsEditingLocation(true);
      }

      setExistingVoiceUrl(null);
      setVoiceBlob(null);
      setRemoveExistingVoice(false);
      setExistingPhotos([]);
      setNewPhotoFiles([]);
      setStagingPhoto(null);
      setIsCroppingStaging(false);
    }
  }, [isOpen, initialRequirement, existingCategories, userLocation]);


  const isEditMode = Boolean(initialRequirement);

  // Keyword handling (Flexible: comma, newline, Enter, multiple terms - Sections 7, 10, 11)
  const handleAddKeyword = (val?: string) => {
    const raw = (val !== undefined ? val : keywordInput).trim();
    if (!raw) return;

    const parts = raw
      .split(/[,،\n]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    setKeywords((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.includes(p)) {
          next.push(p);
        }
      }
      return next;
    });
    setKeywordInput('');
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    setKeywords(keywords.filter((k) => k !== kwToRemove));
  };

  // Photo handling (Requirement 1: Exact Staging Flow: Select -> Preview Modal -> Optional Crop -> Confirm -> Form List)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    // STEP 2: Do NOT immediately add to form. Open Photo Preview Screen first!
    const previewUrl = URL.createObjectURL(file);
    setStagingPhoto({
      file,
      previewUrl,
      isCropped: false,
      replaceTarget: null,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancelStagingPhoto = () => {
    if (stagingPhoto) {
      URL.revokeObjectURL(stagingPhoto.previewUrl);
    }
    setStagingPhoto(null);
    setIsCroppingStaging(false);
    replaceTargetRef.current = null;
  };

  const handleStartCropStaging = () => {
    if (!stagingPhoto) return;
    setIsCroppingStaging(true);
  };

  const handleCropCompleteStaging = (croppedBlob: Blob) => {
    if (!stagingPhoto) return;
    const ext = croppedBlob.type.split('/')[1] || 'jpg';
    const croppedFile = new File([croppedBlob], `crop_${Date.now()}.${ext}`, {
      type: croppedBlob.type || 'image/jpeg',
    });
    URL.revokeObjectURL(stagingPhoto.previewUrl);
    const newPreviewUrl = URL.createObjectURL(croppedBlob);

    // STEP 3: Cropped result returns back to PREVIEW screen
    setStagingPhoto((prev) =>
      prev
        ? {
            ...prev,
            file: croppedFile,
            previewUrl: newPreviewUrl,
            isCropped: true,
          }
        : null
    );
    setIsCroppingStaging(false);
  };

  const handleConfirmStagingPhoto = () => {
    if (!stagingPhoto) return;

    // STEP 4: Only after clicking "चुनें / फोटो जोड़ें" is the photo added to the form's list
    if (stagingPhoto.replaceTarget) {
      if (stagingPhoto.replaceTarget.type === 'new') {
        setNewPhotoFiles((prev) => {
          const copy = [...prev];
          const idx = stagingPhoto.replaceTarget!.index;
          if (copy[idx]) {
            copy[idx] = {
              file: stagingPhoto.file,
              preview: stagingPhoto.previewUrl,
              isCropped: stagingPhoto.isCropped,
            };
          }
          return copy;
        });
      } else if (stagingPhoto.replaceTarget.type === 'existing') {
        const idx = stagingPhoto.replaceTarget.index;
        setExistingPhotos((prev) => prev.filter((_, i) => i !== idx));
        setNewPhotoFiles((prev) => [
          ...prev,
          {
            file: stagingPhoto.file,
            preview: stagingPhoto.previewUrl,
            isCropped: stagingPhoto.isCropped,
          },
        ]);
      }
    } else {
      setNewPhotoFiles((prev) => [
        ...prev,
        {
          file: stagingPhoto.file,
          preview: stagingPhoto.previewUrl,
          isCropped: stagingPhoto.isCropped,
        },
      ]);
    }

    setStagingPhoto(null);
    setIsCroppingStaging(false);
    replaceTargetRef.current = null;
  };

  const handleCropNewPhoto = (idx: number) => {
    const item = newPhotoFiles[idx];
    if (!item) return;
    setStagingPhoto({
      file: item.file,
      previewUrl: item.preview,
      isCropped: item.isCropped ?? false,
      replaceTarget: { type: 'new', index: idx },
    });
  };

  const handleCropExistingPhoto = async (idx: number) => {
    const existing = existingPhotos[idx];
    if (!existing) return;
    try {
      setIsPreparingCrop(true);
      const res = await fetch(existing.url);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] || 'jpg';
      const file = new File([blob], `photo_${idx}_${Date.now()}.${ext}`, {
        type: blob.type || 'image/jpeg',
      });
      const previewUrl = URL.createObjectURL(blob);
      setStagingPhoto({
        file,
        previewUrl,
        isCropped: false,
        replaceTarget: { type: 'existing', index: idx },
      });
    } catch (e) {
      console.error('Failed to prepare existing photo for crop', e);
    } finally {
      setIsPreparingCrop(false);
    }
  };

  const handleTriggerReplace = (type: 'new' | 'existing', index: number) => {
    replaceTargetRef.current = { type, index };
    replaceFileInputRef.current?.click();
  };

  const handleReplaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const previewUrl = URL.createObjectURL(file);
    setStagingPhoto({
      file,
      previewUrl,
      isCropped: false,
      replaceTarget: replaceTargetRef.current,
    });
    if (replaceFileInputRef.current) {
      replaceFileInputRef.current.value = '';
    }
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotoFiles((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].preview);
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleRemoveExistingPhoto = (index: number) => {
    setExistingPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Category validation (Section 1-4)
    const cleanCategory = category.trim();
    if (!cleanCategory) {
      setErrorMessage(
        lang === 'hi'
          ? 'कृपया काम की कैटेगरी चुनें या लिखें।'
          : 'Please select or type a category.'
      );
      return;
    }

    // 2. Short requirement validation (Section 10: normal text allowed)
    const cleanShortReq = shortRequirement.trim();
    if (!cleanShortReq) {
      setErrorMessage(
        lang === 'hi'
          ? 'कृपया बताएं कि आपको कौन-सी सेवा चाहिए।'
          : 'Please describe what service is needed.'
      );
      return;
    }

    // 3. Location resolution
    const effectiveLocation: LocationPickerValue = (locationValue && locationValue.place?.trim())
      ? locationValue
      : {
          place: userLocation?.place || user?.address || 'Local',
          subdistrict: userLocation?.subdistrict || userLocation?.landmark || '',
          district: userLocation?.district || '',
          state: userLocation?.state || '',
          latitude: userLocation?.latitude ?? null,
          longitude: userLocation?.longitude ?? null,
          location_source: 'manual',
        };

    // 4. Maximum budget validation (Section 9: user-friendly numeric error message)
    const budgetNum = Number(maximumBudget);
    if (isNaN(budgetNum) || budgetNum <= 0) {
      setErrorMessage(
        lang === 'hi'
          ? 'कृपया बजट सही संख्या में डालें (उदा. 5000)।'
          : 'Please enter a valid maximum budget amount.'
      );
      return;
    }

    // 5. Experience (optional)
    let expYears: number | null = null;
    if (minimumExperience.trim()) {
      const expNum = Number(minimumExperience);
      if (isNaN(expNum) || expNum < 0) {
        setErrorMessage(
          lang === 'hi'
            ? 'कृपया अनुभव के वैध वर्ष संख्या में दर्ज करें।'
            : 'Please enter a valid number of years for experience.'
        );
        return;
      }
      expYears = expNum;
    }

    // If user has typed in keywordInput but hasn't pressed add yet, capture it seamlessly
    let finalKeywords = [...keywords];
    if (keywordInput.trim()) {
      const parts = keywordInput
        .trim()
        .split(/[,،\n]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      for (const p of parts) {
        if (!finalKeywords.includes(p)) finalKeywords.push(p);
      }
    }

    setIsSubmitting(true);
    try {
      const photoBlobs = newPhotoFiles.map((p) => p.file);
      const remainingPhotoStoragePaths = existingPhotos.map((p) => p.path).filter(Boolean);

      const res = await onSave({
        category: cleanCategory,
        shortRequirement: cleanShortReq,
        location: effectiveLocation,
        maximumBudget: budgetNum,
        minimumExperienceYears: expYears,
        additionalInfo: additionalInfo.trim() || null,
        keywords: finalKeywords,
        voiceBlob,
        removeExistingVoice,
        photoBlobs,
        remainingPhotoStoragePaths,
      });

      if (!res.success) {
        setErrorMessage(
          res.error
            ? formatError(res.error, lang as 'hi' | 'en')
            : lang === 'hi'
            ? 'त्रुटि हुई। कृपया पुनः प्रयास करें।'
            : 'Error occurred. Please try again.'
        );
        setIsSubmitting(false);
      } else {
        setIsSubmitting(false);
        onClose();
      }
    } catch (err) {
      setErrorMessage(
        formatError(err, lang as 'hi' | 'en') ||
          (lang === 'hi' ? 'त्रुटि हुई। कृपया पुनः प्रयास करें।' : 'An error occurred.')
      );
      setIsSubmitting(false);
    }
  };

  // Dynamically resolve Tehsil if not directly present in locationValue
  const [resolvedTehsil, setResolvedTehsil] = useState<string>('');

  useEffect(() => {
    if (!locationValue?.place) {
      setResolvedTehsil('');
      return;
    }
    const directTehsil = locationValue.subdistrict || locationValue.landmark;
    if (directTehsil && directTehsil.trim()) {
      setResolvedTehsil(directTehsil.trim());
      return;
    }
    let cancelled = false;
    LocationService.findSubdistrictForVillage(
      locationValue.state,
      locationValue.district,
      locationValue.place
    ).then((tehsil) => {
      if (!cancelled && tehsil) {
        setResolvedTehsil(tehsil);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    locationValue?.place,
    locationValue?.district,
    locationValue?.state,
    locationValue?.subdistrict,
    locationValue?.landmark,
  ]);

  // Strict format: गाँव: VALUE, तहसील: VALUE, जिला: VALUE, राज्य: VALUE (No "=" and single continuous row)
  const formattedLocationString = useMemo(() => {
    if (!locationValue || !locationValue.place) return '';
    const isHi = lang === 'hi';
    const parts: string[] = [];

    const rawVillage = locationValue.place.trim();
    const rawTehsil = (
      locationValue.subdistrict ||
      locationValue.landmark ||
      resolvedTehsil ||
      ''
    ).trim();
    const rawDistrict = locationValue.district?.trim();
    const rawState = locationValue.state?.trim();

    if (rawVillage) {
      parts.push(`${isHi ? 'गाँव' : 'Village'}: ${LocationService.localizePlaceName(rawVillage, lang)}`);
    }
    if (rawTehsil) {
      parts.push(`${isHi ? 'तहसील' : 'Tehsil'}: ${LocationService.localizePlaceName(rawTehsil, lang)}`);
    }
    if (rawDistrict) {
      parts.push(`${isHi ? 'जिला' : 'District'}: ${LocationService.localizePlaceName(rawDistrict, lang)}`);
    }
    if (rawState) {
      parts.push(`${isHi ? 'राज्य' : 'State'}: ${LocationService.localizePlaceName(rawState, lang)}`);
    }

    return parts.join(', ');
  }, [locationValue, resolvedTehsil, lang]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between shrink-0">
          <h3 className="text-sm sm:text-base font-bold">
            {isEditMode
              ? lang === 'hi'
                ? 'आवश्यकता संपादित करें'
                : 'Edit Requirement'
              : lang === 'hi'
              ? 'नई आवश्यकता पोस्ट करें'
              : 'Post New Requirement'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Points 15-36 */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 bg-white">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Category Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-teal-700" />
                <span>{lang === 'hi' ? 'कैटेगरी (Category) *' : 'Category *'}</span>
              </label>
              {category && (
                <span className="text-[11px] text-teal-700 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>{lang === 'hi' ? 'चुनी हुई:' : 'Selected:'}</span>
                  <span className="text-slate-900 font-bold">{category}</span>
                </span>
              )}
            </div>

            <div className="space-y-2">
              {/* Category selector button + Direct custom input */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryPickerOpen(!isCategoryPickerOpen)}
                  className="h-10 px-3.5 rounded-xl border border-teal-600 bg-teal-50/80 hover:bg-teal-100 text-teal-900 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 transition cursor-pointer shrink-0"
                >
                  <span>📋 {lang === 'hi' ? 'कैटेगरी चुनें' : 'Choose Category'}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-teal-700 transition-transform ${
                      isCategoryPickerOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <div className="relative flex-1">
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (isCategoryPickerOpen) setIsCategoryPickerOpen(false);
                    }}
                    placeholder={
                      lang === 'hi'
                        ? 'उदा. Plumber, Electrician, AC Repair'
                        : 'e.g. Plumber, Electrician, AC Repair'
                    }
                    className="w-full h-10 px-3.5 pr-8 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
                  />
                  {category && (
                    <button
                      type="button"
                      onClick={() => setCategory('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs w-5 h-5 flex items-center justify-center rounded-full"
                      title={lang === 'hi' ? 'हटाएं' : 'Clear'}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable compact searchable list if [ कैटेगरी चुनें ] is clicked */}
              {isCategoryPickerOpen && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-in fade-in duration-100 shadow-xs">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-600">
                      {lang === 'hi' ? 'मौजूदा सूची से चुनें:' : 'Select from list:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCategoryPickerOpen(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                    >
                      ✕ {lang === 'hi' ? 'बंद करें' : 'Close'}
                    </button>
                  </div>

                  {allCategories.length > 5 && (
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      placeholder={lang === 'hi' ? '🔍 कैटेगरी खोजें...' : '🔍 Search category...'}
                      className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  )}

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                    {filteredPickerCategories.map((cat) => {
                      const isSelected = category.toLowerCase() === cat.toLowerCase();
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setCategory(cat);
                            setIsCategoryPickerOpen(false);
                            setCategorySearch('');
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'bg-teal-700 text-white font-bold shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-teal-50 hover:border-teal-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                          <span>{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected Category preview banner */}
              {category && (
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-emerald-800 font-medium">
                      {lang === 'hi' ? 'चुनी हुई श्रेणी:' : 'Selected Category:'}
                    </span>
                    <span className="font-bold bg-white px-2 py-0.5 rounded-md border border-emerald-300 truncate">
                      {category}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCategory('')}
                    className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer underline shrink-0 ml-2"
                  >
                    {lang === 'hi' ? 'बदलें' : 'Change'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. आपको कौन-सी सेवा चाहिए */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                {lang === 'hi' ? 'आपको कौन-सी सेवा चाहिए *' : 'Service required *'}
              </label>
              <span className="text-[11px] text-slate-400">
                {lang === 'hi' ? 'कम शब्दों में लिखें' : 'Keep it short'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {lang === 'hi'
                ? 'आपको कौन-सी सेवा चाहिए, कम शब्दों में लिखें।'
                : 'Write briefly what service you need.'}
            </p>
            <input
              type="text"
              value={shortRequirement}
              onChange={(e) => setShortRequirement(e.target.value)}
              placeholder={
                lang === 'hi'
                  ? 'उदा. किचन कैबिनेट बनवाना है / बाथरूम नल लीकेज ठीक करना'
                  : 'e.g. Need kitchen cabinet made / Fix bathroom tap leak'
              }
              maxLength={120}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
            />
          </div>

          {/* 3. अधिकतम बजट (₹) * */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              {lang === 'hi' ? 'अधिकतम बजट (₹) *' : 'Maximum Budget (₹) *'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-slate-400">
                <IndianRupee className="w-4 h-4" />
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={maximumBudget}
                onChange={(e) => setMaximumBudget(e.target.value)}
                placeholder="5000"
                className="w-full h-11 pl-9 pr-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
              />
            </div>
          </div>

          {/* 4. अपनी आवश्यकता विस्तार में बोलकर बताएं */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-teal-700" />
              <span>
                {lang === 'hi'
                  ? 'अपनी आवश्यकता विस्तार में बोलकर बताएं'
                  : 'Explain requirement in detail by voice'}
              </span>
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {lang === 'hi'
                ? 'संक्षिप्त में बोलकर बताएं कि किस प्रकार के सेवा प्रदाता की जरूरत है, कब और कहाँ सेवा चाहिए तथा क्या काम होना है।'
                : 'Briefly explain by voice what kind of service provider you need, when and where the service is needed, and details of the work.'}
            </p>

            {existingVoiceUrl && !removeExistingVoice && !voiceBlob && (
              <div className="p-3 bg-teal-50/60 border border-teal-200 rounded-xl space-y-2">
                <p className="text-xs font-bold text-teal-900">मौजूदा वॉइस रिकॉर्डिंग:</p>
                <AudioPlayer src={existingVoiceUrl} title="मौजूदा रिकॉर्डिंग" />
                <button
                  type="button"
                  onClick={() => setRemoveExistingVoice(true)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold underline cursor-pointer"
                >
                  रिकॉर्डिंग हटाएं या नई रिकॉर्ड करें
                </button>
              </div>
            )}

            {(!existingVoiceUrl || removeExistingVoice || voiceBlob) && (
              <VoiceRecorder
                title="बोलकर रिकॉर्ड करें"
                subtitle="माइक दबाकर अपनी आवश्यकता बताएं"
                onRecordingChange={(blob) => setVoiceBlob(blob)}
              />
            )}
          </div>

          {/* 5. अधिकतम अनुभव (वर्ष) */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                {lang === 'hi' ? 'अधिकतम अनुभव (वर्ष)' : 'Maximum Experience (Years)'}
              </label>
              <span className="text-[11px] text-slate-400 font-normal">
                {lang === 'hi' ? 'वैकल्पिक' : 'Optional'}
              </span>
            </div>
            <input
              type="number"
              min="0"
              step="0.5"
              value={minimumExperience}
              onChange={(e) => setMinimumExperience(e.target.value)}
              placeholder={lang === 'hi' ? 'उदा. 3 (यदि कोई शर्त हो)' : 'e.g. 3'}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
            />
          </div>

          {/* 6. फोटो जोड़ें */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-teal-700" />
                <span>{lang === 'hi' ? 'फोटो जोड़ें' : 'Attach Photos'}</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'hi' ? '+ फोटो चुनें' : '+ Select Photos'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              {lang === 'hi'
                ? 'सेवा से जुड़ी फोटो साझा करें।'
                : 'Share photos related to the service.'}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {/* Hidden input for selecting replacement photo */}
            <input
              ref={replaceFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleReplaceFileChange}
              className="hidden"
            />

            {isPreparingCrop && (
              <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-xs flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>{lang === 'hi' ? 'फोटो क्रॉप के लिए तैयार हो रही है...' : 'Preparing photo for cropping...'}</span>
              </div>
            )}

            {/* Photos Preview Grid with Preview, Crop, and Replace Actions */}
            {(existingPhotos.length > 0 || newPhotoFiles.length > 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {/* Existing uploaded photos */}
                {existingPhotos.map((p, idx) => (
                  <div
                    key={`exist-${idx}`}
                    className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col shadow-xs"
                  >
                    <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
                      <img src={p.url} alt="Photo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingPhoto(idx)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition cursor-pointer shadow-xs"
                        title={lang === 'hi' ? 'फोटो हटाएं' : 'Remove Photo'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-1.5 bg-white border-t border-slate-200 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleCropExistingPhoto(idx)}
                        className="flex-1 py-1 px-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 text-[11px] font-bold rounded-lg border border-teal-200 flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                        title={lang === 'hi' ? 'क्रॉप करें' : 'Crop'}
                      >
                        <Crop className="w-3 h-3 text-teal-700" />
                        <span>{lang === 'hi' ? 'क्रॉप' : 'Crop'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTriggerReplace('existing', idx)}
                        className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                        title={lang === 'hi' ? 'फोटो बदलें' : 'Change'}
                      >
                        <RefreshCw className="w-3 h-3 text-slate-600" />
                        <span className="hidden sm:inline">{lang === 'hi' ? 'बदलें' : 'Change'}</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Newly selected photo files (Preview + Crop before final save) */}
                {newPhotoFiles.map((p, idx) => (
                  <div
                    key={`new-${idx}`}
                    className="relative rounded-xl overflow-hidden border-2 border-teal-500 bg-teal-50/20 flex flex-col shadow-xs"
                  >
                    <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
                      <img src={p.preview} alt="New photo" className="w-full h-full object-cover" />
                      
                      {p.isCropped && (
                        <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          <span>{lang === 'hi' ? 'क्रॉप्ड' : 'Cropped'}</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveNewPhoto(idx)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition cursor-pointer shadow-xs"
                        title={lang === 'hi' ? 'फोटो हटाएं' : 'Remove Photo'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-1.5 bg-white border-t border-slate-200 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleCropNewPhoto(idx)}
                        className="flex-1 py-1 px-1.5 bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold rounded-lg shadow-2xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                        title={lang === 'hi' ? 'क्रॉप करें' : 'Crop'}
                      >
                        <Crop className="w-3 h-3 text-white" />
                        <span>{lang === 'hi' ? 'क्रॉप करें' : 'Crop'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTriggerReplace('new', idx)}
                        className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                        title={lang === 'hi' ? 'फोटो बदलें' : 'Change'}
                      >
                        <RefreshCw className="w-3 h-3 text-slate-600" />
                        <span className="hidden sm:inline">{lang === 'hi' ? 'बदलें' : 'Change'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* STEP 2: PHOTO PREVIEW SCREEN / MODAL (Select Photo -> Preview -> Optional Crop -> Preview Cropped Result -> Confirm / Add Photo) */}
            {stagingPhoto && !isCroppingStaging && (
              <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
                <div
                  className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between shrink-0">
                    <h4 className="text-sm font-bold flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-teal-400" />
                      <span>{lang === 'hi' ? 'फोटो पूर्वावलोकन (Preview)' : 'Photo Preview'}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={handleCancelStagingPhoto}
                      className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Big photo preview */}
                  <div className="p-4 flex-1 flex flex-col items-center justify-center bg-slate-900/95 overflow-hidden relative min-h-[260px] max-h-[50vh]">
                    <img
                      src={stagingPhoto.previewUrl}
                      alt="Preview"
                      className="max-h-[46vh] max-w-full object-contain rounded-lg shadow-md"
                    />
                    {stagingPhoto.isCropped && (
                      <span className="absolute top-4 left-4 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-md flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{lang === 'hi' ? 'क्रॉप किया गया' : 'Cropped'}</span>
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                    {/* Crop button */}
                    <button
                      type="button"
                      onClick={handleStartCropStaging}
                      className="flex-1 py-2.5 px-3 bg-white hover:bg-slate-100 text-teal-800 font-bold text-xs sm:text-sm rounded-xl border border-teal-600 flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
                    >
                      <Crop className="w-4 h-4 text-teal-700" />
                      <span>{lang === 'hi' ? 'क्रॉप करें' : 'Crop'}</span>
                    </button>

                    {/* Confirm / Add Photo button */}
                    <button
                      type="button"
                      onClick={handleConfirmStagingPhoto}
                      className="flex-1 py-2.5 px-3 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{lang === 'hi' ? 'चुनें / फोटो जोड़ें' : 'Add Photo'}</span>
                    </button>

                    {/* Cancel / Back button */}
                    <button
                      type="button"
                      onClick={handleCancelStagingPhoto}
                      className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
                    >
                      <span>{lang === 'hi' ? 'वापस' : 'Back'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: ImageCropperModal for cropping the staging photo */}
            {isCroppingStaging && stagingPhoto && (
              <ImageCropperModal
                imageFile={stagingPhoto.file}
                title={lang === 'hi' ? 'फोटो क्रॉप करें' : 'Crop Photo'}
                onCropComplete={handleCropCompleteStaging}
                onCancel={() => setIsCroppingStaging(false)}
              />
            )}
          </div>

          {/* 7. अपनी आवश्यकता लिखकर भी बता सकते हैं */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                {lang === 'hi'
                  ? 'अपनी आवश्यकता लिखकर भी बता सकते हैं'
                  : 'You can also write your requirement details'}
              </label>
              <span className="text-[11px] text-slate-400">
                {lang === 'hi' ? 'वैकल्पिक' : 'Optional'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {lang === 'hi'
                ? 'चाहें तो अपनी आवश्यकता के बारे में विस्तार से लिखकर बताएं।'
                : 'Optionally explain your job requirement in detail in writing.'}
            </p>
            <textarea
              rows={3}
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder={
                lang === 'hi'
                  ? 'यदि कोई विशेष निर्देश, समय या विवरण लिखना चाहें तो यहाँ लिखें...'
                  : 'Any special instructions, timelines, or details...'
              }
              className="w-full p-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs resize-none"
            />
          </div>

          {/* 8. कीवर्ड्स (Keywords) */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-teal-700" />
                <span>{lang === 'hi' ? 'कीवर्ड्स (Keywords)' : 'Keywords'}</span>
              </label>
              <span className="text-[11px] text-slate-400 font-normal">
                {lang === 'hi' ? 'वैकल्पिक (Optional)' : 'Optional'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {lang === 'hi'
                ? 'अपने कुछ कीवर्ड लिखें, जिससे खोजने में आपकी आवश्यकता ढूँढने में आसानी हो।'
                : 'Enter keywords to make your requirement easier to find.'}
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes(',')) {
                    handleAddKeyword(val);
                  } else {
                    setKeywordInput(val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
                placeholder={
                  lang === 'hi'
                    ? 'उदा. plumber, नल, leakage, urgent... (Enter या कॉमा दबाएं)'
                    : 'e.g. plumber, tap, leak... (Press enter or comma)'
                }
                className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
              />
              <button
                type="button"
                onClick={() => handleAddKeyword()}
                disabled={!keywordInput.trim()}
                className="px-3.5 h-10 bg-teal-700 text-white text-xs font-bold rounded-xl hover:bg-teal-800 disabled:opacity-50 transition cursor-pointer"
              >
                + {lang === 'hi' ? 'जोड़ें' : 'Add'}
              </button>
            </div>

            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-900 border border-teal-200 text-xs font-semibold"
                  >
                    <span>#{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="w-4 h-4 rounded-full hover:bg-teal-200 inline-flex items-center justify-center font-bold text-teal-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 10. Footer Submit Button */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            >
              {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{lang === 'hi' ? 'सहेज रहे हैं...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {isEditMode
                      ? lang === 'hi'
                        ? 'परिवर्तन सहेजें'
                        : 'Save Changes'
                      : lang === 'hi'
                      ? 'आवश्यकता पोस्ट करें'
                      : 'Post Requirement'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
