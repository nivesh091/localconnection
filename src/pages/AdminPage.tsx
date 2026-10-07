import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Briefcase,
  PhoneCall,
  FileText,
  Tag,
  Send,
  Clock,
  Edit3,
  CheckCircle,
  AlertCircle,
  Search,
  Lock,
  Plus,
  Database,
  Copy,
  Check,
  ExternalLink,
  Volume2,
  Trash2,
  Edit,
  MessageSquare,
  Info,
  ChevronDown,
  ChevronUp,
  Mic,
  RefreshCw,
  Globe,
  Image as ImageIcon,
  Upload,
  Crop,
  Download,
} from 'lucide-react';
import QRCode from 'qrcode';
import { ImageCropperModal } from '../components/ImageCropperModal';
import {
  TalentBrandLogo,
  WorkerCertificateCard,
  downloadCertificateCard,
  resolveWorkerCertificateData,
  CertificateData,
} from '../components/WorkerCertificateCard';
import { uploadBrandingLogo } from '../services/brandingService';
import {
  UserProfile,
  WorkerProfile,
  WorkerCategory,
  AdminSettings,
  AdminCommunication,
  HelpRequest,
  WorkerRequest,
  Requirement,
  getPriceUnitLabel,
} from '../types';
import { AudioPlayer } from '../components/AudioPlayer';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { RequirementDetailModal } from '../components/RequirementDetailModal';
import { SearchableCategoryModal } from '../components/SearchableCategoryModal';
import { AdminService } from '../services/adminService';
import { HelpService } from '../services/helpService';
import { RequestService } from '../services/requestService';
import { RequirementService } from '../services/requirementService';
import { AuthService } from '../services/authService';
import { MediaService } from '../services/mediaService';
import { LocationService } from '../services/locationService';
import { isSchemaPending } from '../lib/supabase';
import {
  KAAMMITRA_MASTER_SCHEMA_SQL,
  ACCOUNT_DELETION_MIGRATION_SQL,
  FEATURES_3_MIGRATION_SQL,
  REQUIREMENTS_ENHANCEMENT_MIGRATION_SQL,
  SUPABASE_SQL_EDITOR_URL,
  SUPABASE_PROJECT_ID,
} from '../lib/migrationSql';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { DEFAULT_BRANDING } from '../services/brandingService';

