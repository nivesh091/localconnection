import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  Camera,
  MapPin,
  Briefcase,
  Plus,
  Trash2,
  Edit2,
  Volume2,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  LogIn,
  X,
  Mic,
  Loader2,
  Share2,
  Check,
  Eye,
} from 'lucide-react';
import { WorkerProfile, WorkerCategory, UserLocation, PriceUnit, getPriceUnitLabel } from '../types';
import { WorkerCard } from '../components/WorkerCard';
import { WorkerDetailModal } from '../components/WorkerDetailModal';
import { FullProfileDetails } from '../components/FullProfileDetails';
import { ProfileService } from '../services/profileService';
import { WorkerService } from '../services/workerService';
import { MediaService } from '../services/mediaService';
import { LocationService } from '../services/locationService';
import { AudioPlayer } from '../components/AudioPlayer';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { GetHelpCard } from '../components/GetHelpCard';
import { LocationPicker, LocationPickerValue } from '../components/LocationPicker';
import { ProfilePhotoViewerModal } from '../components/ProfilePhotoViewerModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { ImageCropperModal } from '../components/ImageCropperModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

import { CommentReference } from '../types';

/**
 * Generates read-only address preview string from hierarchical location values
 * Format: Village → Tehsil → District → State
 * Example: Peeplasana, [Tehsil], Moradabad, Uttar Pradesh
 */
const generateAddressString = (
  loc?: Partial<LocationPickerValue> | UserLocation | null,
  lang: 'hi' | 'en' = 'hi'
): string => {
  if (!loc) return '';
  return LocationService.formatWorkerCard(loc as any, '', lang);
};

