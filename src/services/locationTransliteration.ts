/**
 * Accurate Multilingual Location Display & Transliteration Engine
 * 
 * Provides presentation-layer transliteration between English and Hindi
 * for Indian administrative place names (States, Districts, Tehsils, Towns, Villages).
 * 
 * CRITICAL DATA INTEGRITY:
 * - This file operates exclusively on the presentation/display layer.
 * - Never mutates, normalizes, or writes back to API responses, database records, or profile models.
 * - The original API location values remain the single source of truth.
 */

export function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

// All 36 Indian States and Union Territories (Bidirectional)
export const STATES_EN_TO_HI: Record<string, string> = {
  'andaman and nicobar islands': 'अंडमान और निकोबार द्वीप समूह',
  'andaman & nicobar islands': 'अंडमान और निकोबार द्वीप समूह',
  'andhra pradesh': 'आंध्र प्रदेश',
  'arunachal pradesh': 'अरुणाचल प्रदेश',
  'assam': 'असम',
  'bihar': 'बिहार',
  'chandigarh': 'चंडीगढ़',
  'chhattisgarh': 'छत्तीसगढ़',
  'chhatisgarh': 'छत्तीसगढ़',
  'dadra and nagar haveli': 'दादरा और नगर हवेली',
  'dadra & nagar haveli': 'दादरा और नगर हवेली',
  'daman and diu': 'दमन और दीव',
  'daman & diu': 'दमन और दीव',
  'delhi': 'दिल्ली',
  'nct of delhi': 'दिल्ली',
  'national capital territory of delhi': 'दिल्ली',
  'goa': 'गोवा',
  'gujarat': 'गुजरात',
  'haryana': 'हरियाणा',
  'himachal pradesh': 'हिमाचल प्रदेश',
  'jammu and kashmir': 'जम्मू और कश्मीर',
  'jammu & kashmir': 'जम्मू और कश्मीर',
  'jharkhand': 'झारखंड',
  'karnataka': 'कर्नाटक',
  'kerala': 'केरल',
  'ladakh': 'लद्दाख',
  'lakshadweep': 'लक्षद्वीप',
  'madhya pradesh': 'मध्य प्रदेश',
  'maharashtra': 'महाराष्ट्र',
  'manipur': 'मणिपुर',
  'meghalaya': 'मेघालय',
  'mizoram': 'मिज़ोरम',
  'nagaland': 'नागालैंड',
  'odisha': 'ओडिशा',
  'orissa': 'ओडिशा',
  'puducherry': 'पुडुचेरी',
  'pondicherry': 'पुडुचेरी',
  'punjab': 'पंजाब',
  'rajasthan': 'राजस्थान',
  'sikkim': 'सिक्किम',
  'tamil nadu': 'तमिलनाडु',
  'telangana': 'तेलंगाना',
  'tripura': 'त्रिपुरा',
  'uttar pradesh': 'उत्तर प्रदेश',
  'uttarakhand': 'उत्तराखंड',
  'uttaranchal': 'उत्तराखंड',
  'west bengal': 'पश्चिम बंगाल',
};