export const AdminPage: React.FC = () => {
  const { user, isAdmin, refreshUser } = useAuth();
  const { t, lang } = useTranslation();
  const { branding, websiteName, websiteNameEn, websiteNameHi, logoUrl, updateBranding } = useWebsiteBranding();

  // Admin Login state if not authenticated as admin
  const [adminMobile, setAdminMobile] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // Website Name & Share URL Branding state
  const [siteNameEn, setSiteNameEn] = useState(branding.name_en || DEFAULT_BRANDING.name_en);
  const [siteNameHi, setSiteNameHi] = useState(branding.name_hi || DEFAULT_BRANDING.name_hi);
  const [siteShareUrl, setSiteShareUrl] = useState(branding.share_url || '');
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Website Logo Management state
  const [logoFileForCrop, setLogoFileForCrop] = useState<File | null>(null);
  const [pendingLogoBlob, setPendingLogoBlob] = useState<Blob | null>(null);
  const [pendingLogoPreview, setPendingLogoPreview] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const logoInputRef = React.useRef<HTMLInputElement | null>(null);

  // Sync state if branding updates remotely
  useEffect(() => {
    setSiteNameEn(branding.name_en || DEFAULT_BRANDING.name_en);
    setSiteNameHi(branding.name_hi || DEFAULT_BRANDING.name_hi);
    setSiteShareUrl(branding.share_url || '');
  }, [branding.name_en, branding.name_hi, branding.share_url]);

  // Locked Admin Sections (including new 'requirements' section - Point 41)
  const [activeSection, setActiveSection] = useState<
    | 'website_name'
    | 'website_logo'
    | 'users'
    | 'workers'
    | 'certificate_preview'
    | 'requirements'
    | 'admin_call'
    | 'about'
    | 'categories'
    | 'communication'
    | 'retention'
    | 'form_content'
    | 'database_setup'
  >(() => (isSchemaPending() ? 'database_setup' : 'website_name'));

  const [copiedSql, setCopiedSql] = useState(false);

  // Dynamic Certificate Preview State (ONE Single Reusable Preview for Admin)
  const [selectedCertWorkerId, setSelectedCertWorkerId] = useState<string>('');
  const [certOverrides, setCertOverrides] = useState<Partial<CertificateData>>({});
  const [certQrDataUrl, setCertQrDataUrl] = useState<string>('');
  const [isDownloadingAdminCert, setIsDownloadingAdminCert] = useState(false);

  // Requirements Section States (Points 41-48)
  const [requirementsList, setRequirementsList] = useState<Requirement[]>([]);
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false);
  const [requirementSearch, setRequirementSearch] = useState('');
  const [selectedReqCategory, setSelectedReqCategory] = useState<string>('');
  const [requirementSort, setRequirementSort] = useState<'newest' | 'oldest'>('newest');
  const [selectedAdminRequirement, setSelectedAdminRequirement] = useState<Requirement | null>(null);
  const [isReqCategoryFilterModalOpen, setIsReqCategoryFilterModalOpen] = useState(false);
  const [deletingAdminReq, setDeletingAdminReq] = useState<Requirement | null>(null);
  const [isDeletingAdminReq, setIsDeletingAdminReq] = useState(false);

  // Data states
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [workersList, setWorkersList] = useState<WorkerProfile[]>([]);
  const [categoriesList, setCategoriesList] = useState<WorkerCategory[]>([]);
  const [communicationsList, setCommunicationsList] = useState<AdminCommunication[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [workerRequests, setWorkerRequests] = useState<WorkerRequest[]>([]);

  // Feedback status
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for sections
  const [userSearch, setUserSearch] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Delete confirmation state (Task 2)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'user' | 'worker';
    id: string;
    name: string;
  } | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Category creation & editing
  const [newCatHi, setNewCatHi] = useState('');
  const [newCatEn, setNewCatEn] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCatHi, setEditCatHi] = useState('');
  const [editCatEn, setEditCatEn] = useState('');

  // Communication
  const [commType, setCommType] = useState<'text' | 'voice' | 'media'>('text');
  const [commText, setCommText] = useState('');
  const [commSendAll, setCommSendAll] = useState(true);
  const [commRecipientId, setCommRecipientId] = useState('');
  const [commVoiceBlob, setCommVoiceBlob] = useState<Blob | null>(null);
  const [commVoiceUrl, setCommVoiceUrl] = useState<string | null>(null);
  const [showCommVoiceRecorder, setShowCommVoiceRecorder] = useState(false);
  const [isSendingComm, setIsSendingComm] = useState(false);

  // Settings (secure defaults until loaded from database)
  const [callEnabled, setCallEnabled] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [aboutHi, setAboutHi] = useState('');
  const [aboutEn, setAboutEn] = useState('');
  const [welcomeHi, setWelcomeHi] = useState('');
  const [welcomeEn, setWelcomeEn] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleaningRetention, setCleaningRetention] = useState(false);

  // Deletion states for requests
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [clearingAllHelp, setClearingAllHelp] = useState(false);
  const [clearingAllWorker, setClearingAllWorker] = useState(false);

  // Voice playback in admin requests
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playingVoiceUrl, setPlayingVoiceUrl] = useState<string | null>(null);

  const handleToggleVoice = async (id: string, storagePath: string) => {
    if (playingVoiceId === id) {
      setPlayingVoiceId(null);
      setPlayingVoiceUrl(null);
      return;
    }
    const signed = await MediaService.getSignedUrl('help-media', storagePath);
    if (signed) {
      setPlayingVoiceId(id);
      setPlayingVoiceUrl(signed);
    } else {
      setNotice({ type: 'error', text: 'ऑडियो लोड नहीं हो सका।' });
    }
  };

  // Load Admin Data when authorized
  useEffect(() => {
    if (!isAdmin) return;
    async function loadAll() {
      try {
        const u = await AdminService.getUsers();
        setUsersList(u);

        const w = await AdminService.getWorkersAdmin();
        setWorkersList(w);

        const c = await AdminService.getCategoriesAdmin();
        setCategoriesList(c);

        const comms = await AdminService.getCommunicationsAdmin();
        setCommunicationsList(comms);

        const s = await AdminService.getSettings();
        setSettings(s);
        setCallEnabled(s.admin_call_enabled);
        setContactNumber(s.admin_contact_number);
        setAboutHi(s.about_kaammitra_hi);
        setAboutEn(s.about_kaammitra_en);
        setWelcomeHi(s.home_welcome_hi);
        setWelcomeEn(s.home_welcome_en);
        setRetentionDays(s.chat_retention_days);

        const h = await HelpService.getHelpRequests();
        setHelpRequests(h);

        const wr = await RequestService.getWorkerRequests();
        setWorkerRequests(wr);

        const reqs = await RequirementService.getAllRequirementsForAdmin();
        setRequirementsList(reqs);
      } catch (err) {
        console.error('Admin load error:', err);
      }
    }
    loadAll();
  }, [isAdmin]);

  // Default to first worker if none selected
  useEffect(() => {
    if (!selectedCertWorkerId && workersList.length > 0) {
      setSelectedCertWorkerId(workersList[0].user_id);
    }
  }, [workersList, selectedCertWorkerId]);

  // Selected worker object for ONE dynamic certificate preview
  const selectedCertWorker = React.useMemo(() => {
    return workersList.find((w) => w.user_id === selectedCertWorkerId) || workersList[0] || null;
  }, [workersList, selectedCertWorkerId]);

  // Generate dynamic QR code whenever selected worker changes
  useEffect(() => {
    if (!selectedCertWorker) return;
    const profileUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/?worker=${encodeURIComponent(selectedCertWorker.user_id)}`
      : '';
    if (!profileUrl) return;

    let isMounted = true;
    QRCode.toDataURL(profileUrl, {
      width: 480,
      margin: 1,
      color: { dark: '#083a2d', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) setCertQrDataUrl(url);
      })
      .catch((err) => console.error('Admin cert QR error:', err));

    return () => {
      isMounted = false;
    };
  }, [selectedCertWorker]);

  // Reset overrides when switching workers
  const handleSelectCertWorker = (workerId: string) => {
    setSelectedCertWorkerId(workerId);
    setCertOverrides({});
  };

  // Resolved dynamic certificate data from ONE source of truth
  const adminCertData = React.useMemo(() => {
    if (!selectedCertWorker) return null;
    return resolveWorkerCertificateData(
      selectedCertWorker,
      selectedCertWorker.profile,
      lang,
      branding,
      certQrDataUrl,
      certOverrides
    );
  }, [selectedCertWorker, lang, branding, certQrDataUrl, certOverrides]);

  const handleAdminDownloadCert = async () => {
    if (!adminCertData) return;
    setIsDownloadingAdminCert(true);
    try {
      await downloadCertificateCard(adminCertData);
      setNotice({
        type: 'success',
        text: `सर्टिफिकेट (${adminCertData.name} — ${adminCertData.serviceType}) सफलतापूर्वक डाउनलोड हो गया।`,
      });
    } catch (err) {
      console.error('Failed to download admin cert:', err);
      setNotice({ type: 'error', text: 'सर्टिफिकेट डाउनलोड करने में त्रुटि हुई।' });
    } finally {
      setIsDownloadingAdminCert(false);
    }
  };

  // Load requirements on demand
  const loadRequirementsAdmin = async () => {
    setIsLoadingRequirements(true);
    try {
      const data = await RequirementService.getAllRequirementsForAdmin();
      setRequirementsList(data);
    } catch (err) {
      console.warn('Error loading admin requirements:', err);
    } finally {
      setIsLoadingRequirements(false);
    }
  };

  // Admin Permanent Delete for Requirement (Points 47-53)
  const handleConfirmDeleteAdminRequirement = async () => {
    if (!deletingAdminReq) return;
    setIsDeletingAdminReq(true);
    try {
      const res = await RequirementService.deleteRequirementAsAdmin(deletingAdminReq.id);
      if (res.success) {
        setRequirementsList((prev) => prev.filter((r) => r.id !== deletingAdminReq.id));
        setNotice({
          type: 'success',
          text: `आवश्यकता "${deletingAdminReq.short_requirement}" और संबंधित मीडिया स्थायी रूप से हटा दिया गया।`,
        });
        setDeletingAdminReq(null);
      } else {
        setNotice({
          type: 'error',
          text: res.error || 'आवश्यकता हटाने में त्रुटि हुई।',
        });
      }
    } finally {
      setIsDeletingAdminReq(false);
    }
  };

  // Admin Update Requirement Priority (Part 5 & 20)
  const handleUpdateRequirementPriority = async (requirementId: string, points: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(points)));
    setRequirementsList((prev) =>
      prev.map((r) => (r.id === requirementId ? { ...r, priority_points: clamped } : r))
    );
    await AdminService.updateRequirementPriority(requirementId, clamped);
  };

  // Handle Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMobile = adminMobile.trim().replace(/[^0-9]/g, '');

    if (cleanMobile.length !== 10) {
      setAdminLoginError('कृपया 10 अंकों का मान्य एडमिन मोबाइल नंबर दर्ज करें।');
      return;
    }

    setAdminLoginLoading(true);
    setAdminLoginError(null);

    const res = await AuthService.login(cleanMobile, adminPassword);
    setAdminLoginLoading(false);

    if (res.error) {
      setAdminLoginError('अमान्य मोबाइल नंबर या पासवर्ड। केवल अधिकृत एडमिन ही लॉगिन कर सकते हैं।');
    } else {
      await refreshUser();
    }
  };

  // Update Priority Points (1-100)
  const handleUpdatePriority = async (userId: string, points: number) => {
    const res = await AdminService.updateWorkerPriority(userId, points);
    if (res.success) {
      setWorkersList((prev) =>
        prev.map((w) => (w.user_id === userId ? { ...w, priority_points: points } : w))
      );
      setNotice({ type: 'success', text: 'प्राथमिकता अंक अपडेट हो गए।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'अपडेट विफल रहा।' });
    }
  };

  // Toggle Worker Activation (Feature 1: Admin Service Provider Activate / Deactivate)
  const handleToggleWorkerActivation = async (userId: string, currentActive: boolean) => {
    // Safety check: Cannot deactivate admin account itself
    if (userId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72') {
      setNotice({ type: 'error', text: 'एडमिन खाता निष्क्रिय नहीं किया जा सकता।' });
      return;
    }

    const nextState = !currentActive;
    const res = await AdminService.toggleWorkerActivation(userId, nextState);
    if (res.success) {
      setWorkersList((prev) =>
        prev.map((w) => (w.user_id === userId ? { ...w, is_active: nextState } : w))
      );
      setNotice({
        type: 'success',
        text: nextState
          ? 'सेवा प्रदाता को सक्रिय (Active) कर दिया गया है।'
          : 'सेवा प्रदाता को निष्क्रिय (Deactivated) कर दिया गया है।',
      });
    } else {
      setNotice({ type: 'error', text: res.error || 'स्थिति बदलने में विफल।' });
    }
  };

  // Delete Worker Profile Click (Task 2)
  const handleDeleteWorkerClick = (w: WorkerProfile) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'worker',
      id: w.user_id,
      name: w.profile?.name || w.profile?.mobile || 'सेवा प्रदाता',
    });
  };

  // Toggle Category Status
  const handleToggleCategory = async (catId: string, current: boolean) => {
    const res = await AdminService.toggleCategory(catId, !current);
    if (res.success) {
      setCategoriesList((prev) =>
        prev.map((c) => (c.id === catId ? { ...c, is_active: !current } : c))
      );
    } else {
      setNotice({ type: 'error', text: res.error || 'अपडेट विफल रहा।' });
    }
  };

  // Add Category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatHi.trim() || !newCatEn.trim()) return;

    const res = await AdminService.addCategory(newCatHi.trim(), newCatEn.trim());
    if (res.category) {
      setCategoriesList((prev) => [...prev, res.category!]);
      setNewCatHi('');
      setNewCatEn('');
      setNotice({ type: 'success', text: 'नई श्रेणी जोड़ी गई।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'श्रेणी जोड़ने में विफल।' });
    }
  };

  // Start Edit Category
  const handleStartEditCategory = (cat: WorkerCategory) => {
    setEditingCategoryId(cat.id);
    setEditCatHi(cat.name_hi);
    setEditCatEn(cat.name_en);
  };

  // Save Edit Category
  const handleSaveEditCategory = async (catId: string) => {
    if (!editCatHi.trim() || !editCatEn.trim()) return;

    const res = await AdminService.editCategory(catId, editCatHi.trim(), editCatEn.trim());
    if (res.success) {
      setCategoriesList((prev) =>
        prev.map((c) =>
          c.id === catId
            ? { ...c, name_hi: editCatHi.trim(), name_en: editCatEn.trim() }
            : c
        )
      );
      setEditingCategoryId(null);
      setNotice({ type: 'success', text: 'श्रेणी अपडेट हो गई।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'श्रेणी अपडेट विफल।' });
    }
  };

  // Delete Category
  const handleDeleteCategory = async (catId: string) => {
    if (!window.confirm('क्या आप इस श्रेणी को हटाना चाहते हैं? संबंधित सेवा प्रदाताओं की श्रेणी "अनसेट" हो जाएगी।')) {
      return;
    }
    const res = await AdminService.deleteCategory(catId);
    if (res.success) {
      setCategoriesList((prev) => prev.filter((c) => c.id !== catId));
      setNotice({ type: 'success', text: 'श्रेणी हटा दी गई।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
    }
  };

  // Website Name & Share URL Save & Reset handlers
  const handleSaveWebsiteName = async () => {
    const en = siteNameEn.trim();
    const hi = siteNameHi.trim();
    const rawUrl = siteShareUrl.trim();

    if (!en && !hi) {
      setNotice({ type: 'error', text: 'कृपया कम से कम एक नाम अवश्य दर्ज करें।' });
      return;
    }

    // URL validation if provided: must start with http:// or https:// and be valid URL
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setNotice({ type: 'error', text: 'कृपया मान्य Website URL दर्ज करें (http:// या https:// से शुरू होना चाहिए)।' });
          return;
        }
      } catch {
        setNotice({ type: 'error', text: 'अमान्य Website Share URL। कृपया सही URL दर्ज करें (उदा. https://example.com)।' });
        return;
      }
    }

    setIsSavingBranding(true);
    try {
      const res = await updateBranding({
        name_en: en || DEFAULT_BRANDING.name_en,
        name_hi: hi || DEFAULT_BRANDING.name_hi,
        share_url: rawUrl || null,
      });

      if (res.success) {
        setNotice({ type: 'success', text: 'वेबसाइट सेटिंग्स (नाम व शेयर URL) सफलतापूर्वक अपडेट की गईं।' });
      } else {
        setNotice({ type: 'error', text: res.error || 'वेबसाइट सेटिंग्स सहेजने में विफल।' });
      }
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleResetWebsiteName = async () => {
    if (!window.confirm('क्या आप वेबसाइट का नाम व शेयर URL डिफ़ॉल्ट पर रीसेट करना चाहते हैं?')) {
      return;
    }
    setSiteNameEn(DEFAULT_BRANDING.name_en);
    setSiteNameHi(DEFAULT_BRANDING.name_hi);
    setSiteShareUrl('');
    setIsSavingBranding(true);
    try {
      await updateBranding({ ...DEFAULT_BRANDING, share_url: null });
      setNotice({ type: 'success', text: 'वेबसाइट का नाम व शेयर URL डिफ़ॉल्ट पर रीसेट कर दिया गया।' });
    } finally {
      setIsSavingBranding(false);
    }
  };

  // Handle Logo File Selection
  const handleSelectLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'फ़ोटो का साइज़ 10MB से कम होना चाहिए।' });
      return;
    }
    setLogoFileForCrop(file);
    e.target.value = '';
  };

  // Handle Logo Crop Complete
  const handleLogoCropComplete = (croppedBlob: Blob) => {
    setPendingLogoBlob(croppedBlob);
    const objectUrl = URL.createObjectURL(croppedBlob);
    setPendingLogoPreview(objectUrl);
    setLogoFileForCrop(null);
  };

  // Save Website Logo
  const handleSaveWebsiteLogo = async () => {
    if (!pendingLogoBlob) {
      setNotice({ type: 'error', text: 'कृपया पहले नया लोगो चुनें और क्रॉप करें।' });
      return;
    }

    setIsSavingLogo(true);
    try {
      const url = await uploadBrandingLogo(pendingLogoBlob);
      const res = await updateBranding({ logo_url: url });
      if (res.success) {
        setNotice({ type: 'success', text: 'वेबसाइट का लोगो सफलतापूर्वक अपडेट किया गया।' });
        setPendingLogoBlob(null);
        setPendingLogoPreview(null);
      } else {
        setNotice({ type: 'error', text: res.error || 'लोगो सहेजने में विफल।' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'लोगो अपलोड करने में त्रुटि।' });
    } finally {
      setIsSavingLogo(false);
    }
  };

  // Reset Website Logo to Default
  const handleResetWebsiteLogo = async () => {
    if (!window.confirm('क्या आप वेबसाइट का लोगो डिफ़ॉल्ट पर रीसेट करना चाहते हैं?')) {
      return;
    }

    setIsSavingLogo(true);
    try {
      const res = await updateBranding({ logo_url: null });
      if (res.success) {
        setPendingLogoBlob(null);
        setPendingLogoPreview(null);
        setNotice({ type: 'success', text: 'वेबसाइट का लोगो डिफ़ॉल्ट पर रीसेट कर दिया गया।' });
      } else {
        setNotice({ type: 'error', text: res.error || 'रीसेट करने में विफल।' });
      }
    } finally {
      setIsSavingLogo(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    const res = await AdminService.updateSettings({
      admin_call_enabled: callEnabled,
      admin_contact_number: contactNumber,
      about_kaammitra_hi: aboutHi,
      about_kaammitra_en: aboutEn,
      home_welcome_hi: welcomeHi,
      home_welcome_en: welcomeEn,
      chat_retention_days: retentionDays,
    });

    if (res.success) {
      setNotice({ type: 'success', text: 'सेटिंग्स सफलतापूर्वक सहेजी गईं।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'सेटिंग्स सहेजने में विफल।' });
    }
  };

  // Apply Chat Retention Immediately
  const handleApplyRetentionNow = async () => {
    if (!window.confirm(`क्या आप ${retentionDays} दिन से पुराने सभी संदेशों को हटाना चाहते हैं?`)) {
      return;
    }
    setCleaningRetention(true);
    const res = await AdminService.applyChatRetention(retentionDays);
    setCleaningRetention(false);

    if (res.error) {
      setNotice({ type: 'error', text: res.error });
    } else {
      setNotice({
        type: 'success',
        text: `सफलतापूर्वक ${res.deletedCount} पुराने संदेश हटा दिए गए।`,
      });
    }
  };

  // Delete Normal User Profile Click (Task 2)
  const handleDeleteUserClick = (u: UserProfile) => {
    if (u.id === user?.id || u.mobile === '9149275779') {
      setNotice({ type: 'error', text: 'एडमिन खाता नहीं हटाया जा सकता।' });
      return;
    }
    setDeleteConfirm({
      isOpen: true,
      type: 'user',
      id: u.id,
      name: u.name || u.mobile || 'उपयोगकर्ता',
    });
  };

  // Perform confirmed deletion (Task 2)
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeletingItem(true);
    const { type, id, name } = deleteConfirm;

    try {
      if (type === 'worker') {
        const res = await AdminService.deleteWorkerAdmin(id);
        setIsDeletingItem(false);
        if (res.success) {
          setWorkersList((prev) => prev.filter((w) => w.user_id !== id));
          setUsersList((prev) => prev.filter((item) => item.id !== id));
          if (expandedUserId === id) setExpandedUserId(null);
          if (expandedWorkerId === id) setExpandedWorkerId(null);
          setNotice({ type: 'success', text: `सेवा प्रदाता "${name}" का खाता सफलतापूर्वक हटा दिया गया।` });
          setDeleteConfirm(null);
        } else {
          setNotice({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
        }
      } else {
        const res = await AdminService.deleteUserAdmin(id);
        setIsDeletingItem(false);
        if (res.success) {
          setUsersList((prev) => prev.filter((item) => item.id !== id));
          setWorkersList((prev) => prev.filter((w) => w.user_id !== id));
          if (expandedUserId === id) setExpandedUserId(null);
          if (expandedWorkerId === id) setExpandedWorkerId(null);
          setNotice({ type: 'success', text: `उपयोगकर्ता "${name}" सफलतापूर्वक हटा दिया गया।` });
          setDeleteConfirm(null);
        } else {
          setNotice({ type: 'error', text: res.error || 'उपयोगकर्ता हटाने में समस्या आई।' });
        }
      }
    } catch (err) {
      setIsDeletingItem(false);
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'हटाने में विफलता।' });
    }
  };

  // Send Admin Broadcast / Direct Communication (with Voice Recording support)
  const handleSendComm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!commText.trim() && !commVoiceBlob) {
      setNotice({ type: 'error', text: 'कृपया संदेश लिखें या आवाज रिकॉर्डिंग जोड़ें।' });
      return;
    }

    if (!commSendAll && !commRecipientId) {
      setNotice({ type: 'error', text: 'कृपया वह उपयोगकर्ता चुनें जिसे संदेश भेजना है।' });
      return;
    }

    setIsSendingComm(true);
    setNotice(null);

    try {
      let uploadedVoiceUrl: string | null = null;
      if (commVoiceBlob) {
        const uploadRes = await MediaService.uploadAdminVoice(user.id, commVoiceBlob);
        if (uploadRes.error || !uploadRes.url) {
          setIsSendingComm(false);
          setNotice({ type: 'error', text: uploadRes.error || 'आवाज संदेश अपलोड करने में विफल।' });
          return;
        }
        uploadedVoiceUrl = uploadRes.url;
      }

      const res = await AdminService.sendCommunication({
        adminId: user.id,
        sendToAll: commSendAll,
        recipientId: commSendAll ? null : commRecipientId || null,
        messageType: uploadedVoiceUrl ? 'voice' : 'text',
        messageText: commText.trim() || (uploadedVoiceUrl ? 'आवाज संदेश' : ''),
        mediaUrl: uploadedVoiceUrl || undefined,
      });

      setIsSendingComm(false);

      if (res.success) {
        setNotice({
          type: 'success',
          text: commSendAll
            ? 'संदेश सभी उपयोगकर्ताओं को सफलतापूर्वक प्रसारित कर दिया गया।'
            : 'विशिष्ट उपयोगकर्ता को संदेश सफलतापूर्वक भेज दिया गया।',
        });
        setCommText('');
        setCommVoiceBlob(null);
        if (commVoiceUrl) URL.revokeObjectURL(commVoiceUrl);
        setCommVoiceUrl(null);
        setShowCommVoiceRecorder(false);
        const updatedComms = await AdminService.getCommunicationsAdmin();
        setCommunicationsList(updatedComms);
      } else {
        setNotice({ type: 'error', text: res.error || 'संदेश भेजने में विफल।' });
      }
    } catch (err) {
      setIsSendingComm(false);
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'त्रुटि हुई।' });
    }
  };

  // Delete a sent communication
  const handleDeleteComm = async (id: string) => {
    if (!window.confirm('क्या आप इस प्रसारित संदेश को हटाना चाहते हैं?')) return;
    const res = await AdminService.deleteCommunication(id);
    if (res.success) {
      setCommunicationsList((prev) => prev.filter((c) => c.id !== id));
      setNotice({ type: 'success', text: 'संदेश हटा दिया गया।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
    }
  };

  // Jump to send message to specific user
  const handleMessageUser = (u: UserProfile) => {
    setActiveSection('communication');
    setCommSendAll(false);
    setCommRecipientId(u.id);
  };

  // Individual Delete - Help Request (Section 1)
  const handleDeleteHelpRequest = async (id: string, voiceStoragePath?: string | null) => {
    if (!window.confirm('क्या आप इस सहायता अनुरोध और उसकी रिकॉर्डिंग को स्थायी रूप से हटाना चाहते हैं?')) {
      return;
    }
    setDeletingRequestId(id);
    const res = await HelpService.deleteHelpRequest(id, voiceStoragePath);
    setDeletingRequestId(null);

    if (res.success) {
      setHelpRequests((prev) => prev.filter((r) => r.id !== id));
      if (playingVoiceId === id) {
        setPlayingVoiceId(null);
        setPlayingVoiceUrl(null);
      }
      setNotice({ type: 'success', text: 'सहायता अनुरोध और वॉयस रिकॉर्डिंग सफलतापूर्वक हटा दी गई।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
    }
  };

  // Individual Delete - Worker Not Found Request (Section 2)
  const handleDeleteWorkerRequest = async (id: string, voiceStoragePath?: string | null) => {
    if (!window.confirm('क्या आप इस सर्विस अनुरोध और उसकी रिकॉर्डिंग को स्थायी रूप से हटाना चाहते हैं?')) {
      return;
    }
    setDeletingRequestId(id);
    const res = await RequestService.deleteWorkerRequest(id, voiceStoragePath);
    setDeletingRequestId(null);

    if (res.success) {
      setWorkerRequests((prev) => prev.filter((r) => r.id !== id));
      if (playingVoiceId === id) {
        setPlayingVoiceId(null);
        setPlayingVoiceUrl(null);
      }
      setNotice({ type: 'success', text: 'सर्विस अनुरोध और वॉयस रिकॉर्डिंग सफलतापूर्वक हटा दी गई।' });
    } else {
      setNotice({ type: 'error', text: res.error || 'हटाने में समस्या आई।' });
    }
  };

  // Clear All - Help Requests (Section 3)
  const handleClearAllHelpRequests = async () => {
    if (
      !window.confirm(
        'क्या आप सभी सहायता अनुरोध और उनकी रिकॉर्डिंग को स्थायी रूप से हटाना चाहते हैं? यह कार्रवाई वापस नहीं की जा सकती।'
      )
    ) {
      return;
    }
    setClearingAllHelp(true);
    const res = await HelpService.clearAllHelpRequests();
    setClearingAllHelp(false);

    if (res.success) {
      setHelpRequests([]);
      setPlayingVoiceId(null);
      setPlayingVoiceUrl(null);
      setNotice({
        type: 'success',
        text: `सभी ${res.deletedCount} सहायता अनुरोध और उनकी रिकॉर्डिंग्स सफलतापूर्वक हटा दी गईं।`,
      });
    } else {
      setNotice({ type: 'error', text: res.error || 'अनुरोध हटाने में विफलता आई।' });
    }
  };

  // Clear All - Worker Requests (Section 4)
  const handleClearAllWorkerRequests = async () => {
    if (
      !window.confirm(
        'क्या आप सभी सर्विस नहीं मिलने के अनुरोध और उनकी रिकॉर्डिंग को स्थायी रूप से हटाना चाहते हैं? यह कार्रवाई वापस नहीं की जा सकती।'
      )
    ) {
      return;
    }
    setClearingAllWorker(true);
    const res = await RequestService.clearAllWorkerRequests();
    setClearingAllWorker(false);

    if (res.success) {
      setWorkerRequests([]);
      setPlayingVoiceId(null);
      setPlayingVoiceUrl(null);
      setNotice({
        type: 'success',
        text: `सभी ${res.deletedCount} सर्विस अनुरोध और उनकी रिकॉर्डिंग्स सफलतापूर्वक हटा दी गईं।`,
      });
    } else {
      setNotice({ type: 'error', text: res.error || 'अनुरोध हटाने में विफलता आई।' });
    }
  };

  // Unauthorized Screen / Admin Login
  if (!isAdmin) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-sm mx-auto">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">एडमिन लॉगिन</h2>
          <p className="text-xs text-slate-500">
            {websiteName} एडमिन पोर्टल तक पहुंचने के लिए केवल अधिकृत एडमिन खाता स्वीकार्य है।
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-3 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                एडमिन मोबाइल नंबर (Admin Mobile Number)
              </label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                required
                value={adminMobile}
                onChange={(e) => setAdminMobile(e.target.value.replace(/[^0-9]/g, ''))}
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
                  setAdminMobile(paste);
                }}
                placeholder="10 अंकों का एडमिन मोबाइल नंबर"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                पासवर्ड (Password)
              </label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="पासवर्ड दर्ज करें"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-teal-700 focus:outline-none"
              />
            </div>

            {adminLoginError && (
              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{adminLoginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={adminLoginLoading}
              className="w-full py-2.5 bg-teal-800 text-white font-bold text-xs rounded-xl hover:bg-teal-900 transition disabled:opacity-50"
            >
              {adminLoginLoading ? 'सत्यापित किया जा रहा है...' : 'एडमिन लॉगिन करें'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Filtered lists
  const filteredUsers = usersList.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.mobile.includes(userSearch)
  );

  const filteredWorkers = workersList.filter(
    (w) =>
      (w.profile?.name && w.profile.name.toLowerCase().includes(workerSearch.toLowerCase())) ||
      (w.category?.name_hi && w.category.name_hi.toLowerCase().includes(workerSearch.toLowerCase())) ||
      (w.about_text && w.about_text.toLowerCase().includes(workerSearch.toLowerCase()))
  );

  return (
    <div className="pb-24 pt-4 px-3 sm:px-4 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center font-bold shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{websiteName} एडमिन पोर्टल</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              लॉगिन: <span className="font-mono text-teal-700 font-semibold">{user?.mobile ? `${user.mobile} (अधिकृत एडमिन)` : 'अधिकृत एडमिन'}</span>
            </p>
          </div>
        </div>
        <span className="text-[11px] bg-teal-50 text-teal-900 font-bold px-3 py-1 rounded-full border border-teal-200 shrink-0">
          प्रमाणित एडमिन (Database Verified)
        </span>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border shadow-2xs ${
            notice.type === 'success'
              ? 'bg-teal-50 text-teal-800 border-teal-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <span className="font-medium leading-relaxed">{notice.text}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap self-end sm:self-center">
            {notice.text.includes('delete_user_by_admin') && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(ACCOUNT_DELETION_MIGRATION_SQL);
                    setNotice({ type: 'success', text: 'डिलीशन SQL कॉपी हो गया! Supabase SQL Editor में Run करें।' });
                  }}
                  className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                >
                  <Copy className="w-3 h-3" />
                  <span>SQL कॉपी करें</span>
                </button>
                <a
                  href={SUPABASE_SQL_EDITOR_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-800 border border-red-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shadow-2xs"
                >
                  <span>SQL Editor</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
            <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer" title="बंद करें">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 9 Locked Admin Sections Navigation with Natural Flex Wrap */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs font-semibold">
        <button
          onClick={() => setActiveSection('website_name')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1.5 ${
            activeSection === 'website_name' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-teal-900 border border-teal-300 hover:bg-teal-50'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-teal-600" />
          <span>वेबसाइट का नाम बदलें (Website Name)</span>
        </button>
        <button
          onClick={() => setActiveSection('website_logo')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1.5 ${
            activeSection === 'website_logo' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-teal-900 border border-teal-300 hover:bg-teal-50'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
          <span>वेबसाइट का लोगो बदलें (Website Logo)</span>
        </button>
        <button
          onClick={() => setActiveSection('users')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'users' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          1. Users ({usersList.length})
        </button>
        <button
          onClick={() => setActiveSection('workers')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'workers' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          2. Service Providers ({workersList.length})
        </button>
        <button
          onClick={() => setActiveSection('certificate_preview')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1.5 ${
            activeSection === 'certificate_preview' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-teal-900 border border-teal-300 hover:bg-teal-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-teal-600" />
          <span>पहचान पत्र (Certificate Preview)</span>
        </button>
        <button
          onClick={() => {
            setActiveSection('requirements');
            loadRequirementsAdmin();
          }}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'requirements' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          3. आवश्यकताएँ ({requirementsList.length})
        </button>
        <button
          onClick={() => setActiveSection('admin_call')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'admin_call' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          4. Admin Call
        </button>
        <button
          onClick={() => setActiveSection('about')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'about' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          5. About {websiteName}
        </button>
        <button
          onClick={() => setActiveSection('categories')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'categories' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          6. Categories ({categoriesList.length})
        </button>
        <button
          onClick={() => setActiveSection('communication')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'communication' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          7. Communication & Requests
        </button>
        <button
          onClick={() => setActiveSection('retention')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'retention' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          8. Chat Retention
        </button>
        <button
          onClick={() => setActiveSection('form_content')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'form_content' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          9. Edit Form Content
        </button>
        <button
          onClick={() => setActiveSection('database_setup')}
          className={`px-3 py-2 rounded-xl transition cursor-pointer shadow-2xs ${
            activeSection === 'database_setup' ? 'bg-teal-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          10. Database & RPCs
        </button>
      </div>

      {/* SECTION: WEBSITE NAME (वेबसाइट का नाम बदलें) */}
      {activeSection === 'website_name' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 max-w-2xl shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-50 text-teal-800">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  वेबसाइट का नाम बदलें (Change Website Name)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  पूरी वेबसाइट, हेडर, मेन्यू, शेयर कार्ड्स, क्यूआर कोड और इमेज बैज में प्रदर्शित होने वाला ब्रांड नाम सेट करें।
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* English Website Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                English Website Name <span className="text-teal-700">*</span>
              </label>
              <input
                type="text"
                value={siteNameEn}
                onChange={(e) => setSiteNameEn(e.target.value)}
                placeholder="उदा. Talent या Kaam Mitra"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-teal-700 bg-white font-medium"
              />
              <p className="text-[11px] text-slate-400">
                Default: <span className="font-semibold text-slate-600">Kaam Mitra</span> (Used in English interface, downloadable QR image names, badge footer)
              </p>
            </div>

            {/* Hindi Website Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Hindi Website Name (हिंदी नाम) <span className="text-teal-700">*</span>
              </label>
              <input
                type="text"
                value={siteNameHi}
                onChange={(e) => setSiteNameHi(e.target.value)}
                placeholder="उदा. टैलेंट या काम मित्र"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-teal-700 bg-white font-medium"
              />
              <p className="text-[11px] text-slate-400">
                Default: <span className="font-semibold text-slate-600">काम मित्र</span> (Used in Hindi interface, QR card header, greeting, share text)
              </p>
            </div>

            {/* Website Share URL (वेबसाइट शेयर URL) */}
            <div className="space-y-1.5 sm:col-span-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700">
                Website Share URL (वेबसाइट शेयर URL)
              </label>
              <input
                type="url"
                value={siteShareUrl}
                onChange={(e) => setSiteShareUrl(e.target.value)}
                placeholder="उदा. https://mywebsite.com या https://example.com"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-teal-700 bg-white font-medium"
              />
              <p className="text-[11px] text-slate-400">
                जब उपयोगकर्ता 'Share Website' पर क्लिक करेंगे तो यही URL शेयर होगा। खाली रहने पर वर्तमान डोमेन (<span className="font-mono text-slate-600">{typeof window !== 'undefined' ? window.location.origin : ''}</span>) उपयोग होगा।
              </p>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>लाइव पूर्वावलोकन (Live Preview)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Header & Menu (Hindi):</span>
                <span className="font-bold text-teal-800 text-sm mt-0.5 block">
                  {siteNameHi.trim() || DEFAULT_BRANDING.name_hi}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Header & Menu (English):</span>
                <span className="font-bold text-teal-800 text-sm mt-0.5 block">
                  {siteNameEn.trim() || DEFAULT_BRANDING.name_en}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">QR Code & Card Header:</span>
                <span className="font-bold text-slate-800 mt-0.5 block">
                  {siteNameHi.trim() || DEFAULT_BRANDING.name_hi} — {siteNameEn.trim() || DEFAULT_BRANDING.name_en}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Official Support / Chat:</span>
                <span className="font-bold text-slate-800 mt-0.5 block">
                  {siteNameHi.trim() || DEFAULT_BRANDING.name_hi} एडमिन
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs sm:col-span-2">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Active Share Website URL:</span>
                <span className="font-bold text-teal-800 text-sm mt-0.5 block break-all font-mono">
                  {siteShareUrl.trim() || (typeof window !== 'undefined' ? window.location.origin : 'https://...')}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveWebsiteName}
              disabled={isSavingBranding}
              className="px-6 py-2.5 bg-teal-800 hover:bg-teal-900 active:scale-98 text-white font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingBranding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              <span>सहेजें (Save Website Name)</span>
            </button>

            <button
              type="button"
              onClick={handleResetWebsiteName}
              disabled={isSavingBranding}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition cursor-pointer disabled:opacity-50"
            >
              डिफ़ॉल्ट नाम बहाल करें (Reset to Default)
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('website_logo')}
              className="px-4 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-xs rounded-xl border border-teal-200 transition cursor-pointer flex items-center gap-1.5 ml-auto"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>वेबसाइट का लोगो बदलें (Change Logo)</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION: WEBSITE LOGO (वेबसाइट का लोगो बदलें) */}
      {activeSection === 'website_logo' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 max-w-2xl shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-50 text-teal-800">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  वेबसाइट का लोगो बदलें (Change Website Logo)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  पूरी वेबसाइट (Header, Sidebar/मेन्यू, QR कोड और पहचान पत्र/सर्टिफिकेट) में प्रदर्शित होने वाला ब्रांड लोगो प्रबंधित करें।
                </p>
              </div>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={logoInputRef}
            accept="image/*"
            onChange={handleSelectLogoFile}
            className="hidden"
          />

          {/* Current & New Logo Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Currently Active Logo */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                वर्तमान में सक्रिय लोगो (Current Logo)
              </span>
              <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200 flex items-center justify-center p-2 shadow-2xs overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Active Logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full rounded-xl bg-teal-800 flex items-center justify-center p-2 shadow-2xs">
                    <TalentBrandLogo size={48} />
                  </div>
                )}
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                logoUrl ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {logoUrl ? 'कस्टम लोगो सक्रिय' : 'डिफ़ॉल्ट लोगो सक्रिय'}
              </span>
            </div>

            {/* 2. New Logo Upload / Preview */}
            <div className="p-4 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/30 flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">
                {pendingLogoPreview ? 'क्रॉप किया गया नया लोगो (New Logo)' : 'नया लोगो अपलोड करें'}
              </span>

              {pendingLogoPreview ? (
                <div className="w-24 h-24 rounded-2xl bg-white border-2 border-teal-600 flex items-center justify-center p-2 shadow-sm overflow-hidden animate-in zoom-in-95">
                  <img
                    src={pendingLogoPreview}
                    alt="New Logo Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-white border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 p-2">
                  <Upload className="w-6 h-6 text-teal-600 mb-1" />
                  <span className="text-[10px] text-slate-500 font-medium">फ़ोटो चुनें</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="w-full py-2 px-3 bg-white border border-teal-600 hover:bg-teal-50 text-teal-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>{pendingLogoPreview ? 'दूसरी फ़ोटो चुनें व क्रॉप करें' : 'फ़ोटो चुनें व क्रॉप करें'}</span>
                </button>
                <p className="text-[10px] text-slate-500">
                  फ़ोटो चुनने के बाद आप इसे ज़ूम (Zoom), घुमा और रीपोजिशन कर सकते हैं।
                </p>
              </div>
            </div>
          </div>

          {/* Live Preview across UI contexts */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>लाइव पूर्वावलोकन (Live Context Preview)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* Header Preview */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">1. हेडर (Header):</span>
                <div className="h-10 bg-[#fff4e9] rounded-lg border border-slate-200 px-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 text-slate-700 flex flex-col justify-center gap-0.5">
                      <span className="h-0.5 bg-slate-700 rounded-full w-full" />
                      <span className="h-0.5 bg-slate-700 rounded-full w-full" />
                      <span className="h-0.5 bg-slate-700 rounded-full w-full" />
                    </div>
                    <div className="w-6 h-6 rounded-md bg-teal-800 flex items-center justify-center p-0.5 overflow-hidden">
                      {pendingLogoPreview ? (
                        <img src={pendingLogoPreview} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <TalentBrandLogo size={18} logoUrl={logoUrl} />
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-800 truncate">नमस्ते, उपयोगकर्ता</span>
                </div>
              </div>

              {/* Sidebar Preview */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">2. साइडबार (Sidebar):</span>
                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-800 flex items-center justify-center p-0.5 overflow-hidden">
                    {pendingLogoPreview ? (
                      <img src={pendingLogoPreview} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <TalentBrandLogo size={20} logoUrl={logoUrl} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-teal-800 block truncate leading-tight">
                      {siteNameHi || DEFAULT_BRANDING.name_hi}
                    </span>
                    <span className="text-[9px] text-slate-400 block truncate">मेन्यू हैडर</span>
                  </div>
                </div>
              </div>

              {/* Certificate Badge Preview */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">3. पहचान पत्र / QR बैज:</span>
                <div className="h-10 bg-gradient-to-r from-[#094838] to-[#083a2d] rounded-lg px-2 flex items-center justify-center gap-1.5 text-white">
                  <div className="w-6 h-6 flex items-center justify-center overflow-hidden">
                    {pendingLogoPreview ? (
                      <img src={pendingLogoPreview} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <TalentBrandLogo size={20} logoUrl={logoUrl} />
                    )}
                  </div>
                  <span className="text-[10px] font-bold truncate">
                    {siteNameEn || DEFAULT_BRANDING.name_en}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveWebsiteLogo}
              disabled={isSavingLogo || !pendingLogoBlob}
              className="px-6 py-2.5 bg-teal-800 hover:bg-teal-900 active:scale-98 text-white font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              <span>लोगो सहेजें (Save Website Logo)</span>
            </button>

            {pendingLogoPreview && (
              <button
                type="button"
                onClick={() => {
                  setPendingLogoBlob(null);
                  setPendingLogoPreview(null);
                }}
                disabled={isSavingLogo}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition cursor-pointer disabled:opacity-50"
              >
                रद्द करें (Cancel)
              </button>
            )}

            <button
              type="button"
              onClick={handleResetWebsiteLogo}
              disabled={isSavingLogo}
              className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-xs rounded-xl border border-rose-200 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>डिफ़ॉल्ट लोगो बहाल करें (Reset Logo)</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1: USERS */}
      {activeSection === 'users' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">पंजीकृत उपयोगकर्ता (Users)</h3>
              <p className="text-xs text-slate-500 mt-0.5">कुल पंजीकृत उपयोगकर्ता: {usersList.length}</p>
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="यूज़र खोजें..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-slate-50/50"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-500 font-semibold">
                <tr>
                  <th className="p-3">यूज़र</th>
                  <th className="p-3">मोबाइल</th>
                  <th className="p-3">पता</th>
                  <th className="p-3">शामिल होने की तिथि</th>
                  <th className="p-3 text-right">कार्रवाई</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      कोई उपयोगकर्ता नहीं मिला।
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <React.Fragment key={u.id}>
                      <tr className="hover:bg-slate-50 transition">
                        <td className="p-3 flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-teal-50 border border-slate-200 text-teal-800 font-bold flex items-center justify-center shrink-0 shadow-2xs">
                            {u.profile_photo ? (
                              <img
                                src={u.profile_photo}
                                alt={u.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span>{(u.name.trim().charAt(0) || 'U').toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block leading-tight">{u.name}</span>
                            {u.id === user?.id && (
                              <span className="text-[10px] text-teal-700 font-bold">आप (Current Admin)</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-700">{u.mobile}</td>
                        <td className="p-3 text-slate-500 truncate max-w-[140px]">{u.address || '—'}</td>
                        <td className="p-3 text-slate-400">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
                            >
                              {expandedUserId === u.id ? 'कम विवरण' : 'पूरा विवरण'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMessageUser(u)}
                              className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-[11px] font-medium transition cursor-pointer"
                            >
                              संदेश भेजें
                            </button>
                            {u.id !== user?.id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUserClick(u)}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-medium transition cursor-pointer"
                              >
                                यूज़र हटाएं
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedUserId === u.id && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={5} className="p-4 text-xs border-b border-slate-200/80">
                            <div className="flex flex-col sm:flex-row items-start gap-4">
                              {u.profile_photo && (
                                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-white shadow-2xs">
                                  <img
                                    src={u.profile_photo}
                                    alt={u.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-700 flex-1">
                                <div>
                                  <span className="font-semibold text-slate-900">पूरा नाम: </span>
                                  <span>{u.name}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900">मोबाइल नंबर: </span>
                                  <span className="font-mono">{u.mobile}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900">पंजीकरण तिथि: </span>
                                  <span>{new Date(u.created_at).toLocaleString()}</span>
                                </div>
                                <div className="sm:col-span-2">
                                  <span className="font-semibold text-slate-900">पता / स्थान: </span>
                                  <span className="whitespace-normal break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                    {u.location
                                      ? LocationService.formatWorkerCard(u.location, '', lang) || u.address || (lang === 'hi' ? 'उपलब्ध नहीं' : 'Not available')
                                      : u.address || (lang === 'hi' ? 'उपलब्ध नहीं' : 'Not available')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: WORKERS */}
      {activeSection === 'workers' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">पंजीकृत सेवा प्रदाता (Service Providers)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                प्राथमिकता अंक (1-100) केवल एडमिन के लिए हैं। सामान्य खोज में सर्वोच्च अंक पहले दिखते हैं। (कुल: {workersList.length})
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
                placeholder="सर्विस या सेवा प्रदाता खोजें..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-slate-50/50"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-500 font-semibold">
                <tr>
                  <th className="p-3">सेवा प्रदाता</th>
                  <th className="p-3">स्थिति</th>
                  <th className="p-3">श्रेणी</th>
                  <th className="p-3">दर (मूल्य)</th>
                  <th className="p-3">अनुभव</th>
                  <th className="p-3">Priority Points (1-100)</th>
                  <th className="p-3 text-right">कार्रवाई</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      कोई सेवा प्रदाता नहीं मिला।
                    </td>
                  </tr>
                ) : (
                  filteredWorkers.map((w) => (
                    <React.Fragment key={w.user_id}>
                      <tr className="hover:bg-slate-50 transition">
                        <td className="p-3 flex items-center gap-2.5 font-semibold text-slate-900">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-teal-50 border border-slate-200 text-teal-800 font-bold flex items-center justify-center shrink-0 shadow-2xs">
                            {(w.profile?.profile_photo || (w as any).profile_photo) ? (
                              <img
                                src={w.profile?.profile_photo || (w as any).profile_photo}
                                alt={w.profile?.name || 'सेवा प्रदाता'}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span>{(w.profile?.name || 'स').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <span>{w.profile?.name || 'सेवा प्रदाता'}</span>
                        </td>
                        <td className="p-3">
                          {w.is_active !== false ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                              सक्रिय (Active)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              निष्क्रिय (Deactivated)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-teal-800 font-medium">
                          {w.category?.name_hi || w.other_category || 'अन्य'}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          ₹{w.price_per_day} / {getPriceUnitLabel(w.price_unit, w.custom_price_unit, 'hi')}
                        </td>
                        <td className="p-3 text-slate-700">{w.experience_years} वर्ष</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={w.priority_points}
                              onChange={(e) => handleUpdatePriority(w.user_id, Number(e.target.value))}
                              className="w-16 px-2 py-1 border border-slate-300 rounded-lg font-bold text-center focus:outline-none focus:border-teal-700 bg-white"
                            />
                            <span className="text-[10px] text-slate-400">/ 100</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedWorkerId(expandedWorkerId === w.user_id ? null : w.user_id)
                              }
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
                            >
                              {expandedWorkerId === w.user_id ? 'कम विवरण' : 'पूरा विवरण'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectCertWorker(w.user_id);
                                setActiveSection('certificate_preview');
                              }}
                              className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            >
                              पहचान पत्र (Certificate)
                            </button>
                            {/* Feature 1: Admin Activate / Deactivate control for Service Providers */}
                            {w.user_id !== '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72' && (
                              <button
                                type="button"
                                onClick={() => handleToggleWorkerActivation(w.user_id, w.is_active !== false)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                                  w.is_active !== false
                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                }`}
                              >
                                {w.is_active !== false ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteWorkerClick(w)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-medium transition cursor-pointer"
                            >
                              सेवा प्रदाता हटाएं
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedWorkerId === w.user_id && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={7} className="p-4 text-xs border-b border-slate-200/80">
                            <div className="flex flex-col sm:flex-row items-start gap-4">
                              {(w.profile?.profile_photo || (w as any).profile_photo) && (
                                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-white shadow-2xs">
                                  <img
                                    src={w.profile?.profile_photo || (w as any).profile_photo}
                                    alt={w.profile?.name || 'सेवा प्रदाता'}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-700">
                                <div>
                                  <span className="font-semibold text-slate-900">संपर्क नंबर: </span>
                                  <span className="font-mono">{w.profile?.mobile || 'उपलब्ध नहीं'}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900">स्थान: </span>
                                  <span className="whitespace-normal break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                    {w.location
                                      ? LocationService.formatWorkerCard(w.location, '', lang) || (lang === 'hi' ? 'उपलब्ध नहीं' : 'Not available')
                                      : (lang === 'hi' ? 'उपलब्ध नहीं' : 'Not available')}
                                  </span>
                                </div>
                                <div className="sm:col-span-2">
                                  <span className="font-semibold text-slate-900">विवरण / परिचय: </span>
                                  <span>{w.about_text || 'उपलब्ध नहीं'}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION: DYNAMIC CERTIFICATE PREVIEW & DOWNLOAD (ONE SHARED SOURCE OF TRUTH) */}
      {activeSection === 'certificate_preview' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-6 shadow-xs">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  डिजिटल पहचान पत्र लाइव पूर्वावलोकन (Certificate Live Preview & Download)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                किसी भी सेवा प्रदाता का आधिकारिक डिजिटल पहचान पत्र देखें, आवश्यकतानुसार अस्थायी बदलाव करें और उच्च-गुणवत्ता (High-Res) PNG में डाउनलोड करें।
              </p>
            </div>

            {/* Quick Action Download Button */}
            {adminCertData && (
              <button
                type="button"
                onClick={handleAdminDownloadCert}
                disabled={isDownloadingAdminCert}
                className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Download className={`w-4 h-4 ${isDownloadingAdminCert ? 'animate-bounce' : ''}`} />
                <span>
                  {isDownloadingAdminCert ? 'डाउनलोड हो रहा है...' : 'पहचान पत्र डाउनलोड करें (Download PNG)'}
                </span>
              </button>
            )}
          </div>

          {/* Worker Selector Dropdown */}
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-4 space-y-2">
            <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wide">
              सेवा प्रदाता चुनें (Select Worker to Preview)
            </label>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <select
                value={selectedCertWorkerId}
                onChange={(e) => handleSelectCertWorker(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {workersList.map((w) => {
                  const wName = w.profile?.name || 'सेवा प्रदाता';
                  const wService = w.category?.name_hi || w.other_category || 'कुशल कारीगर';
                  const wMobile = w.profile?.mobile ? ` • ${w.profile.mobile}` : '';
                  return (
                    <option key={w.user_id} value={w.user_id}>
                      {wName} — {wService}{wMobile}
                    </option>
                  );
                })}
              </select>

              <div className="text-xs text-emerald-800 font-medium px-2 shrink-0">
                कुल पंजीकृत सेवा प्रदाता: <span className="font-bold">{workersList.length}</span>
              </div>
            </div>
          </div>

          {/* Main Layout: 2 Columns (Left: Live Editor Controls, Right: ONE Live Certificate Preview) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Live Editable Fields (5 cols) */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-sm">
                  <Edit3 className="w-4 h-4 text-teal-700" />
                  <span>प्रमाणपत्र संपादन (Live Certificate Editor)</span>
                </div>
                {Object.keys(certOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCertOverrides({})}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold underline cursor-pointer"
                  >
                    मूल डेटा पर लौटें (Reset)
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                यहां किए गए संपादन तुरंत दाईं ओर के पूर्वावलोकन और डाउनलोड में दिखाई देंगे। ये बदलाव डेटाबेस में सहेजे नहीं जाते।
              </p>

              {adminCertData && (
                <div className="space-y-3.5 text-xs">
                  {/* Worker Name */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      कार्यकर्ता का नाम (Worker Name)
                    </label>
                    <input
                      type="text"
                      value={adminCertData.name}
                      onChange={(e) =>
                        setCertOverrides((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="उदा. Ramesh Kumar"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>

                  {/* Service / Profession */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      सेवा / व्यवसाय (Service / Profession)
                    </label>
                    <input
                      type="text"
                      value={adminCertData.serviceType}
                      onChange={(e) =>
                        setCertOverrides((prev) => ({ ...prev, serviceType: e.target.value }))
                      }
                      placeholder="उदा. Electrician"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                    <span className="text-[10px] text-pink-700 mt-0.5 block">
                      यह गुलाबी गोली (Pink Pill) में बिना टिक मार्क के बड़े अक्षरों में प्रदर्शित होता है।
                    </span>
                  </div>

                  {/* Experience */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      अनुभव (Experience Text)
                    </label>
                    <input
                      type="text"
                      value={adminCertData.experienceText}
                      onChange={(e) =>
                        setCertOverrides((prev) => ({ ...prev, experienceText: e.target.value }))
                      }
                      placeholder="उदा. 4 वर्ष"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>

                  {/* Location / Address */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      स्थान / पता (Location / Address)
                    </label>
                    <textarea
                      rows={2}
                      value={adminCertData.locationText}
                      onChange={(e) =>
                        setCertOverrides((prev) => ({ ...prev, locationText: e.target.value }))
                      }
                      placeholder="उदा. गाँव: लड़भड़ोल, तहसील: लड़भड़ोल..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>

                  {/* Rate */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      दर / मूल्य (Rate / Price)
                    </label>
                    <input
                      type="text"
                      value={adminCertData.rateText}
                      onChange={(e) =>
                        setCertOverrides((prev) => ({ ...prev, rateText: e.target.value }))
                      }
                      placeholder="उदा. ₹750 / प्रति दिन"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>

                  {/* Verification Status Toggle */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 block">सत्यापित बैज (Verification Badge)</span>
                      <span className="text-[10px] text-slate-500">नाम के ठीक बगल में मूल सत्यापन बैज दिखाएं</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCertOverrides((prev) => ({
                          ...prev,
                          isVerified: prev.isVerified !== undefined ? !prev.isVerified : !adminCertData.isVerified,
                        }))
                      }
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                        adminCertData.isVerified
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-300 text-slate-700'
                      }`}
                    >
                      {adminCertData.isVerified ? 'सत्यापित (ON)' : 'असामान्य (OFF)'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: ONE Dynamic Live Certificate Preview (7 cols) */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="w-full max-w-md bg-slate-100 p-2 sm:p-4 rounded-3xl border border-slate-200 shadow-inner">
                {adminCertData ? (
                  <WorkerCertificateCard data={adminCertData} />
                ) : (
                  <div className="p-12 text-center text-slate-400">
                    कोई सेवा प्रदाता उपलब्ध नहीं है।
                  </div>
                )}
              </div>

              {/* Download button underneath preview for mobile convenience */}
              {adminCertData && (
                <div className="mt-4 w-full max-w-md">
                  <button
                    type="button"
                    onClick={handleAdminDownloadCert}
                    disabled={isDownloadingAdminCert}
                    className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Download className={`w-4 h-4 ${isDownloadingAdminCert ? 'animate-bounce' : ''}`} />
                    <span>
                      {isDownloadingAdminCert ? 'डाउनलोड हो रहा है...' : 'यह पहचान पत्र डाउनलोड करें (Download PNG)'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: ADMIN CALL */}
      {activeSection === 'admin_call' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 max-w-xl shadow-xs">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">3. Admin Call सेटिंग्स</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Get Help पृष्ठ पर प्रदर्शित होने वाला एडमिन संपर्क नंबर और कॉल सुविधा।
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">कॉल सुविधा चालू / बंद (ON/OFF)</span>
              <span className="text-[11px] text-slate-500">उपयोगकर्ताओं को ऐप से सीधे एडमिन को कॉल करने की अनुमति दें।</span>
            </div>
            <button
              type="button"
              onClick={() => setCallEnabled(!callEnabled)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs ${
                callEnabled ? 'bg-teal-700 text-white' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {callEnabled ? 'चालू (ON)' : 'बंद (OFF)'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              एडमिन हेल्पलाइन नंबर
            </label>
            <input
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:border-teal-700 bg-white"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs"
          >
            सहेजें (Save Call Settings)
          </button>
        </div>
      )}

      {/* SECTION 5: ABOUT */}
      {activeSection === 'about' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 max-w-xl shadow-xs">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">5. About {websiteName} सामग्री</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ऐप में प्रदर्शित {websiteName} का परिचय और विवरण।
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">हिंदी में (Hindi)</label>
            <textarea
              value={aboutHi}
              onChange={(e) => setAboutHi(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">अंग्रेज़ी में (English)</label>
            <textarea
              value={aboutEn}
              onChange={(e) => setAboutEn(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-white"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs"
          >
            सहेजें (Save About)
          </button>
        </div>
      )}

      {/* SECTION 5: CATEGORIES */}
      {activeSection === 'categories' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">5. Service Categories</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              एडमिन-प्रबंधित श्रेणियां। प्रत्येक सेवा प्रदाता केवल 1 मुख्य श्रेणी चुन सकता है। (कुल: {categoriesList.length})
            </p>
          </div>

          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <input
              type="text"
              value={newCatHi}
              onChange={(e) => setNewCatHi(e.target.value)}
              placeholder="श्रेणी नाम (हिंदी)"
              required
              className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:border-teal-700"
            />
            <input
              type="text"
              value={newCatEn}
              onChange={(e) => setNewCatEn(e.target.value)}
              placeholder="Category Name (English)"
              required
              className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:border-teal-700"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>श्रेणी जोड़ें</span>
            </button>
          </form>

          {/* Categories List */}
          <div className="divide-y divide-slate-100">
            {categoriesList.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                कोई श्रेणी नहीं है। कृपया ऊपर से नई श्रेणी जोड़ें।
              </p>
            ) : (
              categoriesList.map((cat) => (
                <div key={cat.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  {editingCategoryId === cat.id ? (
                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={editCatHi}
                        onChange={(e) => setEditCatHi(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        value={editCatEn}
                        onChange={(e) => setEditCatEn(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveEditCategory(cat.id)}
                          className="px-3 py-1.5 bg-teal-800 text-white rounded-lg text-xs font-semibold hover:bg-teal-900 cursor-pointer shadow-2xs"
                        >
                          सहेजें
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(null)}
                          className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-300 cursor-pointer"
                        >
                          रद्द करें
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="font-bold text-slate-900 block leading-tight">{cat.name_hi}</span>
                      <span className="text-slate-400 text-[11px]">{cat.name_en}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.id, cat.is_active)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                        cat.is_active ? 'bg-teal-50 text-teal-800 border-teal-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {cat.is_active ? 'सक्रिय' : 'निष्क्रिय'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditCategory(cat)}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                      title="संपादित करें"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition cursor-pointer"
                      title="हटाएं"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 6: COMMUNICATION & REQUESTS */}
      {activeSection === 'communication' && (
        <div className="space-y-4">
          {/* Send Broadcast / Direct Message */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                6. सूचना / संदेश प्रसारण (Admin Broadcast & Direct)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                सभी पंजीकृत उपयोगकर्ताओं या किसी विशिष्ट व्यक्ति को सीधे संदेश व आवाज संदेश भेजें।
              </p>
            </div>
            <form onSubmit={handleSendComm} className="space-y-3.5 text-xs">
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="radio"
                    checked={commSendAll}
                    onChange={() => setCommSendAll(true)}
                    className="accent-teal-700"
                  />
                  <span>सभी को भेजें (Send to All)</span>
                </label>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="radio"
                    checked={!commSendAll}
                    onChange={() => setCommSendAll(false)}
                    className="accent-teal-700"
                  />
                  <span>विशिष्ट व्यक्ति को (Specific Person)</span>
                </label>
              </div>

              {!commSendAll && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">यूज़र चुनें</label>
                  <select
                    value={commRecipientId}
                    onChange={(e) => setCommRecipientId(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-teal-700"
                  >
                    <option value="">उपयोगकर्ता चुनें</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.mobile})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">संदेश सामग्री (Message Text)</label>
                <textarea
                  value={commText}
                  onChange={(e) => setCommText(e.target.value)}
                  rows={3}
                  placeholder="संदेश लिखें (वैकल्पिक यदि केवल आवाज संदेश भेजा जा रहा है)..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-teal-700 bg-white"
                />
              </div>

              {/* Voice Recording Control (Point 4) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">आवाज संदेश (Voice Recording)</span>
                  <button
                    type="button"
                    onClick={() => setShowCommVoiceRecorder(!showCommVoiceRecorder)}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl border border-teal-700 text-teal-800 hover:bg-teal-50 text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    <Mic className="w-4 h-4 text-teal-700" />
                    <span>{commVoiceBlob ? 'आवाज बदलें / पुनः रिकॉर्ड करें' : 'आवाज संदेश जोड़ें'}</span>
                  </button>
                </div>

                {showCommVoiceRecorder && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <VoiceRecorder
                      onRecordingChange={(blob) => {
                        setCommVoiceBlob(blob);
                        if (blob) {
                          setCommVoiceUrl(URL.createObjectURL(blob));
                        }
                      }}
                      onCancel={() => setShowCommVoiceRecorder(false)}
                      title="एडमिन आवाज संदेश"
                      subtitle="माइक पर टैप करके संदेश रिकॉर्ड करें"
                      saveLabel="रिकॉर्डिंग रखें"
                    />
                  </div>
                )}

                {commVoiceUrl && !showCommVoiceRecorder && (
                  <div className="p-3.5 bg-teal-50/80 border border-teal-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-teal-900">
                      <span className="flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-teal-700" />
                        <span>संलग्न आवाज संदेश (Voice Attached)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCommVoiceBlob(null);
                          if (commVoiceUrl) URL.revokeObjectURL(commVoiceUrl);
                          setCommVoiceUrl(null);
                        }}
                        className="text-red-600 hover:underline text-[11px] font-semibold cursor-pointer"
                      >
                        हटाएं (Remove)
                      </button>
                    </div>
                    <AudioPlayer src={commVoiceUrl} title="एडमिन आवाज संदेश" />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSendingComm}
                className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white font-bold rounded-xl flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingComm ? 'भेजा जा रहा है...' : commSendAll ? 'सभी को प्रसारित करें' : 'विशिष्ट व्यक्ति को भेजें'}</span>
              </button>
            </form>
          </div>

          {/* Sent Communications History */}
          {communicationsList.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                भेजे गए संदेश (Broadcast History) ({communicationsList.length})
              </h3>
              <div className="space-y-2">
                {communicationsList.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs flex items-start justify-between gap-2.5">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">
                          {c.send_to_all ? 'सभी उपयोगकर्ताओं को' : 'विशिष्ट उपयोगकर्ता'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                      </div>
                      {c.message_text && <p className="text-slate-700 leading-relaxed">{c.message_text}</p>}
                      {c.media_url && (
                        <div className="pt-1.5 max-w-sm">
                          <AudioPlayer src={c.media_url} title="एडमिन का आवाज संदेश" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteComm(c.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition cursor-pointer"
                      title="हटाएं"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incoming Help Requests */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  आए हुए सहायता अनुरोध (Help Requests) ({helpRequests.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  उपयोगकर्ताओं द्वारा भेजे गए वॉयस एवं सामान्य सहायता अनुरोध।
                </p>
              </div>
              {helpRequests.length > 0 && (
                <button
                  type="button"
                  disabled={clearingAllHelp || Boolean(deletingRequestId)}
                  onClick={handleClearAllHelpRequests}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shrink-0 self-start sm:self-auto cursor-pointer shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{clearingAllHelp ? 'हटाया जा रहा है...' : 'सभी सहायता अनुरोध हटाएँ'}</span>
                </button>
              )}
            </div>

            {helpRequests.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">कोई सहायता अनुरोध नहीं है।</p>
            ) : (
              <div className="space-y-2.5">
                {helpRequests.map((hr) => {
                  const linkedUser = hr.user_id ? usersList.find((u) => u.id === hr.user_id) : null;
                  return (
                    <div key={hr.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">
                            {linkedUser ? `${linkedUser.name} (${linkedUser.mobile})` : hr.name || 'सहायता अनुरोध (Voice)'}
                          </span>
                          {linkedUser ? (
                            <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium">
                              पंजीकृत यूज़र
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                              अतिथि (Guest)
                            </span>
                          )}
                        </div>
                        {linkedUser?.mobile || hr.mobile ? (
                          <a href={`tel:${linkedUser?.mobile || hr.mobile}`} className="font-mono text-teal-700 font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50">
                            📞 {linkedUser?.mobile || hr.mobile}
                          </a>
                        ) : (
                          <span className="text-[11px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                            वॉयस अनुरोध
                          </span>
                        )}
                      </div>
                      {hr.description && <p className="text-slate-600 leading-relaxed">{hr.description}</p>}
                      {hr.voice_storage_path && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleToggleVoice(hr.id, hr.voice_storage_path!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs font-semibold border border-teal-200 transition cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                            <span>{playingVoiceId === hr.id ? 'ऑडियो बंद करें' : 'आवाज सुनें (Play Audio)'}</span>
                          </button>
                          {playingVoiceId === hr.id && playingVoiceUrl && (
                            <div className="mt-2">
                              <audio controls autoPlay src={playingVoiceUrl} className="w-full h-8" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] text-slate-400">
                          {new Date(hr.created_at).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          disabled={deletingRequestId === hr.id || clearingAllHelp}
                          onClick={() => handleDeleteHelpRequest(hr.id, hr.voice_storage_path)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                          title="स्थायी रूप से हटाएं"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{deletingRequestId === hr.id ? 'हटाया जा रहा है...' : 'हटाएं (Delete)'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Incoming Worker Requests */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  सर्विस नहीं मिलने के अनुरोध (Service Not Found Requests) ({workerRequests.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  उपयोगकर्ताओं द्वारा भेजे गए सर्विस आवश्यकता संबंधी वॉयस अनुरोध।
                </p>
              </div>
              {workerRequests.length > 0 && (
                <button
                  type="button"
                  disabled={clearingAllWorker || Boolean(deletingRequestId)}
                  onClick={handleClearAllWorkerRequests}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shrink-0 self-start sm:self-auto cursor-pointer shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{clearingAllWorker ? 'हटाया जा रहा है...' : 'सभी सर्विस अनुरोध हटाएँ'}</span>
                </button>
              )}
            </div>

            {workerRequests.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">कोई अनुरोध नहीं है।</p>
            ) : (
              <div className="space-y-2.5">
                {workerRequests.map((wr) => {
                  const linkedUser = wr.user_id ? usersList.find((u) => u.id === wr.user_id) : null;
                  return (
                    <div key={wr.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">
                            {linkedUser ? `${linkedUser.name} (${linkedUser.mobile})` : wr.name || 'सर्विस अनुरोध (Voice)'}
                          </span>
                          {linkedUser ? (
                            <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium">
                              पंजीकृत यूज़र
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                              अतिथि (Guest)
                            </span>
                          )}
                        </div>
                        {linkedUser?.mobile || wr.mobile ? (
                          <a href={`tel:${linkedUser?.mobile || wr.mobile}`} className="font-mono text-teal-700 font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50">
                            📞 {linkedUser?.mobile || wr.mobile}
                          </a>
                        ) : (
                          <span className="text-[11px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                            वॉयस अनुरोध
                          </span>
                        )}
                      </div>
                      {(wr.category?.name_hi || wr.other_category) && (
                        <p className="text-slate-700 font-medium">
                          मांग: {wr.category?.name_hi || wr.other_category}
                        </p>
                      )}
                      {wr.description && <p className="text-slate-500 italic leading-relaxed">{wr.description}</p>}
                      {wr.voice_storage_path && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleToggleVoice(wr.id, wr.voice_storage_path!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs font-semibold border border-teal-200 transition cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                            <span>{playingVoiceId === wr.id ? 'ऑडियो बंद करें' : 'आवाज सुनें (Play Audio)'}</span>
                          </button>
                          {playingVoiceId === wr.id && playingVoiceUrl && (
                            <div className="mt-2">
                              <audio controls autoPlay src={playingVoiceUrl} className="w-full h-8" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] text-slate-400">
                          {new Date(wr.created_at).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          disabled={deletingRequestId === wr.id || clearingAllWorker}
                          onClick={() => handleDeleteWorkerRequest(wr.id, wr.voice_storage_path)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                          title="स्थायी रूप से हटाएं"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{deletingRequestId === wr.id ? 'हटाया जा रहा है...' : 'हटाएं (Delete)'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 7: CHAT RETENTION */}
      {activeSection === 'retention' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 max-w-md shadow-xs">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">7. Chat Retention (दिनों में)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              चैट और संदेशों को स्वचालित रूप से कितने दिनों बाद हटाया जाना चाहिए।
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">दिनों की संख्या (Days)</label>
            <input
              type="number"
              min="1"
              max="365"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSaveSettings}
              className="px-5 py-2.5 bg-teal-800 text-white font-bold text-xs rounded-xl hover:bg-teal-900 transition cursor-pointer shadow-2xs"
            >
              सहेजें (Save Retention)
            </button>
            <button
              type="button"
              disabled={cleaningRetention}
              onClick={handleApplyRetentionNow}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              {cleaningRetention ? 'साफ़ किया जा रहा है...' : 'अभी चैट साफ़ करें'}
            </button>
          </div>
        </div>
      )}

      {/* SECTION 8: EDIT FORM CONTENT */}
      {activeSection === 'form_content' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 max-w-xl shadow-xs">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">8. Edit Form Content</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              होम पेज तथा फॉर्म्स में प्रयुक्त पाठ्य सामग्री संपादित करें।
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              होम स्वागत संदेश (हिंदी) — Home Welcome Hindi
            </label>
            <input
              type="text"
              value={welcomeHi}
              onChange={(e) => setWelcomeHi(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              Home Welcome English
            </label>
            <input
              type="text"
              value={welcomeEn}
              onChange={(e) => setWelcomeEn(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-white"
            />
          </div>

          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold">
              <Info className="w-4 h-4 text-amber-700" />
              <span>वॉयस-ओनली फॉर्म शीर्षक (Locked Voice-Only Headings):</span>
            </div>
            <p className="leading-relaxed">
              • सर्विस की ज़रूरत: <span className="font-semibold font-sans">"आप हमें बोलकर बताएं कि किस प्रकार की सर्विस या सेवा प्रदाता आपको चाहिए।"</span>
            </p>
            <p className="leading-relaxed">
              • सहायता अनुरोध: <span className="font-semibold font-sans">"हमें बताइए कि किस प्रकार की सहायता चाहिए।"</span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs"
          >
            सहेजें (Save Welcome Content)
          </button>
        </div>
      )}

      {/* SECTION 9: DATABASE SETUP & RPCS */}
      {activeSection === 'database_setup' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 max-w-3xl shadow-xs">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">9. Database Setup & Required RPCs</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Supabase प्रोजेक्ट <code className="font-mono text-teal-800 font-bold">{SUPABASE_PROJECT_ID}</code> के लिए आवश्यक डेटाबेस फ़ंक्शंस।
            </p>
          </div>

          {/* Account Deletion RPC Card */}
          <div className="p-4 sm:p-5 bg-rose-50/70 border border-rose-200 rounded-xl space-y-3 shadow-2xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-rose-900 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-rose-700" />
                  <span>Account Deletion RPC (delete_user_by_admin)</span>
                </h4>
                <p className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                  एडमिन द्वारा किसी उपयोगकर्ता को डिलीट करने पर उसके सभी डेटाबेस रिकॉर्ड्स, स्टोरेज फ़ाइलें तथा Supabase Auth (<code className="font-mono">auth.users</code>) पहचान को पूर्णतः हटाने के लिए यह फ़ंक्शन आवश्यक है।
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(ACCOUNT_DELETION_MIGRATION_SQL);
                  setNotice({ type: 'success', text: 'delete_user_by_admin SQL कॉपी हो गया!' });
                }}
                className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>डिलीशन RPC SQL कॉपी करें</span>
              </button>
              <a
                href={SUPABASE_SQL_EDITOR_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-white text-rose-800 border border-rose-300 hover:bg-rose-50 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>Supabase SQL Editor खोलें</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Master Schema Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-teal-700" />
                <span>Master Database Schema Migration</span>
              </h4>
              <p className="text-[11px] text-slate-600 mt-1">
                सभी 14 टेबल्स, इंडेक्स, RLS नीतियां तथा स्टोरेज बकेट्स का मास्टर स्कीमा।
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(KAAMMITRA_MASTER_SCHEMA_SQL);
                  setNotice({ type: 'success', text: 'Master Schema SQL कॉपी हो गया!' });
                }}
                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>मास्टर स्कीमा SQL कॉपी करें</span>
              </button>
              <a
                href={SUPABASE_SQL_EDITOR_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>Supabase SQL Editor खोलें</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* 3 Features Migration Card (Activation, Pricing, Mobile Privacy) */}
          <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl space-y-3">
            <div>
              <h4 className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-teal-700" />
                <span>3 New Features SQL Migration</span>
              </h4>
              <p className="text-[11px] text-teal-800 mt-1">
                सर्विस प्रोवाइडर एक्टिवेशन (<code className="font-mono font-bold">is_active</code>), फ्लेक्सिबल प्राइसिंग (<code className="font-mono font-bold">price_unit</code>) एवं मोबाइल प्राइवेसी (<code className="font-mono font-bold">is_mobile_public</code>) के लिए डेटाबेस माइग्रेशन।
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(FEATURES_3_MIGRATION_SQL);
                  setNotice({ type: 'success', text: '3 Features Migration SQL कॉपी हो गया!' });
                }}
                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>माइग्रेशन SQL कॉपी करें</span>
              </button>
              <a
                href={SUPABASE_SQL_EDITOR_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>Supabase SQL Editor खोलें</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Requirements Marketplace Enhancement Card (Keywords & Photos Media) */}
          <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl space-y-3">
            <div>
              <h4 className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-teal-700" />
                <span>Requirements Marketplace: Keywords & Photos Media Migration</span>
              </h4>
              <p className="text-[11px] text-teal-800 mt-1">
                आवश्यकता कीवर्ड्स (<code className="font-mono font-bold">keywords TEXT[]</code>) एवं फोटो स्टोरेज (<code className="font-mono font-bold">photo_storage_paths TEXT[]</code>) के लिए नया माइग्रेशन।
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(REQUIREMENTS_ENHANCEMENT_MIGRATION_SQL);
                  setNotice({ type: 'success', text: 'Requirements Enhancement SQL कॉपी हो गया! Supabase SQL Editor में Run करें।' });
                }}
                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Requirements Enhancement SQL कॉपी करें</span>
              </button>
              <a
                href={SUPABASE_SQL_EDITOR_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>Supabase SQL Editor खोलें</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: REQUIREMENTS (Points 41-48) */}
      {activeSection === 'requirements' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                आवश्यकताएँ प्रबंधन (Requirements Marketplace)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                कुल आवश्यकताएँ: {requirementsList.length} | प्रदर्शित: {
                  requirementsList.filter((req) => {
                    if (requirementSearch.trim()) {
                      const term = requirementSearch.trim().toLowerCase();
                      const userName = req.owner?.name?.toLowerCase() || '';
                      const userMobile = req.owner?.mobile || '';
                      const cat = req.category.toLowerCase();
                      const shortReq = req.short_requirement.toLowerCase();
                      const locationText = [req.place, req.district, req.state].filter(Boolean).join(' ').toLowerCase();
                      const keywordMatch = (req.keywords || []).some((kw) => kw.toLowerCase().includes(term));
                      if (
                        !userName.includes(term) &&
                        !userMobile.includes(term) &&
                        !cat.includes(term) &&
                        !shortReq.includes(term) &&
                        !locationText.includes(term) &&
                        !keywordMatch
                      ) {
                        return false;
                      }
                    }
                    if (selectedReqCategory && req.category !== selectedReqCategory) return false;
                    return true;
                  }).length
                }
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadRequirementsAdmin}
                className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRequirements ? 'animate-spin' : ''}`} />
                <span>रीफ्रेश</span>
              </button>
            </div>
          </div>

          {/* Search, Filter & Sort Controls (Points 43-45) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Search (Point 43) */}
            <div className="relative">
              <input
                type="text"
                value={requirementSearch}
                onChange={(e) => setRequirementSearch(e.target.value)}
                placeholder="यूज़र, काम, कीवर्ड या स्थान खोजें..."
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-700 bg-slate-50/50"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            </div>

            {/* Category Filter (Point 44: Searchable) */}
            <div>
              <button
                type="button"
                onClick={() => setIsReqCategoryFilterModalOpen(true)}
                className="w-full py-2 px-3 border border-slate-300 rounded-xl text-xs font-semibold text-left flex items-center justify-between bg-slate-50/50 hover:bg-slate-100 cursor-pointer"
              >
                <span className="truncate">
                  {selectedReqCategory ? `कैटेगरी: ${selectedReqCategory}` : 'सभी कैटेगरी (फ़िल्टर)'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </div>

            {/* Sort (Point 45) */}
            <div className="flex items-center gap-2">
              <select
                value={requirementSort}
                onChange={(e) => setRequirementSort(e.target.value as 'newest' | 'oldest')}
                className="w-full py-2 px-3 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50/50 focus:outline-none focus:border-teal-700 cursor-pointer"
              >
                <option value="newest">क्रम: सबसे नया पहले</option>
                <option value="oldest">क्रम: सबसे पुराना पहले</option>
              </select>

              {selectedReqCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedReqCategory('')}
                  className="px-2.5 py-2 text-xs text-rose-600 hover:underline shrink-0 font-bold"
                >
                  फ़िल्टर हटाएं
                </button>
              )}
            </div>
          </div>

          {/* List of Requirements (Points 42, 46, 47) */}
          {isLoadingRequirements ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-700" />
              <p className="text-xs">आवश्यकताएँ लोड हो रही हैं...</p>
            </div>
          ) : requirementsList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-xs font-semibold">कोई आवश्यकता नहीं मिली।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requirementsList
                .filter((req) => {
                  if (requirementSearch.trim()) {
                    const term = requirementSearch.trim().toLowerCase();
                    const userName = req.owner?.name?.toLowerCase() || '';
                    const userMobile = req.owner?.mobile || '';
                    const cat = req.category.toLowerCase();
                    const shortReq = req.short_requirement.toLowerCase();
                    const locationText = [req.place, req.district, req.state].filter(Boolean).join(' ').toLowerCase();
                    const keywordMatch = (req.keywords || []).some((kw) => kw.toLowerCase().includes(term));
                    if (
                      !userName.includes(term) &&
                      !userMobile.includes(term) &&
                      !cat.includes(term) &&
                      !shortReq.includes(term) &&
                      !locationText.includes(term) &&
                      !keywordMatch
                    ) {
                      return false;
                    }
                  }
                  if (selectedReqCategory && req.category !== selectedReqCategory) return false;
                  return true;
                })
                .sort((a, b) => {
                  const tA = new Date(a.created_at).getTime();
                  const tB = new Date(b.created_at).getTime();
                  return requirementSort === 'newest' ? tB - tA : tA - tB;
                })
                .map((req) => {
                  const owner = req.owner;
                  const ownerName = owner?.name?.trim() || 'उपयोगकर्ता';
                  const ownerPhoto = owner?.profile_photo;
                  const locStr = [req.place, req.district, req.state].filter(Boolean).join(', ');
                  const hasVoice = Boolean(req.voice_storage_path);
                  const photoCount = Array.isArray(req.photo_storage_paths) ? req.photo_storage_paths.length : 0;
                  const createdDate = new Date(req.created_at).toLocaleDateString('hi-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <div
                      key={req.id}
                      className="p-3.5 sm:p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/30 space-y-3 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center font-bold text-slate-700 text-sm">
                            {ownerPhoto ? (
                              <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover" />
                            ) : (
                              <span>{ownerName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {ownerName}{' '}
                              {owner?.mobile && (
                                <span className="text-[11px] font-normal text-slate-500 font-mono">
                                  ({owner.mobile})
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                              <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                                {req.category}
                              </span>
                              <span>दिनांक: {createdDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                          <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-1 rounded-lg text-xs shadow-2xs">
                            <span className="font-semibold text-slate-500">प्राथमिकता:</span>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={req.priority_points ?? 50}
                              onChange={(e) => handleUpdateRequirementPriority(req.id, Number(e.target.value))}
                              className="w-12 px-1 py-0.5 border border-slate-300 rounded font-bold text-center text-slate-900 focus:outline-none focus:border-teal-700"
                              title="प्राथमिकता अंक (1-100)"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedAdminRequirement(req)}
                            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
                          >
                            पूरा विवरण देखें
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingAdminReq(req)}
                            className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>हटाएं</span>
                          </button>
                        </div>
                      </div>

                      {/* Work, budget, stats */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="sm:col-span-2">
                          <span className="font-semibold text-slate-500">क्या करवाना है: </span>
                          <span className="font-bold text-slate-900">"{req.short_requirement}"</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-500">अधिकतम बजट: </span>
                          <span className="font-bold text-amber-800 font-mono">₹{req.maximum_budget}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-500">स्थान: </span>
                          <span>{locStr || 'उपलब्ध नहीं'}</span>
                        </div>
                        {req.minimum_experience_years && (
                          <div>
                            <span className="font-semibold text-slate-500">अधिकतम अनुभव: </span>
                            <span>{req.minimum_experience_years} वर्ष</span>
                          </div>
                        )}
                        {hasVoice && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">
                            <Mic className="w-3 h-3" />
                            <span>वॉइस रिकॉर्डिंग उपलब्ध</span>
                          </span>
                        )}
                        {photoCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">
                            <Tag className="w-3 h-3" />
                            <span>{photoCount} फोटो संलग्न</span>
                          </span>
                        )}
                      </div>

                      {/* Keywords if any */}
                      {Array.isArray(req.keywords) && req.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {req.keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md"
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Admin Requirement Full Detail Modal (Point 46) */}
      {selectedAdminRequirement && (
        <RequirementDetailModal
          requirement={selectedAdminRequirement}
          onClose={() => setSelectedAdminRequirement(null)}
          onOpenChat={() => {}}
          onRequireAuth={() => {}}
          isOwnRequirement={false}
        />
      )}

      {/* Admin Requirement Delete Confirmation Modal (Points 47-53) */}
      {deletingAdminReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                क्या आप इस आवश्यकता को स्थायी रूप से हटाना चाहते हैं?
              </h3>
              <p className="text-xs text-rose-600 font-semibold">
                यह क्रिया पूर्ववत नहीं की जा सकती। आवश्यकता और उससे जुड़ी सभी फोटो व रिकॉर्डिंग स्थायी रूप से हटा दी जाएंगी।
              </p>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-left text-xs space-y-1">
                <p className="truncate font-bold text-slate-800">
                  काम: {deletingAdminReq.short_requirement}
                </p>
                <p className="text-slate-600">
                  यूज़र: {deletingAdminReq.owner?.name || 'उपयोगकर्ता'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingAdminReq(null)}
                disabled={isDeletingAdminReq}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAdminRequirement}
                disabled={isDeletingAdminReq}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeletingAdminReq ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>हटा रहे हैं...</span>
                  </>
                ) : (
                  <span>स्थायी रूप से हटाएं</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Category Filter Modal (Point 44) */}
      <SearchableCategoryModal
        isOpen={isReqCategoryFilterModalOpen}
        onClose={() => setIsReqCategoryFilterModalOpen(false)}
        categories={Array.from(new Set(requirementsList.map((r) => r.category).filter(Boolean))).sort()}
        selectedCategories={selectedReqCategory ? [selectedReqCategory] : []}
        isMultiSelect={false}
        onSelect={(selected) => {
          setSelectedReqCategory(selected.length > 0 ? selected[0] : '');
        }}
        title="कैटेगरी के अनुसार फ़िल्टर करें"
      />

      {/* Delete Confirmation Modal (Task 2) */}
      {deleteConfirm?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                क्या आप वास्तव में डिलीट करना चाहते हैं?
              </h3>
              <p className="text-xs text-slate-500">
                {deleteConfirm.type === 'worker' ? 'सेवा प्रदाता: ' : 'उपयोगकर्ता: '}
                <span className="font-semibold text-slate-700">{deleteConfirm.name}</span>
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeletingItem}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingItem}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeletingItem ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>हटा रहे हैं...</span>
                  </>
                ) : (
                  <span>डिलीट करें (Delete)</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Website Logo Crop Modal */}
      {logoFileForCrop && (
        <ImageCropperModal
          imageFile={logoFileForCrop}
          aspectRatio={1}
          title="वेबसाइट लोगो काटें (Crop Website Logo)"
          onCropComplete={handleLogoCropComplete}
          onCancel={() => setLogoFileForCrop(null)}
        />
      )}
    </div>
  );
};