interface ProfilePageProps {
  onRequireAuth: () => void;
  initialEditMode?: 'profile' | 'worker' | null;
  onOpenChat?: (userId: string, commentRef?: CommentReference | null) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  onRequireAuth,
  initialEditMode,
  onOpenChat,
}) => {
  const { user, workerProfile, location, refreshUser, setWorkerProfile, updateWorkerPhotos } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName, websiteNameEn, resolvedShareUrl } = useWebsiteBranding();

  const [categories, setCategories] = useState<WorkerCategory[]>([]);
  const [isEditingProfile, setIsEditingProfile] = useState(() => initialEditMode === 'profile' || initialEditMode === 'worker');
  const [isCreatingWorker, setIsCreatingWorker] = useState(false);
  const [isConfirmingDeleteWorker, setIsConfirmingDeleteWorker] = useState(false);

  const [copiedWebsiteShare, setCopiedWebsiteShare] = useState(false);

  const handleShareWebsite = async () => {
    const siteUrl = resolvedShareUrl;
    const dynamicName = websiteNameEn && websiteName && websiteNameEn.toLowerCase() === websiteName.toLowerCase()
      ? websiteNameEn
      : (lang === 'hi' ? websiteName : (websiteNameEn || websiteName));
    const shareTitle = dynamicName;
    const shareText =
      lang === 'hi'
        ? `${dynamicName} — स्थानीय कुशल सेवा प्रदाताओं और कारीगरों से सीधे जुड़ें:\n${siteUrl}`
        : `${dynamicName} — Connect directly with skilled local service providers:\n${siteUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: siteUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(siteUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = siteUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedWebsiteShare(true);
      setTimeout(() => setCopiedWebsiteShare(false), 2200);
    } catch {
      const mailtoUrl = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText)}`;
      window.location.href = mailtoUrl;
    }
  };

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadingPreviewUrl, setUploadingPreviewUrl] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [fullscreenTitle, setFullscreenTitle] = useState<string | null>(null);
  const [selectedFileForCrop, setSelectedFileForCrop] = useState<File | null>(null);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [showFullProfileModal, setShowFullProfileModal] = useState(false);
  const [isDeletingVoice, setIsDeletingVoice] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // Restore edit state on initialEditMode change or refresh
  useEffect(() => {
    if (initialEditMode === 'profile' || initialEditMode === 'worker') {
      setIsEditingProfile(true);
    } else {
      setIsEditingProfile(false);
    }
  }, [initialEditMode]);

  // Back navigation hierarchy for edit profile mode
  useEffect(() => {
    const handlePopState = () => {
      const isEdit = window.location.hash.includes('edit=1');
      setIsEditingProfile(isEdit);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleStartEditing = () => {
    setEditModalError(null);
    setIsConfirmingDeleteWorker(false);
    syncFormFields();
    setIsEditingProfile(true);
    window.history.pushState({ tab: 'profile', edit: '1' }, '', '#profile?edit=1');
  };

  const handleStopEditing = () => {
    setIsEditingProfile(false);
    setIsConfirmingDeleteWorker(false);
    setEditModalError(null);
    if (window.location.hash.includes('edit=1')) {
      const cleanHash = window.location.hash.replace(/[?&]edit=1/, '').replace(/#\?/, '#');
      window.history.replaceState({ tab: 'profile' }, '', cleanHash || '#profile');
    }
  };

  const handleStartCreatingWorker = () => {
    setEditModalError(null);
    if (workerProfile) {
      setCategoryId(workerProfile.category_id || (workerProfile.other_category ? 'other' : ''));
      setOtherCategory(workerProfile.other_category || '');
      setExperienceYears(Number(workerProfile.experience_years) || 0);
      setPricePerDay(Number(workerProfile.price_per_day) || 500);
      setPriceUnit(workerProfile.price_unit || 'month');
      setCustomPriceUnit(workerProfile.custom_price_unit || '');
      setAboutText(workerProfile.about_text || '');
    } else {
      setCategoryId('');
      setOtherCategory('');
      setExperienceYears(1);
      setPricePerDay(500);
      setPriceUnit('month'); // Requirement: Default for NEW Service Providers is Per Month
      setCustomPriceUnit('');
      setAboutText('');
    }
    setIsCreatingWorker(true);
  };

  const handleStopCreatingWorker = () => {
    setIsCreatingWorker(false);
    setEditModalError(null);
  };

  usePopupBackDismiss(isEditingProfile, handleStopEditing);
  usePopupBackDismiss(isCreatingWorker, handleStopCreatingWorker);

  // Form states: Personal + Worker (Unified Single Editing Flow)
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [isMobilePublic, setIsMobilePublic] = useState(true); // Feature 3: Public Mobile Number ON/OFF (Default: ON)
  const [address, setAddress] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationPickerValue | null>(null);

  // Worker Form Fields (Feature 2: Flexible Pricing & Feature 1: Activation)
  const [categoryId, setCategoryId] = useState('');
  const [otherCategory, setOtherCategory] = useState('');
  const [experienceYears, setExperienceYears] = useState(0);
  const [pricePerDay, setPricePerDay] = useState(500);
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('day'); // Default 'day' for existing workers, 'month' for new
  const [customPriceUnit, setCustomPriceUnit] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [aboutText, setAboutText] = useState('');

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const workPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isTogglingPrivacyRef = useRef(false);

  useEffect(() => {
    WorkerService.getCategories().then(setCategories);
  }, []);

  const syncFormFields = () => {
    if (isTogglingPrivacyRef.current) return;
    if (user) {
      setName(user.name || '');
      setMobile(user.mobile || '');
      const publicFlag =
        workerProfile?.is_mobile_public !== undefined
          ? workerProfile.is_mobile_public
          : user.is_mobile_public !== false;
      setIsMobilePublic(publicFlag);
      if (location) {
        setAddress(generateAddressString(location) || user.address || '');
      } else {
        setAddress(user.address || '');
      }
    }
    const canonicalUserLoc = LocationService.extractCanonicalLocation(location, user?.address);
    if (canonicalUserLoc) {
      setSelectedLocation({
        place: canonicalUserLoc.place || canonicalUserLoc.village || '',
        village: canonicalUserLoc.village || canonicalUserLoc.place || '',
        subdistrict: canonicalUserLoc.subdistrict || canonicalUserLoc.tehsil || canonicalUserLoc.landmark || '',
        district: canonicalUserLoc.district || '',
        state: canonicalUserLoc.state || '',
        landmark: canonicalUserLoc.landmark || canonicalUserLoc.subdistrict || '',
        latitude: canonicalUserLoc.latitude ? Number(canonicalUserLoc.latitude) : null,
        longitude: canonicalUserLoc.longitude ? Number(canonicalUserLoc.longitude) : null,
        location_source: canonicalUserLoc.location_source || 'manual',
      });
    } else {
      setSelectedLocation(null);
    }
    if (workerProfile) {
      setCategoryId(workerProfile.category_id || (workerProfile.other_category ? 'other' : ''));
      setOtherCategory(workerProfile.other_category || '');
      setExperienceYears(Number(workerProfile.experience_years) || 0);
      setPricePerDay(Number(workerProfile.price_per_day) || 500);
      const rawUnit = workerProfile.price_unit === 'custom' ? 'other' : workerProfile.price_unit;
      setPriceUnit(rawUnit || 'day');
      setCustomPriceUnit(workerProfile.custom_price_unit || '');
      setIsActive(workerProfile.is_active !== false);
      if (workerProfile.is_mobile_public !== undefined && !isTogglingPrivacyRef.current) {
        setIsMobilePublic(workerProfile.is_mobile_public);
      }
      setAboutText(workerProfile.about_text || '');
    }
  };

  useEffect(() => {
    syncFormFields();
  }, [user, location, workerProfile]);

  // Select Profile Photo for Crop
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSelectedFileForCrop(file);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  // Crop Complete from ImageCropperModal inside Edit Profile
  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!user) return;
    setSelectedFileForCrop(null);
    setIsUploadingPhoto(true);
    setStatusMsg(null);

    try {
      const croppedFile = new File([croppedBlob], `avatar_${user.id}_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      const res = await MediaService.uploadProfilePhoto(user.id, croppedFile);
      if (res.error || !res.url) {
        setStatusMsg({ type: 'error', text: res.error || 'फ़ोटो अपलोड असफल।' });
        setIsUploadingPhoto(false);
        return;
      }

      const updateRes = await ProfileService.updateProfile(user.id, {
        profile_photo: res.url,
      });

      setIsUploadingPhoto(false);
      if (updateRes.success) {
        ProfileService.invalidateCache(user.id);
        setStatusMsg({ type: 'success', text: 'प्रोफ़ाइल फ़ोटो सहेजी गई।' });
        await refreshUser(true);
      } else {
        setStatusMsg({ type: 'error', text: updateRes.error || 'अपडेट असफल' });
      }
    } catch (err) {
      setIsUploadingPhoto(false);
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'त्रुटि हुई' });
    }
  };

  // Delete Profile Photo (Database clear first + Storage cleanup + Cache invalidation)
  const handleDeleteProfilePhoto = async () => {
    if (!user) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const updateRes = await ProfileService.updateProfile(user.id, {
        profile_photo: null,
      });

      if (!updateRes.success) {
        setStatusMsg({ type: 'error', text: updateRes.error || 'फ़ोटो हटाने में समस्या आई।' });
        setIsSaving(false);
        return;
      }

      ProfileService.invalidateCache(user.id);

      try {
        await MediaService.deleteProfilePhoto(user.id, user.profile_photo);
      } catch (storageErr) {
        console.warn('Storage cleanup non-blocking notice:', storageErr);
      }

      await refreshUser();
      setIsSaving(false);
      setStatusMsg({ type: 'success', text: 'प्रोफ़ाइल फ़ोटो हटा दी गई।' });
    } catch (err) {
      setIsSaving(false);
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'त्रुटि' });
    }
  };

  // Unified Save Profile Handler (Single flow for Main Account + Worker Profile if applicable)
  const handleSaveUnifiedProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      setEditModalError('कृपया अपना नाम दर्ज करें।');
      return;
    }
    if (!mobile.trim() || !/^[0-9]{10}$/.test(mobile.trim())) {
      setEditModalError('कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।');
      return;
    }

    if (workerProfile && pricePerDay <= 0) {
      setEditModalError(lang === 'hi' ? 'आपकी फीस 0 से अधिक होनी चाहिए।' : 'Fee must be greater than 0.');
      return;
    }

    setIsSaving(true);
    setEditModalError(null);
    setStatusMsg(null);

    try {
      const formattedAddress =
        selectedLocation && (selectedLocation.place || selectedLocation.district || selectedLocation.state)
          ? generateAddressString(selectedLocation)
          : address.trim() || null;

      // 1. Save Main Profile (name, mobile, address, is_mobile_public)
      const updateRes = await ProfileService.updateProfile(user.id, {
        name: name.trim(),
        mobile: mobile.trim(),
        address: formattedAddress || address.trim() || null,
        is_mobile_public: isMobilePublic,
      });

      if (!updateRes.success) {
        setIsSaving(false);
        setEditModalError(updateRes.error || 'व्यक्तिगत विवरण सहेजने में त्रुटि।');
        return;
      }

      ProfileService.invalidateCache(user.id);

      // 2. Save location if selected
      if (
        selectedLocation &&
        (selectedLocation.state || selectedLocation.district || selectedLocation.place || selectedLocation.village)
      ) {
        const canonicalSelected = LocationService.extractCanonicalLocation(selectedLocation);
        const targetVillage = canonicalSelected?.place || selectedLocation.place || selectedLocation.village || '';
        const targetSubdistrict = canonicalSelected?.subdistrict || selectedLocation.subdistrict || selectedLocation.landmark || null;

        const locRes = await ProfileService.saveUserLocation({
          user_id: user.id,
          state: canonicalSelected?.state || selectedLocation.state || '',
          district: canonicalSelected?.district || selectedLocation.district || '',
          place: targetVillage,
          village: targetVillage,
          landmark: targetSubdistrict,
          subdistrict: targetSubdistrict || undefined,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          location_source: selectedLocation.location_source || 'manual',
        });
        if (!locRes.success) {
          setIsSaving(false);
          setEditModalError(locRes.error || 'स्थान सहेजने में त्रुटि।');
          return;
        }
      }

      // 3. Save Worker Profile if user is a worker (saves flexible pricing & about_text)
      if (workerProfile) {
        const isCustomWorkerCat = categoryId?.startsWith('worker_cat:');
        const targetCategoryId = categoryId === 'other' || !categoryId || isCustomWorkerCat ? null : categoryId;
        const targetOtherCategory =
          categoryId === 'other'
            ? (otherCategory.trim() || null)
            : isCustomWorkerCat
            ? (categories.find((c) => c.id === categoryId)?.name_hi || null)
            : null;

        const workerRes = await WorkerService.saveWorkerProfile(user.id, {
          category_id: targetCategoryId,
          other_category: targetOtherCategory,
          experience_years: Number(experienceYears) || 0,
          price_per_day: Number(pricePerDay) || 0,
          price_unit: priceUnit,
          custom_price_unit: (priceUnit === 'custom' || priceUnit === 'other') ? (customPriceUnit.trim() || null) : null,
          is_active: isActive,
          is_mobile_public: isMobilePublic,
          about_text: aboutText.trim() || null,
        });

        if (!workerRes.success) {
          setIsSaving(false);
          setEditModalError(workerRes.error || (lang === 'hi' ? 'सेवा विवरण सहेजने में त्रुटि।' : 'Error saving service details.'));
          return;
        }

        // Invalidate worker caches so updated About and details show immediately
        WorkerService.invalidateCache(user.id);
      }

      setIsSaving(false);
      setIsEditingProfile(false);
      setEditModalError(null);
      if (window.location.hash.includes('edit=1')) {
        const cleanHash = window.location.hash.replace(/[?&]edit=1/, '').replace(/#\?/, '#');
        window.history.replaceState({ tab: 'profile' }, '', cleanHash || '#profile');
      }
      setStatusMsg({ type: 'success', text: 'प्रोफ़ाइल सफलतापूर्वक सहेजी गई।' });
      await refreshUser();
    } catch (err) {
      setIsSaving(false);
      setEditModalError(err instanceof Error ? err.message : 'सहेजने में विफल।');
    }
  };

  // Create Worker Profile Handler for Normal User
  const handleSaveNewWorkerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!categoryId) {
      setEditModalError('कृपया काम की श्रेणी चुनें।');
      return;
    }
    if (pricePerDay <= 0) {
      setEditModalError('दर 0 से अधिक होनी चाहिए।');
      return;
    }
    if (priceUnit === 'custom' && !customPriceUnit.trim()) {
      setEditModalError('कृपया कस्टम यूनिट दर्ज करें (उदा. प्रति विजिट)।');
      return;
    }

    setIsSaving(true);
    setEditModalError(null);

    try {
      const isCustomWorkerCat = categoryId?.startsWith('worker_cat:');
      const targetCategoryId = categoryId === 'other' || !categoryId || isCustomWorkerCat ? null : categoryId;
      const targetOtherCategory =
        categoryId === 'other'
          ? (otherCategory.trim() || null)
          : isCustomWorkerCat
          ? (categories.find((c) => c.id === categoryId)?.name_hi || null)
          : null;

      const res = await WorkerService.saveWorkerProfile(user.id, {
        category_id: targetCategoryId,
        other_category: targetOtherCategory,
        experience_years: Number(experienceYears) || 0,
        price_per_day: Number(pricePerDay) || 0,
        price_unit: priceUnit,
        custom_price_unit: (priceUnit === 'custom' || priceUnit === 'other') ? (customPriceUnit.trim() || null) : null,
        is_active: true,
        is_mobile_public: isMobilePublic,
        about_text: aboutText.trim() || null,
      });

      setIsSaving(false);

      if (res.success) {
        WorkerService.invalidateCache(user.id);
        setIsCreatingWorker(false);
        setStatusMsg({ type: 'success', text: lang === 'hi' ? 'सेवा प्रोफ़ाइल सफलतापूर्वक बनाई गई।' : 'Service profile created successfully.' });
        await refreshUser();
      } else {
        setEditModalError(res.error || (lang === 'hi' ? 'सेवा प्रोफ़ाइल बनाने में त्रुटि।' : 'Error creating service profile.'));
      }
    } catch (err) {
      setIsSaving(false);
      setEditModalError(err instanceof Error ? err.message : 'त्रुटि हुई।');
    }
  };

  // Delete Worker Profile ONLY (preserves user account, profile, chats, location)
  const handleConfirmDeleteWorker = async () => {
    if (!user) return;
    setIsSaving(true);
    setStatusMsg(null);

    try {
      const res = await WorkerService.deleteWorkerProfile(user.id);
      if (res.success) {
        // 1. Immediately wipe worker profile from local React state
        setWorkerProfile(null);
        WorkerService.invalidateCache(user.id);
        setIsConfirmingDeleteWorker(false);
        setIsSaving(false);
        setStatusMsg({
          type: 'success',
          text: lang === 'hi' ? 'सेवा प्रोफ़ाइल हटा दी गई है। आपका सामान्य खाता सुरक्षित है।' : 'Service profile deleted. Your normal account is preserved.',
        });
        // 2. Refresh from real database to confirm state sync
        await refreshUser(true);
      } else {
        setIsSaving(false);
        setStatusMsg({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
      }
    } catch (err) {
      setIsSaving(false);
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'त्रुटि हुई।' });
    }
  };

  // Instant Mobile Privacy Toggle on Profile page with direct Supabase sync
  const handleToggleMobilePrivacy = async (newVal: boolean) => {
    if (!user || isTogglingPrivacyRef.current) return;
    isTogglingPrivacyRef.current = true;
    setIsMobilePublic(newVal);
    if (workerProfile) {
      setWorkerProfile({
        ...workerProfile,
        is_mobile_public: newVal,
      });
    }
    setStatusMsg(null);
    try {
      // 1. Update Profile (which also syncs to worker_profiles skills metadata)
      await ProfileService.updateProfile(user.id, {
        is_mobile_public: newVal,
      });

      // 2. Also update Worker Profile directly if worker profile exists
      if (workerProfile) {
        await WorkerService.saveWorkerProfile(user.id, {
          category_id: workerProfile.category_id,
          other_category: workerProfile.other_category,
          experience_years: workerProfile.experience_years,
          price_per_day: workerProfile.price_per_day,
          price_unit: workerProfile.price_unit,
          custom_price_unit: workerProfile.custom_price_unit,
          is_active: workerProfile.is_active,
          is_mobile_public: newVal,
          about_text: workerProfile.about_text,
        });
        WorkerService.invalidateCache(user.id);
      }

      ProfileService.invalidateCache(user.id);
      await refreshUser(true);
      setStatusMsg({
        type: 'success',
        text: newVal
          ? (lang === 'hi' ? 'मोबाइल नंबर अब सार्वजनिक (Public) है।' : 'Mobile number is now public.')
          : (lang === 'hi' ? 'मोबाइल नंबर अब निजी (Private) है।' : 'Mobile number is now private.'),
      });
    } catch (err) {
      console.error('Failed to update mobile privacy:', err);
      setIsMobilePublic(!newVal);
      if (workerProfile) {
        setWorkerProfile({
          ...workerProfile,
          is_mobile_public: !newVal,
        });
      }
      setStatusMsg({
        type: 'error',
        text: lang === 'hi' ? 'गोपनीयता सेटिंग बदलने में विफल।' : 'Failed to update privacy setting.',
      });
    } finally {
      isTogglingPrivacyRef.current = false;
    }
  };

  // Upload Worker Voice
  const handleUploadWorkerVoice = async (blob: Blob) => {
    if (!user) return;
    setIsUploadingVoice(true);
    setStatusMsg(null);

    const res = await MediaService.uploadWorkerVoice(user.id, blob);
    setIsUploadingVoice(false);
    if (res.error) {
      setStatusMsg({ type: 'error', text: res.error });
    } else {
      WorkerService.invalidateCache(user.id);
      setStatusMsg({ type: 'success', text: 'आवाज परिचय सहेजा गया।' });
      setShowVoiceRecorder(false);
      await refreshUser();
    }
  };

  // Delete Worker Voice
  const handleDeleteWorkerVoice = async () => {
    if (!user || !workerProfile?.voice_recording) return;
    setIsDeletingVoice(true);
    setStatusMsg(null);
    try {
      const rec = workerProfile.voice_recording;
      const res = await MediaService.deleteWorkerMedia(rec.id, rec.storage_path);
      if (res.success) {
        WorkerService.invalidateCache(user.id);
        setStatusMsg({
          type: 'success',
          text: lang === 'hi' ? 'आवाज परिचय हटा दिया गया।' : 'Voice introduction deleted.',
        });
        await refreshUser();
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'हटाने में समस्या आई।' });
    } finally {
      setIsDeletingVoice(false);
    }
  };

  // Upload Work Photo
  const handleWorkPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if ((workerProfile?.work_photos?.length || 0) >= 10) {
      setStatusMsg({ type: 'error', text: 'अधिकतम 10 तस्वीरें ही अपलोड की जा सकती हैं।' });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setUploadingPreviewUrl(previewUrl);
    setIsUploadingPhoto(true);
    setStatusMsg(null);

    try {
      const res = await MediaService.uploadWorkerWorkPhoto(user.id, file);
      if (res.error || !res.media) {
        setStatusMsg({ type: 'error', text: res.error || 'तस्वीर अपलोड असफल।' });
      } else {
        setStatusMsg({ type: 'success', text: 'काम की तस्वीर जोड़ी गई।' });
        const updated = [...(workerProfile?.work_photos || []), res.media];
        updateWorkerPhotos(updated);
        WorkerService.updateCachedWorkerPhotos(user.id, updated);
      }
    } finally {
      setIsUploadingPhoto(false);
      setUploadingPreviewUrl(null);
      if (workPhotoInputRef.current) {
        workPhotoInputRef.current.value = '';
      }
    }
  };

  // Delete Work Photo ONLY (does not touch worker profile or main account)
  const handleDeleteWorkPhoto = async (photoId: string, storagePath: string) => {
    if (!user || deletingPhotoId) return;

    setDeletingPhotoId(photoId);
    setStatusMsg(null);

    try {
      const res = await MediaService.deleteWorkerMedia(photoId, storagePath);
      if (!res.success) {
        setStatusMsg({ type: 'error', text: res.error || 'तस्वीर हटाने में समस्या आई।' });
      } else {
        setStatusMsg({ type: 'success', text: 'काम की तस्वीर हटा दी गई।' });
        const remaining = (workerProfile?.work_photos || []).filter((p) => p.id !== photoId);
        updateWorkerPhotos(remaining);
        WorkerService.updateCachedWorkerPhotos(user.id, remaining);
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'हटाने में समस्या आई।',
      });
    } finally {
      setDeletingPhotoId(null);
    }
  };

  // Guest State - Completely locked and unchanged
  if (!user) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-md mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <User className="w-8 h-8" />
        </div>
        <h2 style={{ fontSize: '18px' }} className="font-bold text-slate-800">{t.yourProfile}</h2>
        <p style={{ fontSize: '14px' }} className="text-slate-500">
          अपनी प्रोफ़ाइल बनाने या सेवा प्रदाता के रूप में जुड़ने के लिए अपना खाता खोलें।
        </p>
        <button
          onClick={onRequireAuth}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span style={{ fontSize: '14px' }}>{t.login} / {t.createAccount}</span>
        </button>

        {/* Profile Get Help Workflow */}
        <div className="pt-8 text-left">
          <GetHelpCard showCallHelpline={true} />
        </div>
      </div>
    );
  }

  const firstLetter = user.name.trim().charAt(0).toUpperCase();
  const locationText = LocationService.formatFullDetails(location, '', lang);
  const myAddressDisplay = location
    ? generateAddressString(location, lang)
    : user.address || '';

  const effectiveWorker: WorkerProfile = workerProfile
    ? {
        user_id: user.id,
        category_id: workerProfile.category_id,
        other_category: workerProfile.other_category,
        experience_years: workerProfile.experience_years ?? 0,
        price_per_day: workerProfile.price_per_day ?? 0,
        price_unit: workerProfile.price_unit ? (workerProfile.price_unit === 'custom' ? 'other' : workerProfile.price_unit) : 'day',
        custom_price_unit: workerProfile.custom_price_unit || null,
        is_active: workerProfile.is_active !== false,
        is_mobile_public: isMobilePublic,
        about_text: workerProfile.about_text,
        priority_points: workerProfile.priority_points ?? 0,
        created_at: workerProfile.created_at || user.created_at || new Date().toISOString(),
        updated_at: workerProfile.updated_at || user.updated_at || new Date().toISOString(),
        category: workerProfile.category,
        profile: user,
        location: location,
        voice_recording: workerProfile.voice_recording,
        work_photos: workerProfile.work_photos,
      }
    : {
        user_id: user.id,
        experience_years: 0,
        price_per_day: 0,
        priority_points: 0,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: user.updated_at || new Date().toISOString(),
        profile: user,
        location: location,
        is_mobile_public: isMobilePublic,
      };

  return (
    <div className="pb-28 pt-3 px-3 max-w-2xl mx-auto space-y-4">
      {statusMsg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-teal-50 text-teal-800 border border-teal-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-teal-700" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Profile Header Bar */}
      <div
        className="flex items-center justify-between px-1"
        style={{
          marginLeft: '10px',
          marginRight: '10px',
          marginBottom: '10px',
          marginTop: '10px',
          fontSize: '16px',
        }}
      >
        <h2
          className="text-sm font-bold text-slate-800 uppercase tracking-wider"
          style={{ fontSize: '17px' }}
        >
          {t.yourProfile}
        </h2>
        <span
          className="text-[11px] text-teal-800 font-semibold bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200"
          style={{ fontSize: '16px' }}
        >
          {workerProfile
            ? lang === 'hi'
              ? 'सेवा प्रदाता खाता'
              : 'Service Provider Account'
            : lang === 'hi'
            ? 'सामान्य खाता'
            : 'Normal User'}
        </span>
      </div>

      {/* 1. Main Profile Identity Card (WorkerCard component reuse - locked design) */}
      <div className="transition-transform duration-150">
        <WorkerCard
          worker={effectiveWorker}
          onOpenDetail={() => setShowFullProfileModal(true)}
          onOpenChat={() => {}}
          onRequireAuth={() => {}}
          isNormalUser={!workerProfile}
          isOwnProfile={true}
          onOpenPhotoViewer={() => setShowPhotoViewer(true)}
        />
      </div>

      {/* 2. Compact Profile Action Buttons in exact order:
          1. "पूरी प्रोफाइल देखें" (View Full Profile)
          2. "प्रोफाइल संपादित करें" (Edit Profile) */}
      <div className="space-y-2.5">
        {/* Button 1: पूरी प्रोफाइल देखें */}
        <button
          type="button"
          onClick={() => setShowFullProfileModal(true)}
          style={{ paddingTop: '13px', marginBottom: '8px' }}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-800 hover:bg-teal-900 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          <span>{lang === 'hi' ? 'पूरी प्रोफाइल देखें' : 'View Full Profile'}</span>
        </button>

        {/* Button 2: प्रोफाइल संपादित करें */}
        <button
          type="button"
          onClick={handleStartEditing}
          style={{ backgroundColor: '#d37c9f' }}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <Edit2 className="w-4 h-4" />
          <span>{lang === 'hi' ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile'}</span>
        </button>

        {/* If Normal User without Worker Profile: Show "Make Worker Profile" button */}
        {!workerProfile && (
          <div
            style={{ backgroundColor: '#bfd3d3' }}
            className="p-4 border border-slate-200/90 rounded-2xl text-center space-y-2.5 shadow-2xs mt-2"
          >
            <p className="text-xs sm:text-sm text-slate-600">
              {lang === 'hi'
                ? 'क्या आप सेवा देते हैं? अपनी सेवा प्रोफ़ाइल बनाएं और अपनी सेवाएं लोगों तक पहुंचाएं।'
                : 'Do you offer services? Create a service profile and reach more clients.'}
            </p>
            <button
              type="button"
              onClick={handleStartCreatingWorker}
              style={{ backgroundColor: '#edc1e5' }}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-slate-800 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4 text-teal-700" />
              <span>{t.createWorkerProfile}</span>
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          MOBILE NUMBER PRIVACY / PUBLIC MOBILE NUMBER ON/OFF TOGGLE
          Placement: Directly below Edit Profile section & directly above “इस प्रकार की सहायता चाहिए”
      ========================================================================== */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="pr-2">
            <label
              htmlFor="is-mobile-public-toggle"
              className="font-semibold text-slate-800 text-xs sm:text-sm cursor-pointer select-none"
              style={{ fontSize: '14px' }}
            >
              {lang === 'hi' ? 'मोबाइल नंबर से संपर्क की अनुमति' : 'Allow Contact by Mobile Number'}
            </label>

            <p className="text-[11px] text-slate-500 mt-0.5" style={{ fontSize: '13px' }}>
              {isMobilePublic
                ? (lang === 'hi'
                    ? 'चालू (ON): आपका नंबर दिखाई देगा और लोग आपको सीधे कॉल या संदेश कर सकते हैं।'
                    : 'ON: Your number will be visible, and people can call or message you directly.')
                : (lang === 'hi'
                    ? 'बंद (OFF): आपका मोबाइल नंबर अब किसी को दिखाई नहीं देगा। लोग आपको सीधे कॉल नहीं कर सकते, लेकिन आपको संदेश भेज सकते हैं।'
                    : 'OFF: Your mobile number will be hidden. People cannot call you directly, but they can send you messages.')}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
            <input
              id="is-mobile-public-toggle"
              type="checkbox"
              checked={isMobilePublic}
              onChange={(e) => handleToggleMobilePrivacy(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-700"></div>
          </label>
        </div>
      </div>

      {/* 6. HELP / सहायता — “इस प्रकार की सहायता चाहिए” — EXACTLY BELOW PRIVACY CONTROL */}
      <div
        className="pt-4 border-t border-slate-200/80"
        style={{
          backgroundColor: '#e8ffe8',
          marginLeft: '0px',
          marginTop: '0px',
          borderRadius: '20px',
        }}
      >
        <GetHelpCard showCallHelpline={true} />
      </div>

      {/* 7. WEBSITE SHARE — AT THE VERY BOTTOM OF PROFILE PAGE (Requirement 2) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleShareWebsite}
          className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-50/60 shadow-xs transition active:scale-98 font-bold text-xs sm:text-sm cursor-pointer"
        >
          {copiedWebsiteShare ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700">
                {lang === 'hi' ? 'वेबसाइट लिंक कॉपी हो गया!' : 'Website Link Copied!'}
              </span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-teal-700" />
              <span>
                {lang === 'hi' ? 'वेबसाइट शेयर करें (Share Website)' : 'Share Website'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* =========================================================================
          UNIFIED EDIT PROFILE MODAL (Single Editing Flow, NO SKILLS)
          For Worker: Edits Personal details AND Worker details
          For Normal User: Edits Personal details
      ========================================================================== */}
      {isEditingProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={handleStopEditing}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-teal-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {lang === 'hi' ? 'प्रोफ़ाइल संपादन (Edit Profile)' : 'Edit Profile'}
                  </h3>
                  {workerProfile && (
                    <p className="text-[10px] text-teal-800 font-medium">खाता व सेवा विवरण अपडेट करें</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleStopEditing}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                aria-label="बंद करें"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveUnifiedProfile} className="p-4 space-y-4 text-xs">
              {editModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editModalError}</span>
                </div>
              )}

              {/* Photo Management Section inside Edit */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border border-teal-600 bg-teal-50 flex items-center justify-center font-bold text-teal-800 text-lg shrink-0">
                  {user.profile_photo ? (
                    <img src={user.profile_photo} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{firstLetter}</span>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <span className="font-bold text-slate-800 text-[11px] block">प्रोफ़ाइल फ़ोटो (Photo)</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="file"
                      ref={photoInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                    <button
                      type="button"
                      disabled={isUploadingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                      <span>{user.profile_photo ? 'फ़ोटो बदलें' : 'फ़ोटो जोड़ें'}</span>
                    </button>
                    {user.profile_photo && (
                      <button
                        type="button"
                        onClick={handleDeleteProfilePhoto}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>हटाएं</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Details */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  व्यक्तिगत विवरण (Personal Details)
                </h4>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t.name} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t.mobile} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
                    maxLength={10}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 font-mono"
                  />
                </div>

                {/* Automatically Generated Address */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{t.address || 'Address'}</label>
                  <div className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-medium select-none">
                    {address ? (
                      <span>{address}</span>
                    ) : (
                      <span className="text-slate-400 italic">स्थान चुनने पर पता स्वतः दिखेगा</span>
                    )}
                  </div>
                </div>

                {/* Hierarchical Location Picker */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">स्थान (स्थान चुनें)</label>
                  <LocationPicker
                    value={selectedLocation}
                    onChange={(newLoc) => {
                      setSelectedLocation(newLoc);
                      if (newLoc) {
                        setAddress(generateAddressString(newLoc));
                      } else {
                        setAddress('');
                      }
                    }}
                  />
                </div>
              </div>

              {/* If Worker: Also edit Worker Details in the same form (NO SKILLS) */}
              {workerProfile && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-teal-700" />
                    <span>{lang === 'hi' ? 'सेवा विवरण (Service Details)' : 'Service Details'}</span>
                  </h4>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">{t.category}</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm"
                    >
                      <option value="">श्रेणी चुनें</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {lang === 'hi' ? c.name_hi : c.name_en}
                        </option>
                      ))}
                      <option value="other">{lang === 'hi' ? 'अन्य सेवा (Other Service)' : 'Other Service'}</option>
                    </select>
                  </div>

                  {categoryId === 'other' && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">{lang === 'hi' ? 'सेवा का प्रकार' : 'Type of Service'}</label>
                      <input
                        type="text"
                        value={otherCategory}
                        onChange={(e) => setOtherCategory(e.target.value)}
                        placeholder="उदा. हलवाई, वेल्डर"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {lang === 'hi' ? 'अनुभव (वर्ष में)' : 'Experience (in years)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm"
                    />
                  </div>

                  {/* Feature 2: Flexible Pricing Section */}
                  <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          {lang === 'hi' ? 'फीस का आधार' : 'Fee Unit'} <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={priceUnit === 'custom' ? 'other' : priceUnit}
                          onChange={(e) => setPriceUnit(e.target.value as PriceUnit)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm font-medium"
                        >
                          <option value="month">{lang === 'hi' ? 'प्रति महीने (Per Month)' : 'Per Month'}</option>
                          <option value="day">{lang === 'hi' ? 'प्रति दिन (Per Day)' : 'Per Day'}</option>
                          <option value="hour">{lang === 'hi' ? 'प्रति घंटे (Per Hour)' : 'Per Hour'}</option>
                          <option value="other">{lang === 'hi' ? 'अन्य (Other)' : 'Other'}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          {priceUnit === 'hour'
                            ? (lang === 'hi' ? 'फीस (₹ / घंटा)' : 'Fee (₹ / Hour)')
                            : priceUnit === 'month'
                            ? (lang === 'hi' ? 'फीस (₹ / महीना)' : 'Fee (₹ / Month)')
                            : (priceUnit === 'other' || priceUnit === 'custom')
                            ? (lang === 'hi' ? 'फीस (₹)' : 'Fee (₹)')
                            : (lang === 'hi' ? 'आपकी फीस (₹ / दिन)' : 'Your Fee (₹ / Day)')}{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={pricePerDay}
                          onChange={(e) => setPricePerDay(Number(e.target.value))}
                          required
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    {(priceUnit === 'other' || priceUnit === 'custom') && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          {lang === 'hi' ? 'कस्टम यूनिट दर्ज करें (उदा. प्रति विजिट, प्रति सेवा)' : 'Enter Custom Unit (e.g. Per Visit, Per Service)'}{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customPriceUnit}
                          onChange={(e) => setCustomPriceUnit(e.target.value)}
                          placeholder={lang === 'hi' ? 'उदा. प्रति विजिट' : 'e.g. Per Visit'}
                          required={priceUnit === 'other' || priceUnit === 'custom'}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm font-medium"
                        />
                      </div>
                    )}
                  </div>

                  {/* About Me / Services Text */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {lang === 'hi' ? 'मेरी सर्विस और अनुभव' : 'My Services & Experience'}
                    </label>
                    <textarea
                      value={aboutText}
                      onChange={(e) => setAboutText(e.target.value)}
                      rows={4}
                      placeholder={lang === 'hi' ? 'अपनी सर्विसेस और एक्सपर्टीज़ के बारे में बताएं...' : 'Tell people about your services and expertise...'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl resize-none bg-white text-xs sm:text-sm"
                    />
                  </div>

                  {/* Work Photos (काम / सर्विस की तस्वीरें) */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
                        <span>{lang === 'hi' ? 'काम / सर्विस की तस्वीरें' : 'Work / Service Photos'}</span>
                        <span className="text-slate-400 font-normal">({(workerProfile.work_photos || []).length}/10)</span>
                      </label>
                      {(workerProfile.work_photos || []).length < 10 && (
                        <div>
                          <input
                            type="file"
                            ref={workPhotoInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleWorkPhotoUpload}
                          />
                          <button
                            type="button"
                            disabled={isUploadingPhoto}
                            onClick={() => workPhotoInputRef.current?.click()}
                            className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>{lang === 'hi' ? 'तस्वीर जोड़ें' : 'Add Photo'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {(workerProfile.work_photos || []).length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                        {workerProfile.work_photos!.map((photo) => (
                          <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                            <img
                              src={photo.public_url}
                              alt="Work"
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => {
                                setFullscreenPhoto(photo.public_url || null);
                                setFullscreenTitle(lang === 'hi' ? 'काम की तस्वीर' : 'Work Photo');
                              }}
                            />
                            <button
                              type="button"
                              disabled={deletingPhotoId === photo.id}
                              onClick={() => handleDeleteWorkPhoto(photo.id, photo.storage_path)}
                              className="absolute top-1 right-1 w-5 h-5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-full flex items-center justify-center transition cursor-pointer shadow-xs disabled:opacity-50"
                              title={lang === 'hi' ? 'तस्वीर हटाएं' : 'Delete photo'}
                            >
                              {deletingPhotoId === photo.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-2.5 h-2.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-slate-500 text-xs">
                        {lang === 'hi' ? 'कोई काम की तस्वीर नहीं जोड़ी गई है।' : 'No work photos added yet.'}
                      </div>
                    )}
                  </div>

                  {/* Voice Introduction (आवाज परिचय) */}
                  <div className="space-y-2 pt-1">
                    <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                      <span>{lang === 'hi' ? 'आवाज परिचय (Voice Introduction)' : 'Voice Introduction'}</span>
                    </label>

                    {workerProfile.voice_recording?.public_url ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <AudioPlayer
                          src={workerProfile.voice_recording.public_url}
                          title={lang === 'hi' ? 'आपका आवाज परिचय' : 'Your Voice Introduction'}
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>{showVoiceRecorder ? (lang === 'hi' ? 'रिकॉर्डर बंद करें' : 'Close Recorder') : (lang === 'hi' ? 'रिकॉर्डिंग बदलें' : 'Replace Recording')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingVoice}
                            onClick={handleDeleteWorkerVoice}
                            className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {isDeletingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span>{lang === 'hi' ? 'रिकॉर्डिंग हटाएं' : 'Delete'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
                        <p className="text-slate-500 text-xs">
                          {lang === 'hi'
                            ? 'अपनी सेवा और अनुभव के बारे में बोलकर बताएं।'
                            : 'Record a voice description about your service and experience.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>{showVoiceRecorder ? (lang === 'hi' ? 'रिकॉर्डर बंद करें' : 'Close Recorder') : (lang === 'hi' ? 'आवाज रिकॉर्ड करें' : 'Record Voice')}</span>
                        </button>
                      </div>
                    )}

                    {showVoiceRecorder && (
                      <div className="pt-1">
                        <VoiceRecorder
                          onRecordingComplete={handleUploadWorkerVoice}
                          title={lang === 'hi' ? 'पूरा विवरण बोलकर बताएं' : 'Voice Introduction'}
                          subtitle={lang === 'hi' ? 'अपनी सेवा और अनुभव के बारे में बोलकर बताएं।' : 'Speak about your services and experience.'}
                          saveLabel={lang === 'hi' ? 'आवाज सहेजें' : 'Save Voice'}
                          isSaving={isUploadingVoice}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Delete / Disconnect Worker Profile Section inside Edit Profile */}
              {workerProfile && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-rose-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>{lang === 'hi' ? 'सेवा प्रोफ़ाइल हटाएं (Delete Service Profile)' : 'Delete Service Profile'}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {lang === 'hi'
                          ? 'यदि आप अब सेवा प्रदाता के रूप में काम नहीं करना चाहते हैं, तो अपनी सेवा प्रोफ़ाइल हटा सकते हैं।'
                          : 'If you no longer wish to offer services, you can delete your service profile.'}
                      </p>
                    </div>
                    {!isConfirmingDeleteWorker && (
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDeleteWorker(true)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>{lang === 'hi' ? 'हटाएं' : 'Delete'}</span>
                      </button>
                    )}
                  </div>

                  {isConfirmingDeleteWorker && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                      <p className="text-xs sm:text-sm font-bold text-rose-800 text-center">
                        {lang === 'hi'
                          ? 'क्या आप सच में अपनी सेवा प्रोफ़ाइल हटाना चाहते हैं? आपका मुख्य खाता व बातचीत सुरक्षित रहेगी।'
                          : 'Are you sure you want to delete your service profile? Your main account and chats will remain safe.'}
                      </p>
                      <div className="flex items-center justify-center gap-2.5">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => setIsConfirmingDeleteWorker(false)}
                          className="py-2 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-50 transition cursor-pointer"
                        >
                          {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            await handleConfirmDeleteWorker();
                            handleStopEditing();
                          }}
                          className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
                        >
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>{lang === 'hi' ? 'हाँ, हटाएं' : 'Confirm Delete'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sticky Action Footer */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-md -mx-4 -mb-4 p-4 border-t border-slate-100 flex items-center justify-end gap-2 z-10">
                <button
                  type="button"
                  onClick={handleStopEditing}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-xs transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? 'सहेज रहे हैं...' : 'सहेजें (Save Changes)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Create Worker Profile for Normal User (NO SKILLS)
      ========================================================================== */}
      {isCreatingWorker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={handleStopCreatingWorker}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-teal-700" />
                <h3 className="text-base font-bold text-slate-800">
                  {t.createWorkerProfile}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleStopCreatingWorker}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                aria-label="बंद करें"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveNewWorkerProfile} className="p-4 space-y-4 text-xs">
              {editModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editModalError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {t.category} <span className="text-rose-500">*</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm"
                >
                  <option value="">श्रेणी चुनें</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'hi' ? c.name_hi : c.name_en}
                    </option>
                  ))}
                  <option value="other">{lang === 'hi' ? 'अन्य सेवा (Other Service)' : 'Other Service'}</option>
                </select>
              </div>

              {categoryId === 'other' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{lang === 'hi' ? 'सर्विस का प्रकार' : 'Service Type'}</label>
                  <input
                    type="text"
                    value={otherCategory}
                    onChange={(e) => setOtherCategory(e.target.value)}
                    placeholder="उदा. हलवाई, वेल्डर"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  अनुभव (वर्ष में)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm"
                />
              </div>

              {/* Feature 2: Flexible Pricing Section */}
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {lang === 'hi' ? 'फीस का आधार' : 'Fee Unit'} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={priceUnit === 'custom' ? 'other' : priceUnit}
                      onChange={(e) => setPriceUnit(e.target.value as PriceUnit)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm font-medium"
                    >
                      <option value="month">{lang === 'hi' ? 'प्रति महीने (Per Month)' : 'Per Month'}</option>
                      <option value="day">{lang === 'hi' ? 'प्रति दिन (Per Day)' : 'Per Day'}</option>
                      <option value="hour">{lang === 'hi' ? 'प्रति घंटे (Per Hour)' : 'Per Hour'}</option>
                      <option value="other">{lang === 'hi' ? 'अन्य (Other)' : 'Other'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {priceUnit === 'hour'
                        ? (lang === 'hi' ? 'फीस (₹ / घंटा)' : 'Fee (₹ / Hour)')
                        : priceUnit === 'month'
                        ? (lang === 'hi' ? 'फीस (₹ / महीना)' : 'Fee (₹ / Month)')
                        : (priceUnit === 'other' || priceUnit === 'custom')
                        ? (lang === 'hi' ? 'फीस (₹)' : 'Fee (₹)')
                        : (lang === 'hi' ? 'आपकी फीस (₹ / दिन)' : 'Your Fee (₹ / Day)')}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={pricePerDay}
                      onChange={(e) => setPricePerDay(Number(e.target.value))}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white text-xs sm:text-sm"
                    />
                  </div>
                </div>

                {(priceUnit === 'other' || priceUnit === 'custom') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {lang === 'hi' ? 'कस्टम यूनिट दर्ज करें (उदा. प्रति विजिट, प्रति सेवा)' : 'Enter Custom Unit (e.g. Per Visit, Per Service)'}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customPriceUnit}
                      onChange={(e) => setCustomPriceUnit(e.target.value)}
                      placeholder={lang === 'hi' ? 'उदा. प्रति विजिट' : 'e.g. Per Visit'}
                      required={priceUnit === 'other' || priceUnit === 'custom'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs sm:text-sm font-medium"
                    />
                  </div>
                )}
              </div>

              {/* About Me / Services Text */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {lang === 'hi' ? 'मेरी सर्विस और अनुभव' : 'My Services & Experience'}
                </label>
                <textarea
                  value={aboutText}
                  onChange={(e) => setAboutText(e.target.value)}
                  rows={4}
                  placeholder={lang === 'hi' ? 'अपनी सर्विसेस और एक्सपर्टीज़ के बारे में बताएं...' : 'Tell people about your services and expertise...'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl resize-none bg-white text-xs sm:text-sm"
                />
              </div>

              {/* Sticky Action Footer */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-md -mx-4 -mb-4 p-4 border-t border-slate-100 flex items-center justify-end gap-2 z-10">
                <button
                  type="button"
                  onClick={handleStopCreatingWorker}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-xs transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (lang === 'hi' ? 'सहेज रहे हैं...' : 'Saving...') : (lang === 'hi' ? 'सेवा प्रोफ़ाइल बनाएं' : 'Create Service Profile')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-screen Profile Photo Viewer & Management */}
      {showPhotoViewer && user && (
        <ProfilePhotoViewerModal
          userId={user.id}
          userName={user.name || 'User'}
          photoUrl={user.profile_photo || null}
          onClose={() => setShowPhotoViewer(false)}
          onPhotoUpdated={async () => {
            await refreshUser(true);
          }}
        />
      )}

      {/* Embedded Crop Modal if user selects a photo inside Edit Profile modal */}
      {selectedFileForCrop && (
        <ImageCropperModal
          imageFile={selectedFileForCrop}
          aspectRatio={1}
          title="प्रोफ़ाइल फ़ोटो काटें (Crop Photo)"
          onCropComplete={handleCropComplete}
          onCancel={() => setSelectedFileForCrop(null)}
        />
      )}

      {/* Full-screen Work Photo Viewer with Pinch-to-Zoom & Pan */}
      {fullscreenPhoto && (
        <ImageViewerModal
          imageUrl={fullscreenPhoto}
          title={fullscreenTitle || user?.name || 'काम की तस्वीर'}
          onClose={() => {
            setFullscreenPhoto(null);
            setFullscreenTitle(null);
          }}
        />
      )}

      {/* Complete Profile Modal (reuses exact same WorkerDetailModal used for all workers) */}
      {showFullProfileModal && (
        <WorkerDetailModal
          worker={workerProfile ? effectiveWorker : null}
          user={user}
          onClose={() => setShowFullProfileModal(false)}
          onOpenChat={onOpenChat || (() => {})}
          onRequireAuth={onRequireAuth}
          onStartEditing={handleStartEditing}
        />
      )}
    </div>
  );
};
