export type Language = 'hi' | 'en';

interface TranslationStrings {
  appName: string;
  tagline: string;
  welcome: string;
  hello: string;
  guest: string;
  searchPlaceholder: string;
  filter: string;
  allCategories: string;
  experience: string;
  years: string;
  perDay: string;
  pricePerDay: string;
  call: string;
  message: string;
  viewProfile: string;
  qrCode: string;
  shareQrCode: string;
  aboutWorker: string;
  workPhotos: string;
  voiceIntro: string;
  noWorkersFound: string;
  workerFoundQuestion: string;
  yes: string;
  no: string;
  showMore: string;
  downloadApp: string;
  adminPanel: string;
  help: string;
  helpHeading: string;
  helpPrompt: string;
  sendHelp: string;
  callAdmin: string;
  settings: string;
  yourProfile: string;
  darkMode: string;
  lightMode: string;
  aboutKaamMitra: string;
  logout: string;
  login: string;
  createAccount: string;
  username: string;
  password: string;
  mobile: string;
  name: string;
  address: string;
  location: string;
  currentLocation: string;
  save: string;
  cancel: string;
  delete: string;
  deleteForMe: string;
  deleteForEveryone: string;
  deleteChat: string;
  notifications: string;
  statusSent: string;
  statusDelivered: string;
  statusRead: string;
  statusSending: string;
  statusFailed: string;
  loading: string;
  retry: string;
  workerRequestTitle: string;
  workerRequestSubtitle: string;
  category: string;
  radius: string;
  find: string;
  close: string;
  createWorkerProfile: string;
  editWorkerProfile: string;
  deleteWorkerProfile: string;
    recordVoice: string;
  stopRecord: string;
  playVoice: string;
  reRecordVoice: string;
  requirements: string;
  requirementsSubtitle: string;
  postRequirement: string;
  yourRequirements: string;
  noOwnRequirements: string;
  searchRequirements: string;
  whatWorkNeeded: string;
  workLocation: string;
  maxBudget: string;
  minExperience: string;
  explainByVoice: string;
  additionalInfo: string;
  addCustomCategory: string;
  confirmDeleteRequirement: string;
  noRequirementsFound: string;
}

