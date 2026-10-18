import React, { useState } from 'react';
import { ShieldCheck, X, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface RecordingGuidelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'en' | 'hi';
}

export const RecordingGuidelinesModal: React.FC<RecordingGuidelinesModalProps> = ({
  isOpen,
  onClose,
  lang: initialLang = 'hi',
}) => {
  const [lang, setLang] = useState<'hi' | 'en'>(initialLang);

  usePopupBackDismiss(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">
                {lang === 'hi' ? 'कॉल रिकॉर्डिंग दिशानिर्देश' : 'Call Recording Guidelines'}
              </h3>
              <p className="text-xs text-orange-100">
                {lang === 'hi' ? 'पारदर्शिता, सहमति एवं विधिक नियम' : 'Transparency, Consent & Legal Rules'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white/20 rounded-lg p-0.5 flex text-xs">
              <button
                onClick={() => setLang('hi')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  lang === 'hi' ? 'bg-white text-orange-700 shadow-sm' : 'text-white hover:bg-white/10'
                }`}
              >
                हिंदी
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  lang === 'en' ? 'bg-white text-orange-700 shadow-sm' : 'text-white hover:bg-white/10'
                }`}
              >
                English
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors ml-1"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-gray-700 text-sm leading-relaxed">
          {lang === 'hi' ? (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 font-medium">
                  <strong>महत्वपूर्ण सूचना:</strong> कॉल रिकॉर्डिंग की यह सुविधा केवल इस वेबसाइट / ऐप के भीतर की जाने वाली इंटरनेट कॉल्स (In-App Internet Calls) पर लागू होती है। आपके फोन की निजी मोबाइल सिम कॉल्स या प्लेटफॉर्म से बाहर की बातचीत पर इसका कोई संबंध नहीं है।
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  1. सहमति एवं पारदर्शिता (Consent & Transparency)
                </h4>
                <p>
                  जब भी कॉल रिकॉर्डिंग सक्रिय होती है, कॉल शुरू होने पर दोनों पक्षों को स्पष्ट ऑडियो घोषणा तथा स्क्रीन पर दृश्य संकेत (रेड इंडिकेटर एवं रिकॉर्डिंग बैज) द्वारा सूचित किया जाता है। किसी भी पक्ष को बिना पूर्व सूचना या धोखे से रिकॉर्ड नहीं किया जाता।
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  2. व्यक्तिगत रिकॉर्डिंग बनाम प्रशासनिक साक्ष्य
                </h4>
                <p>
                  <strong>व्यक्तिगत रिकॉर्डिंग (Personal Recording):</strong> यदि किसी यूजर ने अपनी प्रोफाइल में पर्सनल रिकॉर्डिंग ऑन रखी है, तो उसकी निजी ऑडियो केवल उसी यूजर के चैट व प्रोफाइल में सुरक्षित रहती है। दूसरा यूजर इसे नहीं सुन सकता। यूजर जब चाहे अपनी निजी रिकॉर्डिंग हटा सकता है।<br />
                  <strong>प्रशासनिक साक्ष्य (Administrative Evidence):</strong> प्लेटफॉर्म सुरक्षा, धोखाधड़ी रोकथाम और विवाद निवारण के लिए एडमिन नीति के तहत रिकॉर्ड किया गया साक्ष्य केवल अधिकृत सुपर एडमिन द्वारा जांच के लिए ही उपलब्ध होता है और आम उपयोगकर्ताओं से पूर्णतः गोपनीय रखा जाता है।
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  3. नागरिक व्यवहार व अनुचित भाषा पर प्रतिबंध
                </h4>
                <p>
                  काममित्र पर सभी उपयोगकर्ताओं (उपभोक्ता एवं कामगार) से शिष्ट व मर्यादित व्यवहार की अपेक्षा की जाती है। कॉल के दौरान गाली-गलौज, धमकी, अश्लीलता, नस्लीय/धार्मिक टिप्पणी या अनुचित आचरण सख्त वर्जित है। विवाद या शिकायत की स्थिति में प्रशासनिक रिकॉर्डिंग की समीक्षा कर दोषी खाते को तत्काल निलंबित किया जा सकता है।
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  4. विधिक सुरक्षा व डेटा संरक्षण
                </h4>
                <p>
                  सभी रिकॉर्डिंग्स क्लाउड स्टोरेज पर सुरक्षित रूप से एन्क्रिप्टेड पाथ में संग्रहीत होती हैं। किसी भी रिकॉर्डिंग को सोशल मीडिया, सार्वजनिक डोमेन या किसी तीसरे पक्ष को बेचना अथवा बिना अनुमति साझा करना गैरकानूनी है।
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  5. स्वतः निष्कासन नीति (Retention & Auto-Purge)
                </h4>
                <p>
                  कॉल रिकॉर्डिंग्स प्लेटफॉर्म की आधिकारिक प्रतिधारण नीति (उदा. 30 दिन अथवा एडमिन द्वारा निर्धारित अवधि) के समाप्त होने के पश्चात सर्वर से स्वतः और स्थायी रूप से मिटा दी जाती हैं।
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 font-medium">
                  <strong>Important Notice:</strong> This call recording functionality applies strictly and exclusively to In-App Internet Calls made within this platform. It has no access to or relationship with your private mobile SIM cellular calls or conversations outside this service.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  1. Consent and Transparency
                </h4>
                <p>
                  Whenever call recording is enabled, both participants receive a clear audio notification and prominent visual indicators (red recording badge and timer) on screen. No party is recorded surreptitiously or without explicit disclosure.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  2. Personal Recording vs. Administrative Evidence
                </h4>
                <p>
                  <strong>Personal Recording:</strong> If a user enables personal recording in their profile settings, their private copy is accessible solely in their own chat and profile history. Other participants cannot access it, and the user can delete it at any time.<br />
                  <strong>Administrative Evidence:</strong> Audio captured under platform safety policies for fraud prevention, safety audits, and dispute resolution is accessible only to authorized Super Admins and remains strictly confidential from ordinary participants.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  3. Code of Conduct & Prohibition of Abusive Language
                </h4>
                <p>
                  All users and service providers are expected to interact respectfully. Profanity, abusive language, harassment, hate speech, threats, and fraudulent demands are strictly prohibited. In case of disputes, recorded evidence will be audited, and violating accounts will be penalized or banned.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  4. Legal Compliance & Data Privacy
                </h4>
                <p>
                  All audio recordings are securely stored with restricted access paths. Publishing, leaking, or distributing call recordings on public social media or to unauthorized third parties is strictly prohibited and subject to legal action under applicable IT and privacy laws.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-base mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                  5. Retention & Automated Purge Policy
                </h4>
                <p>
                  Recordings are retained in accordance with the platform's configured retention schedule (e.g. 30 days or as determined by the administrator) and are automatically and permanently purged upon expiration.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 p-4 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm"
          >
            {lang === 'hi' ? 'समझ गया / बंद करें' : 'I Understand / Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