// Verified Dictionary of Indian Administrative Places (Districts, Tehsils, Towns, Villages)
export const PLACES_EN_TO_HI: Record<string, string> = {
  // Primary test cases & specifically required locations
  'pipalsana': 'पिपलसाना',
  'peeplasana': 'पिपलसाना',
  'peepalsana': 'पिपलसाना',
  'moradabad': 'मुरादाबाद',

  // Current worker database locations & verified districts
  'begusarai': 'बेगूसराय',
  'bhagwanpur': 'भगवानपुर',
  'mandi': 'मंडी',
  'lad bharol': 'लड़भड़ोल',
  'ladbharol': 'लड़भड़ोल',
  'dhemaji': 'धेमाजी',
  'gogamukh': 'गोगामुख',
  'kishtwar': 'किश्तवाड़',
  'kuchal': 'कुचल',
  'kathua': 'कठुआ',
  'billawar': 'बिलावर',

  // Moradabad Division & Western UP
  'kanth': 'कांठ',
  'thakurdwara': 'ठाकुरद्वारा',
  'bilari': 'बिलारी',
  'kundarki': 'कुंदरकी',
  'sambhal': 'संभल',
  'chandausi': 'चंदौसी',
  'gunnaur': 'गुन्नौर',
  'bahjoi': 'बहजोई',
  'amroha': 'अमरोहा',
  'jyotiba phule nagar': 'ज्योतिबा फुले नगर',
  'hasanpur': 'हसनपुर',
  'dhanaura': 'धनौरा',
  'mandi dhanaura': 'मंडी धनौरा',
  'naugawan sadat': 'नौगावां सादात',
  'rampur': 'रामपुर',
  'milak': 'मिलक',
  'bilaspur': 'बिलासपुर',
  'shahabad': 'शाहाबाद',
  'tanda': 'टांडा',
  'suar': 'स्वार',
  'bijnor': 'बिजनौर',
  'najibabad': 'नजीबाबाद',
  'nagina': 'नगीना',
  'chandpur': 'चांदपुर',
  'dhampur': 'धामपुर',
  'seohara': 'स्योहारा',
  'bareilly': 'बरेली',
  'baheri': 'बहेड़ी',
  'aonla': 'आंवला',
  'faridpur': 'फरीदपुर',
  'mirganj': 'मीरगंज',
  'nawabganj': 'नवाबगंज',
  'pilibhit': 'पीलीभीत',
  'bisalpur': 'बीसलपुर',
  'puranpur': 'पूरनपुर',
  'barkhera': 'बरखेड़ा',
  'shahjahanpur': 'शाहजहांपुर',
  'tilhar': 'तिलहर',
  'jalalabad': 'जलालाबाद',
  'powayan': 'पुवायां',
  'budaun': 'बदायूं',
  'bilsi': 'बिल्सी',
  'bisauli': 'बिसौली',
  'dataganj': 'दातागंज',
  'sahaswan': 'सहसवान',
  'meerut': 'मेरठ',
  'sardhana': 'सरधना',
  'mawana': 'मवाना',
  'ghaziabad': 'गाजियाबाद',
  'modinagar': 'मोदीनगर',
  'muradnagar': 'मुरादनगर',
  'loni': 'लोनी',
  'noida': 'नोएडा',
  'greater noida': 'ग्रेटर नोएडा',
  'gautam buddha nagar': 'गौतम बुद्ध नगर',
  'dadri': 'दादरी',
  'jewar': 'जेवर',
  'hapur': 'हापुड़',
  'garhmukteshwar': 'गढ़मुक्तेश्वर',
  'dhaulana': 'धौलाना',
  'bulandshahr': 'बुलंदशहर',
  'khurja': 'खुर्जा',
  'sikandrabad': 'सिकंदराबाद',
  'syana': 'स्याना',
  'anupshahr': 'अनूपशहर',
  'debai': 'डिबाई',
  'shikarpur': 'शिकारपुर',
  'muzaffarnagar': 'मुजफ्फरनगर',
  'budhana': 'बुढ़ाना',
  'jansath': 'जानसठ',
  'khatauli': 'खतौली',
  'saharanpur': 'सहारनपुर',
  'deoband': 'देवबंद',
  'nakur': 'नकुड़',
  'behat': 'बेहट',
  'rampur maniharan': 'रामपुर मनिहारान',
  'shamli': 'शामली',
  'kairana': 'कैराना',
  'thanabhawan': 'थानाभवन',
  'baghpat': 'बागपत',
  'baraut': 'बड़ौत',
  'khekada': 'खेखड़ा',

  // UP Major Districts & Cities
  'aligarh': 'अलीगढ़',
  'khair': 'खैर',
  'atraul': 'अतरौली',
  'atrauli': 'अतरौली',
  'gabhana': 'गभाना',
  'iglas': 'इगलास',
  'hathras': 'हाथरस',
  'sadabad': 'सादाबाद',
  'sasni': 'सासनी',
  'sikandra rao': 'सिकंदरा राव',
  'mathura': 'मथुरा',
  'vrindavan': 'वृंदावन',
  'barsana': 'बरसाना',
  'govardhan': 'गोवर्धन',
  'chhata': 'छाता',
  'mant': 'मांट',
  'agra': 'आगरा',
  'fatehabad': 'फतेहाबाद',
  'etmadpur': 'एत्मादपुर',
  'bah': 'बाह',
  'kheragarh': 'खेरागढ़',
  'firozabad': 'फिरोजाबाद',
  'shikohabad': 'शिकोहबाद',
  'jasrana': 'जसराना',
  'tundla': 'टूंडला',
  'mainpuri': 'मैनपुरी',
  'bhongaon': 'भोगांव',
  'karhal': 'करहल',
  'kishni': 'किशनी',
  'etah': 'एटा',
  'aliganj': 'अलीगंज',
  'jalesar': 'जलेसर',
  'kasganj': 'कासगंज',
  'ganjdundwara': 'गंजडुंडवारा',
  'patiyali': 'पटियाली',
  'sahawar': 'सहावर',
  'lucknow': 'लखनऊ',
  'bakshi ka talab': 'बख्शी का तालाब',
  'malihabad': 'मलिहाबाद',
  'mohanlalganj': 'मोहनलालगंज',
  'sarojini nagar': 'सरोजिनी नगर',
  'kanpur': 'कानपुर',
  'kanpur nagar': 'कानपुर नगर',
  'kanpur dehat': 'कानपुर देहात',
  'ghatampur': 'घाटमपुर',
  'bilhaur': 'बिल्हौर',
  'akbarpur': 'अकबरपुर',
  'bhognipur': 'भोगनीपुर',
  'rasulabad': 'रसूलाबाद',
  'deraapur': 'डेरापुर',
  'unnao': 'उन्नाव',
  'safipur': 'सफीपुर',
  'purwa': 'पुरवा',
  'hasanganj': 'हसनगंज',
  'bighapur': 'बीघापुर',
  'bangarmau': 'बांगरमऊ',
  'raebareli': 'रायबरेली',
  'lalganj': 'लालगंज',
  'salon': 'सलोन',
  'tiloi': 'तिलोई',
  'dalmau': 'डलमऊ',
  'sitapur': 'सीतापुर',
  'biswan': 'बिसवां',
  'mahmoodabad': 'महमूदाबाद',
  'laharpur': 'लहरपुर',
  'mishrikh': 'मिश्रिख',
  'sidhauli': 'सिधौली',
  'hardoi': 'हरदोई',
  'bilgram': 'बिलग्राम',
  'sandila': 'संडीला',
  'sawayajpur': 'सवायजपुर',
  'lakhimpur': 'लखीमपुर',
  'lakhimpur kheri': 'लखीमपुर खीरी',
  'kheri': 'खीरी',
  'gola gokarannath': 'गोला गोकर्णनाथ',
  'mohammadi': 'मोहम्मदी',
  'nighasan': 'निघासन',
  'palia': 'पलिया',
  'dhaurahra': 'धौरहरा',
  'varanasi': 'वाराणसी',
  'pindra': 'पिंडरा',
  'prayagraj': 'प्रयागराज',
  'allahabad': 'इलाहाबाद',
  'phulpur': 'फूलपुर',
  'soraon': 'सोरांव',
  'handia': 'हंडिया',
  'karchhana': 'करछना',
  'bara': 'बारा',
  'koraon': 'कोरांव',
  'ayodhya': 'अयोध्या',
  'faizabad': 'फैजाबाद',
  'bikapur': 'बीकापुर',
  'rudauli': 'रुदौली',
  'sohawal': 'सोहावल',
  'gorakhpur': 'गोरखपुर',
  'sahjanwa': 'सहजनवा',
  'bansgaon': 'बांसगांव',
  'campierganj': 'कैंपियरगंज',
  'chauri chaura': 'चौरी चौरा',
  'gola': 'गोला',
  'khajni': 'खजनी',
  'jhansi': 'झांसी',
  'maurani pur': 'मऊरानीपुर',
  'moth': 'मोंठ',
  'garautha': 'गरौठा',
  'taharoli': 'टहरौली',
  'azamgarh': 'आजमगढ़',
  'ballia': 'बलिया',
  'basti': 'बस्ती',
  'deoria': 'देवरिया',
  'jaunpur': 'जौनपुर',
  'ghazipur': 'गाजीपुर',
  'mirzapur': 'मिर्जापुर',
  'sonbhadra': 'सोनभद्र',
  'chandauli': 'चंदौली',
  'fatehpur': 'फतेहपुर',
  'pratapgarh': 'प्रतापगढ़',
  'kaushambi': 'कौशाम्बी',
  'lalitpur': 'ललितपुर',
  'jalaun': 'जालौन',
  'hamirpur': 'हमीरपुर',
  'mahoba': 'महोबा',
  'banda': 'बांदा',
  'chitrakoot': 'चित्रकूट',
  'barabanki': 'बाराबंकी',
  'sultanpur': 'सुल्तानपुर',
  'amethi': 'अमेठी',
  'ambedkar nagar': 'अंबेडकर नगर',
  'kushinagar': 'कुशीनगर',
  'maharajganj': 'महराजगंज',
  'sant kabir nagar': 'संत कबीर नगर',
  'siddharthnagar': 'सिद्धार्थनगर',
  'mau': 'मऊ',
  'auraiya': 'औरैया',
  'etawah': 'इटावा',
  'farrukhabad': 'फर्रुखाबाद',
  'kannauj': 'कन्नौज',

  // Bihar
  'patna': 'पटना',
  'danapur': 'दानापुर',
  'barh': 'बाढ़',
  'masaurhi': 'मसौढ़ी',
  'paliganj': 'पालीगंज',
  'gaya': 'गया',
  'bodh gaya': 'बोधगया',
  'sherghati': 'शेरघाटी',
  'tekari': 'टिकारी',
  'bhagalpur': 'भागलपुर',
  'kahalgaon': 'कहलगांव',
  'navgachhia': 'नवगछिया',
  'muzaffarpur': 'मुजफ्फरपुर',
  'kanti': 'कांटी',
  'motipur': 'मोतीपुर',
  'sakra': 'सकरा',
  'purnia': 'पूर्णिया',
  'banmankhi': 'बनमनखी',
  'dhamdaha': 'धमदाहा',
  'baisi': 'बायसी',
  'darbhanga': 'दरभंगा',
  'benipur': 'बेनीपुर',
  'birol': 'बिरोल',
  'bihar sharif': 'बिहार शरीफ',
  'nalanda': 'नालंदा',
  'hilsa': 'हिलसा',
  'rajgir': 'राजगीर',
  'arrah': 'आरा',
  'bhojpur': 'भोजपुर',
  'jagdishpur': 'जगदीशपुर',
  'piro': 'पीरो',
  'samastipur': 'समस्तीपुर',
  'dalsinghsarai': 'दलसिंहसराय',
  'rosera': 'रोसड़ा',
  'shahpur patori': 'शाहपुर पटोरी',
  'katihar': 'कटिहार',
  'barsoi': 'बारसोई',
  'manihari': 'मनिहारी',
  'munger': 'मुंगेर',
  'haveli kharagpur': 'हवेली खड़गपुर',
  'tarapur': 'तारापुर',
  'chhapra': 'छपरा',
  'saran': 'सारण',
  'marhaura': 'मढ़ौरा',
  'sonpur': 'सोनपुर',
  'sasaram': 'सासाराम',
  'rohtas': 'रोहतास',
  'dehri': 'डेहरी',
  'bikramganj': 'बिक्रमगंज',
  'hajipur': 'हाजीपुर',
  'vaishali': 'वैशाली',
  'mahnar': 'महनार',
  'mahua': 'महुआ',
  'siwan': 'सीवान',
  'motihari': 'मोतिहारी',
  'east champaran': 'पूर्वी चंपारण',
  'bettiah': 'बेतिया',
  'west champaran': 'पश्चिमी चंपारण',
  'aurangabad': 'औरंगाबाद',
  'jehanabad': 'जहानाबाद',
  'madhubani': 'मधुबनी',
  'saharsa': 'सहरसा',
  'supaul': 'सुपौल',
  'madhepura': 'मधेपुरा',
  'khagaria': 'खगड़िया',
  'banka': 'बांका',
  'jamui': 'जमुई',
  'nawada': 'नवादा',
  'buxar': 'बक्सर',
  'gopalganj': 'गोपालगंज',
  'sitamarhi': 'सीतामढ़ी',
  'kishanganj': 'किशनगंज',
  'araria': 'अररिया',
  'sheikhpura': 'शेखपुरा',
  'sheohar': 'शिवहर',
  'lakhisarai': 'लखीसराय',
  'kaimur': 'कैमूर',
  'arwal': 'अरवल',

  // Delhi NCR & Haryana
  'new delhi': 'नई दिल्ली',
  'central delhi': 'मध्य दिल्ली',
  'east delhi': 'पूर्वी दिल्ली',
  'north delhi': 'उत्तरी दिल्ली',
  'north east delhi': 'उत्तर पूर्वी दिल्ली',
  'north west delhi': 'उत्तर पश्चिमी दिल्ली',
  'south delhi': 'दक्षिणी दिल्ली',
  'south east delhi': 'दक्षिण पूर्वी दिल्ली',
  'south west delhi': 'दक्षिण पश्चिमी दिल्ली',
  'west delhi': 'पश्चिमी दिल्ली',
  'shahdara': 'शाहदरा',
  'gurugram': 'गुरुग्राम',
  'gurgaon': 'गुरुग्राम',
  'faridabad': 'फरीदाबाद',
  'ballabgarh': 'बल्लभगढ़',
  'rohtak': 'रोहतक',
  'hisar': 'हिसार',
  'panipat': 'पानीपत',
  'karnal': 'करनाल',
  'sonipat': 'सोनीपत',
  'ambala': 'अंबाला',
  'panchkula': 'पंचकुला',
  'yamunanagar': 'यमुनानगर',
  'kurukshetra': 'कुरुक्षेत्र',
  'bhiwani': 'भिवानी',
  'sirsa': 'सिरसा',
  'jind': 'जींद',
  'rewari': 'रेवाड़ी',
  'palwal': 'पलवल',
  'kaithal': 'कैथल',
  'jhajjar': 'झज्जर',
  'charkhi dadri': 'चरखी दादरी',
  'nuh': 'नूंह',
  'mewat': 'मेवात',

  // Punjab
  'ludhiana': 'लुधियाना',
  'amritsar': 'अमृतसर',
  'jalandhar': 'जालंधर',
  'patiala': 'पटियाला',
  'bathinda': 'बठिंडा',
  'mohali': 'मोहाली',
  'hoshiarpur': 'होशियारपुर',
  'pathankot': 'पठानकोट',
  'moga': 'मोंगा',
  'firozpur': 'फिरोजपुर',
  'kapurthala': 'कपूरथला',
  'sangrur': 'संगरूर',

  // Rajasthan
  'jaipur': 'जयपुर',
  'jodhpur': 'जोधपुर',
  'kota': 'कोटा',
  'bikaner': 'बीकानेर',
  'ajmer': 'अजमेर',
  'udaipur': 'उदयपुर',
  'bhilwara': 'भीलवाड़ा',
  'alwar': 'अलवर',
  'bharatpur': 'भरतपुर',
  'sikar': 'सीकर',
  'pali': 'पाली',
  'sri ganganagar': 'श्रीगंगानगर',
  'hanumangarh': 'हनुमानगढ़',
  'chittorgarh': 'चित्तौड़गढ़',
  'nagaur': 'नागौर',
  'jhunjhunu': 'झुंझुनूं',
  'churu': 'चूरू',
  'barmer': 'बाड़मेर',
  'jaisalmer': 'जैसलमेर',
  'jalore': 'जालोर',
  'jhalawar': 'झालावाड़',
  'bundi': 'बूंदी',
  'banswara': 'बांसवाड़ा',
  'baran': 'बारां',
  'dausa': 'दौसा',
  'dholpur': 'धौलपुर',
  'dungarpur': 'डूंगरपुर',
  'karauli': 'करौली',
  'rajsamand': 'राजसमंद',
  'sawai madhopur': 'सवाई माधोपुर',
  'sirohi': 'सिरोही',
  'tonk': 'टोंक',

  // Himachal Pradesh & J&K & Uttarakhand
  'shimla': 'शिमला',
  'kangra': 'कांगड़ा',
  'dharamshala': 'धर्मशाला',
  'kullu': 'कुल्लू',
  'manali': 'मनाली',
  'solan': 'सोलन',
  'hamirpur hp': 'हमीरपुर',
  'una': 'ऊना',
  'chamba': 'चंबा',
  'sirmaur': 'सिरमौर',
  'kinnaur': 'किन्नौर',
  'lahaul and spiti': 'लाहौल और स्पीति',
  'dehradun': 'देहरादून',
  'haridwar': 'हरिद्वार',
  'roorkee': 'रुड़की',
  'haldwani': 'हल्द्वानी',
  'nainital': 'नैनीताल',
  'rudrapur': 'रुद्रपुर',
  'kashipur': 'काशीपुर',
  'rishikesh': 'ऋषिकेश',
  'almora': 'अल्मोड़ा',
  'pithoragarh': 'पिथौरागढ़',
  'champawat': 'चंपावत',
  'bageshwar': 'बागेश्वर',
  'chamoli': 'चमोली',
  'uttarkashi': 'उत्तरकाशी',
  'tehri': 'टिहरी',
  'pauri': 'पौड़ी',
  'rudraprayag': 'रुद्रप्रयाग',
  'udham singh nagar': 'उधम सिंह नगर',
  'srinagar': 'श्रीनगर',
  'jammu': 'जम्मू',
  'anantnag': 'अनंतनाग',
  'baramulla': 'बारामूला',
  'udhampur': 'उधमपुर',
  'rajouri': 'राजौरी',
  'poonch': 'पुंछ',
  'doda': 'डोडा',
  'ramban': 'रामबन',
  'reasi': 'रियासी',
  'samba': 'सांबा',
  'pulwama': 'पुलवामा',
  'kupwara': 'कुपवाड़ा',
  'budgam': 'बड़गाम',
  'ganderbal': 'गांदरबल',
  'bandipora': 'बांदीपोरा',
  'kulgam': 'कुलगाम',
  'shopian': 'शोपियां',

  // MP, Maharashtra, Gujarat, Assam, West Bengal, South India
  'bhopal': 'भोपाल',
  'indore': 'इंदौर',
  'jabalpur': 'जबलपुर',
  'gwalior': 'ग्वालियर',
  'ujjain': 'उज्जैन',
  'sagar': 'सागर',
  'satna': 'सतना',
  'rewa': 'रीवा',
  'ratlam': 'रतलाम',
  'mumbai': 'मुंबई',
  'pune': 'पुणे',
  'nagpur': 'नागपुर',
  'thane': 'ठाणे',
  'nashik': 'नासिक',
  'chhatrapati sambhajinagar': 'छत्रपति संभाजीनगर',
  'ahmedabad': 'अहमदाबाद',
  'surat': 'सूरत',
  'vadodara': 'वडोदरा',
  'rajkot': 'राजकोट',
  'guwahati': 'गुवाहाटी',
  'dibrugarh': 'डिब्रूगढ़',
  'silchar': 'सिलचर',
  'jorhat': 'जोरहाट',
  'tezpur': 'तेजपुर',
  'kolkata': 'कोलकाता',
  'howrah': 'हावड़ा',
  'ranchi': 'रांची',
  'jamshedpur': 'जमशेदपुर',
  'dhanbad': 'धनबाद',
  'bokaro': 'बोकारो',
  'raipur': 'रायपुर',
  'bhubaneswar': 'भुवनेश्वर',
  'cuttack': 'कटक',
  'puri': 'पुरी',
  'hyderabad': 'हैदराबाद',
  'bengaluru': 'बेंगलुरु',
  'chennai': 'चेन्नई',
  'thiruvananthapuram': 'तिरुवनंतपुरम',
  'kochi': 'कोच्चि',
  'panaji': 'पणजी',
};