const translations: Record<Language, TranslationStrings> = {
  hi: {
    appName: 'काम मित्र',
    tagline: 'ग्रामीण और कस्बाई क्षेत्रों के लिए विश्वसनीय सेवा मंच',
    welcome: 'आपका स्वागत है',
    hello: 'नमस्ते',
    guest: 'अतिथि',
    searchPlaceholder: 'सर्विस खोजें',
    filter: 'फ़िल्टर',
    allCategories: 'सभी श्रेणियां',
    experience: 'अनुभव',
    years: 'वर्ष',
    perDay: 'रु/दिन',
    pricePerDay: 'आपकी फीस (रु/दिन)',
    call: 'कॉल करें',
    message: 'मैसेज',
    viewProfile: 'प्रोफ़ाइल देखें',
    qrCode: 'QR कोड',
    shareQrCode: 'QR कोड शेयर करें',
    aboutWorker: 'मेरी सर्विस और अनुभव',
    workPhotos: 'आपकी सर्विस की तस्वीरें',
    voiceIntro: 'सेवा के बारे में सुनें',
    noWorkersFound: 'अभी कोई सेवा प्रदाता उपलब्ध नहीं है।',
    workerFoundQuestion: 'क्या आपको सही सेवा प्रदाता मिल गया?',
    yes: 'हाँ',
    no: 'नहीं',
    showMore: 'और देखें',
    downloadApp: '📲 ऐप डाउनलोड करें',
    adminPanel: 'एडमिन पैनल',
    help: 'हमारी सहायता लें',
    helpHeading: 'आपको किस प्रकार की सहायता चाहिए? हमें बोलकर बताएं',
    helpPrompt: 'कृपया पहले अपना नाम तथा अपना मोबाइल नंबर अवश्य बताएं।',
    sendHelp: 'हमें भेजें',
    callAdmin: '📞 Admin को Call करें',
    settings: 'सेटिंग्स',
    yourProfile: 'आपकी प्रोफाइल',
    darkMode: 'डार्क मोड',
    lightMode: 'लाइट मोड',
    aboutKaamMitra: 'काम मित्र के बारे में',
    logout: 'लॉगआउट',
    login: 'लॉगिन करें',
    createAccount: 'नया खाता बनाएं',
    username: 'मोबाइल नंबर',
    password: 'पासवर्ड',
    mobile: 'मोबाइल नंबर',
    name: 'पूरा नाम',
    address: 'पता',
    location: 'स्थान',
    currentLocation: 'आपका वर्तमान स्थान',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    delete: 'हटाएं',
    deleteForMe: 'मेरे लिए हटाएं',
    deleteForEveryone: 'सभी के लिए हटाएं',
    deleteChat: 'चैट हटाएं',
    notifications: 'सूचनाएं',
    statusSent: 'भेजा गया',
    statusDelivered: 'पहुंचा',
    statusRead: 'पढ़ा गया',
    statusSending: 'भेज रहे हैं...',
    statusFailed: 'असफल',
    loading: 'लोड हो रहा है...',
    retry: 'पुनः प्रयास करें',
    workerRequestTitle: 'सर्विस की जरूरत दर्ज करें',
    workerRequestSubtitle: 'हम आपको उपयुक्त सेवा प्रदाता से संपर्क कराने में मदद करेंगे',
    category: 'सेवा की श्रेणी',
    radius: 'दूरी का दायरा',
    find: 'खोजें',
    close: 'बंद करें',
    createWorkerProfile: 'सेवा प्रोफ़ाइल बनाएं',
    editWorkerProfile: 'सेवा प्रोफ़ाइल संपादित करें',
    deleteWorkerProfile: 'सेवा प्रोफ़ाइल हटाएं',
    recordVoice: 'अपनी सेवा के बारे में बोलकर बताएं',
    stopRecord: 'रिकॉर्डिंग रोकें',
    playVoice: 'सुनें',
    reRecordVoice: 'दोबारा रिकॉर्ड करें',
    requirements: 'आवश्यकताएँ',
    requirementsSubtitle: 'यहाँ आप किसी सेवा के लिए अपनी आवश्यकता पोस्ट कर सकते हैं।',
    postRequirement: '+ अपनी आवश्यकता डालें',
    yourRequirements: 'आपकी आवश्यकताएँ',
    noOwnRequirements: 'अभी आपने कोई आवश्यकता पोस्ट नहीं की है',
    searchRequirements: 'आवश्यकता खोजें...',
    whatWorkNeeded: 'आपको कौन-सी सेवा चाहिए?',
    workLocation: 'आपका स्थान',
    maxBudget: 'अधिकतम बजट',
    minExperience: 'न्यूनतम अनुभव (वर्ष)',
    explainByVoice: '🎙️ अपनी आवश्यकता विस्तार से बताएं',
    additionalInfo: 'अतिरिक्त जानकारी (वैकल्पिक)',
    addCustomCategory: '+ अपनी Category जोड़ें',
    confirmDeleteRequirement: 'क्या आप यह आवश्यकता हटाना चाहते हैं?',
    noRequirementsFound: 'अभी कोई आवश्यकता उपलब्ध नहीं है।',
  },
  en: {
    appName: 'KaamMitra',
    tagline: 'Reliable service marketplace for rural and local areas',
    welcome: 'Welcome',
    hello: 'Hello',
    guest: 'Guest',
    searchPlaceholder: 'Find Services',
    filter: 'Filter',
    allCategories: 'All Categories',
    experience: 'Experience',
    years: 'yrs',
    perDay: '₹/day',
    pricePerDay: 'Your Fee (₹/day)',
    call: 'Call',
    message: 'Message',
    viewProfile: 'View Profile',
    qrCode: 'QR Code',
    shareQrCode: 'Share QR Code',
    aboutWorker: 'My Services & Experience',
    workPhotos: 'Your Service Photos',
    voiceIntro: 'Listen to the Service Description',
    noWorkersFound: 'No service providers available right now.',
    workerFoundQuestion: 'Did you find the right service provider?',
    yes: 'Yes',
    no: 'No',
    showMore: 'Show More',
    downloadApp: '📲 Download App',
    adminPanel: 'Admin Panel',
    help: 'Get Help',
    helpHeading: 'What kind of help do you need? Tell us by voice.',
    helpPrompt: 'Please state your name and mobile number first.',
    sendHelp: 'Send to Us',
    callAdmin: '📞 Call Admin',
    settings: 'Settings',
    yourProfile: 'Your Profile',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    aboutKaamMitra: 'About KaamMitra',
    logout: 'Logout',
    login: 'Login',
    createAccount: 'Create New Account',
    username: 'Mobile Number',
    password: 'Password',
    mobile: 'Mobile Number',
    name: 'Full Name',
    address: 'Address',
    location: 'Location',
    currentLocation: 'Your Current Location',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    deleteForMe: 'Delete for Me',
    deleteForEveryone: 'Delete for Everyone',
    deleteChat: 'Delete Chat',
    notifications: 'Notifications',
    statusSent: 'Sent',
    statusDelivered: 'Delivered',
    statusRead: 'Read',
    statusSending: 'Sending...',
    statusFailed: 'Failed',
    loading: 'Loading...',
    retry: 'Retry',
    workerRequestTitle: 'Submit Service Request',
    workerRequestSubtitle: 'We will help you connect with a suitable service provider',
    category: 'Service Category',
    radius: 'Radius',
    find: 'Find',
    close: 'Close',
    createWorkerProfile: 'Create Service Profile',
    editWorkerProfile: 'Edit Service Profile',
    deleteWorkerProfile: 'Delete Service Profile',
    recordVoice: 'Tell people about your service by voice',
    stopRecord: 'Stop Recording',
    playVoice: 'Play Voice',
    reRecordVoice: 'Re-record Voice',
    requirements: 'Requirements',
    requirementsSubtitle: 'Post your service requirements to find skilled service providers near you.',
    postRequirement: '+ Post Requirement',
    yourRequirements: 'Your Requirements',
    noOwnRequirements: 'You have not posted any requirements yet',
    searchRequirements: 'Search requirements...',
    whatWorkNeeded: 'What service is needed?',
    workLocation: 'Your Location',
    maxBudget: 'Maximum Budget',
    minExperience: 'Minimum Experience (Years)',
    explainByVoice: '🎙️ Explain Your Requirement by Voice',
    additionalInfo: 'Additional Information (Optional)',
    addCustomCategory: '+ Add Your Category',
    confirmDeleteRequirement: 'Are you sure you want to delete this requirement?',
    noRequirementsFound: 'No requirements available right now.',
  },
};

import { safeStorage } from './storage';
import { brandingStore } from '../services/brandingService';

// Check if zustand is installed or use custom lightweight state
export interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: TranslationStrings;
}

// We implement a tiny reactive subscription store without relying on extra packages
class LanguageStore {
  private lang: Language = (safeStorage.getItem('kaammitra_lang') as Language) || 'hi';
  private listeners: Set<() => void> = new Set();

  constructor() {
    // When website branding changes, notify all translation listeners
    brandingStore.subscribe(() => {
      this.notify();
    });
  }

  getLanguage(): Language {
    return this.lang;
  }

  getStrings(): TranslationStrings {
    const base = translations[this.lang];
    const appName = brandingStore.getName(this.lang);
    const aboutKaamMitra = this.lang === 'hi' ? `${appName} के बारे में` : `About ${appName}`;
    return {
      ...base,
      appName,
      aboutKaamMitra,
    };
  }

  setLanguage(newLang: Language) {
    this.lang = newLang;
    safeStorage.setItem('kaammitra_lang', newLang);
    this.notify();
  }

  toggleLanguage() {
    this.setLanguage(this.lang === 'hi' ? 'en' : 'hi');
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const languageStore = new LanguageStore();