// Build Reverse Maps automatically for 100% consistent bidirectional mapping
const STATES_HI_TO_EN: Record<string, string> = {};
for (const [enKey, hiVal] of Object.entries(STATES_EN_TO_HI)) {
  if (!STATES_HI_TO_EN[hiVal.trim()]) {
    // Title Case English state name
    const titleCased = enKey
      .split(' ')
      .map((w) => (w === '&' || w === 'and' || w === 'of' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
    STATES_HI_TO_EN[hiVal.trim()] = titleCased;
  }
}

const PLACES_HI_TO_EN: Record<string, string> = {};
for (const [enKey, hiVal] of Object.entries(PLACES_EN_TO_HI)) {
  const normHi = hiVal.trim();
  if (!PLACES_HI_TO_EN[normHi]) {
    const titleCased = enKey
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    PLACES_HI_TO_EN[normHi] = titleCased;
  }
}

// Common Indian Place-name compound morpheme suffixes
// Preserves morpheme boundaries so roots like "Pipal" + "sana" don't form conjuncts like "पिपल्साना"
const SUFFIX_RULES: Array<{ en: string; hi: string }> = [
  { en: 'nagar', hi: 'नगर' },
  { en: 'pur', hi: 'पुर' },
  { en: 'abad', hi: 'बाद' },
  { en: 'bad', hi: 'बाद' },
  { en: 'sana', hi: 'साना' },
  { en: 'garh', hi: 'गढ़' },
  { en: 'ganj', hi: 'गंज' },
  { en: 'sarai', hi: 'सराय' },
  { en: 'kalan', hi: 'कलां' },
  { en: 'khurd', hi: 'खुर्द' },
  { en: 'wala', hi: 'वाला' },
  { en: 'wali', hi: 'वाली' },
  { en: 'gaon', hi: 'गांव' },
  { en: 'khera', hi: 'खेड़ा' },
  { en: 'kheda', hi: 'खेड़ा' },
  { en: 'dih', hi: 'डीह' },
  { en: 'chak', hi: 'चक' },
  { en: 'tola', hi: 'टोला' },
  { en: 'patti', hi: 'पट्टी' },
  { en: 'mandi', hi: 'मंडी' },
  { en: 'bazar', hi: 'बाजार' },
  { en: 'ghat', hi: 'घाट' },
  { en: 'bagh', hi: 'बाग' },
  { en: 'kot', hi: 'कोट' },
  { en: 'wara', hi: 'वाड़ा' },
  { en: 'bari', hi: 'बाड़ी' },
  { en: 'kund', hi: 'कुंड' },
  { en: 'dham', hi: 'धाम' },
  { en: 'tal', hi: 'ताल' },
];

/**
 * Phonetically transliterates a single English word stem to Hindi
 * Following Indian phonology and avoiding unwanted halant on internal liquids/nasals
 */
function transliterateStemEnToHi(word: string): string {
  const w = word.toLowerCase();
  let result = '';
  let i = 0;
  const len = w.length;

  const VOWELS: Record<string, { initial: string; matra: string }> = {
    'aa': { initial: 'आ', matra: 'ा' },
    'a': { initial: 'अ', matra: '' },
    'ee': { initial: 'ई', matra: 'ी' },
    'i': { initial: 'इ', matra: 'ि' },
    'oo': { initial: 'ऊ', matra: 'ू' },
    'u': { initial: 'उ', matra: 'ु' },
    'ai': { initial: 'ऐ', matra: 'ै' },
    'au': { initial: 'औ', matra: 'ौ' },
    'e': { initial: 'ए', matra: 'े' },
    'o': { initial: 'ओ', matra: 'ो' },
  };

  const CONSONANTS: Record<string, string> = {
    'ksh': 'क्ष',
    'shh': 'ष्',
    'chh': 'छ',
    'kh': 'ख',
    'gh': 'घ',
    'ch': 'च',
    'jh': 'झ',
    'th': 'थ',
    'dh': 'ध',
    'ph': 'फ',
    'bh': 'भ',
    'sh': 'श',
    'zh': 'ज़',
    'rh': 'ढ़',
    'gy': 'ज्ञ',
    'tr': 'त्र',
    'k': 'क',
    'g': 'ग',
    'c': 'क',
    'j': 'ज',
    'z': 'ज़',
    't': 'त',
    'd': 'द',
    'n': 'न',
    'p': 'प',
    'f': 'फ',
    'b': 'ब',
    'm': 'म',
    'y': 'य',
    'r': 'र',
    'l': 'ल',
    'v': 'व',
    'w': 'व',
    's': 'स',
    'h': 'ह',
    'q': 'क',
    'x': 'क्स',
  };

  let prevWasConsonant = false;

  while (i < len) {
    // 1. Check 3-char consonants
    const sub3 = w.slice(i, i + 3);
    const sub2 = w.slice(i, i + 2);
    const sub1 = w.slice(i, i + 1);

    // Vowels check
    let matchedVowel = false;
    for (const vKey of ['aa', 'ee', 'oo', 'ai', 'au', 'a', 'i', 'u', 'e', 'o']) {
      if (w.startsWith(vKey, i)) {
        const vObj = VOWELS[vKey];
        if (prevWasConsonant) {
          result += vObj.matra;
        } else {
          result += vObj.initial;
        }
        i += vKey.length;
        prevWasConsonant = false;
        matchedVowel = true;
        break;
      }
    }
    if (matchedVowel) continue;

    // Consonants check
    let matchedConsonant = false;
    for (const cKey of ['ksh', 'chh', 'shh', 'kh', 'gh', 'ch', 'jh', 'th', 'dh', 'ph', 'bh', 'sh', 'zh', 'rh', 'gy', 'tr', 'k', 'g', 'c', 'j', 'z', 't', 'd', 'n', 'p', 'f', 'b', 'm', 'y', 'r', 'l', 'v', 'w', 's', 'h', 'q', 'x']) {
      if (w.startsWith(cKey, i)) {
        const devanagariConsonant = CONSONANTS[cKey];

        // If previous was a consonant, in Indian place names we avoid halant for liquid/nasal morphemes
        // unless it's a known conjunct prefix (like 'pr', 'tr', 'kr', 'st')
        if (prevWasConsonant) {
          const prevChar = w[i - 1];
          const isCluster = (prevChar === 's' || prevChar === 'k' || prevChar === 'p' || prevChar === 't') && (cKey === 'r' || cKey === 'l' || cKey === 't');
          if (isCluster) {
            result += '्';
          }
        }

        result += devanagariConsonant;
        i += cKey.length;
        prevWasConsonant = true;
        matchedConsonant = true;
        break;
      }
    }
    if (matchedConsonant) continue;

    // Fallback for non-alphabetic
    result += sub1;
    i++;
    prevWasConsonant = false;
  }

  return result;
}

/**
 * Phonetically transliterates an Indian place name from English to Hindi
 */
export function transliteratePlaceEnToHi(input: string): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();

  // If already contains Devanagari script, return as-is
  if (isDevanagari(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  // 1. Direct State Match
  if (STATES_EN_TO_HI[lower]) {
    return STATES_EN_TO_HI[lower];
  }

  // 2. Direct Place/District Match
  if (PLACES_EN_TO_HI[lower]) {
    return PLACES_EN_TO_HI[lower];
  }

  // 3. Multi-word phrase splitting (e.g. "Pipalsana Mustahkam", "Moradabad Rural", "Sri Ganganagar")
  if (trimmed.includes(' ')) {
    const words = trimmed.split(/\s+/);
    const translatedWords = words.map((word) => transliteratePlaceEnToHi(word));
    return translatedWords.join(' ');
  }

  // 4. Suffix splitting with morpheme boundary preservation
  // e.g. "Pipalsana" -> stem "pipal" + suffix "sana" -> "पिपल" + "साना" = "पिपलसाना"
  for (const rule of SUFFIX_RULES) {
    if (lower.length > rule.en.length + 2 && lower.endsWith(rule.en)) {
      const stem = lower.slice(0, lower.length - rule.en.length);
      // Check if stem is a known place or root (e.g. "pipal", "ram", "bhagwan")
      let stemHi = PLACES_EN_TO_HI[stem];
      if (!stemHi) {
        stemHi = transliterateStemEnToHi(stem);
      }
      return `${stemHi}${rule.hi}`;
    }
  }

  // 5. Fallback stem transliteration
  return transliterateStemEnToHi(trimmed);
}

/**
 * Transliterates Devanagari Hindi place name to English
 */
export function transliteratePlaceHiToEn(input: string): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();

  // If does not contain Devanagari script, already in Latin/English
  if (!isDevanagari(trimmed)) {
    return trimmed;
  }

  // 1. State lookup
  if (STATES_HI_TO_EN[trimmed]) {
    return STATES_HI_TO_EN[trimmed];
  }

  // 2. Place / District lookup
  if (PLACES_HI_TO_EN[trimmed]) {
    return PLACES_HI_TO_EN[trimmed];
  }

  // 3. Multi-word lookup
  if (trimmed.includes(' ')) {
    const words = trimmed.split(/\s+/);
    const enWords = words.map((w) => transliteratePlaceHiToEn(w));
    return enWords.join(' ');
  }

  // 4. Rule-based Devanagari to English phonetic mapping
  const DEV_TO_LATIN: Record<string, string> = {
    'अ': 'A', 'आ': 'Aa', 'इ': 'I', 'ई': 'Ee', 'उ': 'U', 'ऊ': 'Oo', 'ऋ': 'Ri',
    'ए': 'E', 'ऐ': 'Ai', 'ओ': 'O', 'औ': 'Au', 'अं': 'An', 'अः': 'Ah',
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy', 'श्र': 'shr',
    'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'ज़': 'z',
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h',
    '्': '',
  };

  let out = '';
  const chars = Array.from(trimmed);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];

    if (DEV_TO_LATIN[c] !== undefined) {
      out += DEV_TO_LATIN[c];
      // Inherent 'a' handling: If c is a consonant and next is not a matra or virama or end of word
      const isConsonant = /[\u0915-\u0939\u0958-\u095F]/.test(c);
      const nextIsMatraOrHalant = next && /[\u093E-\u094D\u0902\u0903]/.test(next);
      if (isConsonant && !nextIsMatraOrHalant && next) {
        out += 'a';
      }
    } else {
      out += c;
    }
  }

  // Capitalize first letter
  if (out.length > 0) {
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

/**
 * Universal display-layer place-name localizer
 * Converts to Hindi or English based on selected UI language
 * Never modifies or replaces the source value
 */
export function localizePlaceName(name?: string | null, targetLang: 'hi' | 'en' = 'hi'): string {
  if (!name || !name.trim()) return '';
  const trimmed = name.trim();

  if (targetLang === 'hi') {
    return transliteratePlaceEnToHi(trimmed);
  }

  return transliteratePlaceHiToEn(trimmed);
}
