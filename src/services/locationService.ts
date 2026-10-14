import { UserLocation } from '../types';
import { localizePlaceName } from './locationTransliteration';

export interface LocationStateItem {
  name: string;
  nameHi?: string;
}

export interface LocationDistrictItem {
  name: string;
  nameHi?: string;
}

export interface LocationSubdistrictItem {
  name: string;
  nameHi?: string;
}

export interface LocationVillageItem {
  name: string;
  nameHi?: string;
  latitude?: number;
  longitude?: number;
}

export interface VillagesResponse {
  villages: LocationVillageItem[];
  total: number;
}

export interface GetVillagesParams {
  state: string;
  district: string;
  subdistrict: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Raw state JSON schema from repository
interface RawSubDistrict {
  subDistrict: string;
  villages: string[];
}

interface RawDistrict {
  district: string;
  subDistricts: RawSubDistrict[];
}

interface RawStateData {
  state: string;
  districts: RawDistrict[];
}

// Complete list of 36 States & Union Territories of India
export const ALL_INDIA_STATES: LocationStateItem[] = [
  { name: 'Andaman & Nicobar Islands', nameHi: 'अंडमान और निकोबार द्वीप समूह' },
  { name: 'Andhra Pradesh', nameHi: 'आंध्र प्रदेश' },
  { name: 'Arunachal Pradesh', nameHi: 'अरुणाचल प्रदेश' },
  { name: 'Assam', nameHi: 'असम' },
  { name: 'Bihar', nameHi: 'बिहार' },
  { name: 'Chandigarh', nameHi: 'चंडीगढ़' },
  { name: 'Chhattisgarh', nameHi: 'छत्तीसगढ़' },
  { name: 'Dadra & Nagar Haveli', nameHi: 'दादरा और नगर हवेली' },
  { name: 'Daman & Diu', nameHi: 'दमन और दीव' },
  { name: 'Delhi', nameHi: 'दिल्ली' },
  { name: 'Goa', nameHi: 'गोवा' },
  { name: 'Gujarat', nameHi: 'गुजरात' },
  { name: 'Haryana', nameHi: 'हरियाणा' },
  { name: 'Himachal Pradesh', nameHi: 'हिमाचल प्रदेश' },
  { name: 'Jammu & Kashmir', nameHi: 'जम्मू और कश्मीर' },
  { name: 'Jharkhand', nameHi: 'झारखंड' },
  { name: 'Karnataka', nameHi: 'कर्नाटक' },
  { name: 'Kerala', nameHi: 'केरल' },
  { name: 'Lakshadweep', nameHi: 'लक्षद्वीप' },
  { name: 'Madhya Pradesh', nameHi: 'मध्य प्रदेश' },
  { name: 'Maharashtra', nameHi: 'महाराष्ट्र' },
  { name: 'Manipur', nameHi: 'मणिपुर' },
  { name: 'Meghalaya', nameHi: 'मेघालय' },
  { name: 'Mizoram', nameHi: 'मिज़ोरम' },
  { name: 'Nagaland', nameHi: 'नागालैंड' },
  { name: 'Odisha', nameHi: 'ओडिशा' },
  { name: 'Puducherry', nameHi: 'पुडुचेरी' },
  { name: 'Punjab', nameHi: 'पंजाब' },
  { name: 'Rajasthan', nameHi: 'राजस्थान' },
  { name: 'Sikkim', nameHi: 'सिक्किम' },
  { name: 'Tamil Nadu', nameHi: 'तमिलनाडु' },
  { name: 'Telangana', nameHi: 'तेलंगाना' },
  { name: 'Tripura', nameHi: 'त्रिपुरा' },
  { name: 'Uttar Pradesh', nameHi: 'उत्तर प्रदेश' },
  { name: 'Uttarakhand', nameHi: 'उत्तराखंड' },
  { name: 'West Bengal', nameHi: 'पश्चिम बंगाल' },
];

// Comprehensive verified static districts mapping for all 36 States & UTs
// Guarantees instant 0ms dropdown loading and 100% offline resilience
export const STATIC_STATE_DISTRICTS: Record<string, string[]> = {
  'Andaman & Nicobar Islands': ['Nicobar', 'North and Middle Andaman', 'South Andaman'],
  'Andhra Pradesh': [
    'Alluri Sitharama Raju', 'Anakapalli', 'Ananthapuramu', 'Annamayya', 'Bapatla',
    'Chittoor', 'Dr. B.R. Ambedkar Konaseema', 'East Godavari', 'Eluru', 'Guntur',
    'Kakinada', 'Krishna', 'Kurnool', 'Nandyal', 'NTR', 'Palnadu',
    'Parvathipuram Manyam', 'Prakasam', 'Srikakulam', 'Sri Potti Sriramulu Nellore',
    'Sri Sathya Sai', 'Tirupati', 'Visakhapatnam', 'Vizianagaram', 'West Godavari', 'YSR Kadapa'
  ],
  'Arunachal Pradesh': [
    'Anjaw', 'Changlang', 'Dibang Valley', 'East Kameng', 'East Siang', 'Itanagar',
    'Kamle', 'Kra Daadi', 'Kurung Kumey', 'Lepa Rada', 'Lohit', 'Longding',
    'Lower Dibang Valley', 'Lower Siang', 'Lower Subansiri', 'Namsai', 'Pakke Kessang',
    'Papum Pare', 'Shi Yomi', 'Siang', 'Tawang', 'Tirap', 'Upper Siang',
    'Upper Subansiri', 'West Kameng', 'West Siang'
  ],
  'Assam': [
    'Baksa', 'Bajali', 'Barpeta', 'Biswanath', 'Bongaigaon', 'Cachar', 'Charaideo',
    'Chirang', 'Darrang', 'Dhemaji', 'Dhubri', 'Dibrugarh', 'Dima Hasao', 'Goalpara',
    'Golaghat', 'Hailakandi', 'Hojai', 'Jorhat', 'Kamrup', 'Kamrup Metropolitan',
    'Karbi Anglong', 'Karimganj', 'Kokrajhar', 'Lakhimpur', 'Majuli', 'Morigaon',
    'Nagaon', 'Nalbari', 'Sivasagar', 'Sonitpur', 'South Salmara-Mankachar',
    'Tamulpur', 'Tinsukia', 'Udalguri', 'West Karbi Anglong'
  ],
  'Bihar': [
    'Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur',
    'Buxar', 'Darbhanga', 'East Champaran', 'Gaya', 'Gopalganj', 'Jamui', 'Jehanabad',
    'Kaimur', 'Katihar', 'Khagaria', 'Kishanganj', 'Lakhisarai', 'Madhepura',
    'Madhubani', 'Munger', 'Muzaffarpur', 'Nalanda', 'Nawada', 'Patna', 'Purnia',
    'Rohtas', 'Saharsa', 'Samastipur', 'Saran', 'Sheikhpura', 'Sheohar', 'Sitamarhi',
    'Siwan', 'Supaul', 'Vaishali', 'West Champaran'
  ],
  'Chandigarh': ['Chandigarh'],
  'Chhattisgarh': [
    'Balod', 'Baloda Bazar', 'Balrampur', 'Bastar', 'Bemetara', 'Bijapur', 'Bilaspur',
    'Dantewada', 'Dhamtari', 'Durg', 'Gariaband', 'Gaurela-Pendra-Marwahi', 'Janjgir-Champa',
    'Jashpur', 'Kabirdham', 'Kanker', 'Khairagarh-Chhuikhadan-Gandai', 'Kondagaon',
    'Korba', 'Koriya', 'Mahasamund', 'Manendragarh-Chirmiri-Bharatpur',
    'Mohla-Manpur-Ambagarh Chowki', 'Mungeli', 'Narayanpur', 'Raigarh', 'Raipur',
    'Rajnandgaon', 'Sarangarh-Bilaigarh', 'Sakti', 'Sukma', 'Surajpur', 'Surguja'
  ],
  'Dadra & Nagar Haveli': ['Dadra and Nagar Haveli'],
  'Daman & Diu': ['Daman', 'Diu'],
  'Delhi': [
    'Central Delhi', 'East Delhi', 'New Delhi', 'North Delhi', 'North East Delhi',
    'North West Delhi', 'Shahdara', 'South Delhi', 'South East Delhi', 'South West Delhi', 'West Delhi'
  ],
  'Goa': ['North Goa', 'South Goa'],
  'Gujarat': [
    'Ahmedabad', 'Amreli', 'Anand', 'Aravalli', 'Banaskantha', 'Bharuch', 'Bhavnagar',
    'Botad', 'Chhota Udaipur', 'Dahod', 'Dang', 'Devbhoomi Dwarka', 'Gandhinagar',
    'Gir Somnath', 'Jamnagar', 'Junagadh', 'Kheda', 'Kutch', 'Mahisagar', 'Mehsana',
    'Morbi', 'Narmada', 'Navsari', 'Panchmahal', 'Patan', 'Porbandar', 'Rajkot',
    'Sabarkantha', 'Surat', 'Surendranagar', 'Tapi', 'Vadodara', 'Valsad'
  ],
  'Haryana': [
    'Ambala', 'Bhiwani', 'Charkhi Dadri', 'Faridabad', 'Fatehabad', 'Gurugram',
    'Hisar', 'Jhajjar', 'Jind', 'Kaithal', 'Karnal', 'Kurukshetra', 'Mahendragarh',
    'Nuh', 'Palwal', 'Panchkula', 'Panipat', 'Rewari', 'Rohtak', 'Sirsa', 'Sonipat', 'Yamunanagar'
  ],
  'Himachal Pradesh': [
    'Bilaspur', 'Chamba', 'Hamirpur', 'Kangra', 'Kinnaur', 'Kullu', 'Lahaul and Spiti',
    'Mandi', 'Shimla', 'Sirmaur', 'Solan', 'Una'
  ],
  'Jammu & Kashmir': [
    'Anantnag', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Jammu',
    'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri',
    'Ramban', 'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur'
  ],
  'Jharkhand': [
    'Bokaro', 'Chatra', 'Deoghar', 'Dhanbad', 'Dumka', 'East Singhbhum', 'Garhwa',
    'Giridih', 'Godda', 'Gumla', 'Hazaribagh', 'Jamtara', 'Khunti', 'Koderma',
    'Latehar', 'Lohardaga', 'Pakur', 'Palamu', 'Ramgarh', 'Ranchi', 'Sahebganj',
    'Seraikela Kharsawan', 'Simdega', 'West Singhbhum'
  ],
  'Karnataka': [
    'Bagalkot', 'Ballari', 'Belagavi', 'Bengaluru Rural', 'Bengaluru Urban', 'Bidar',
    'Chamarajanagar', 'Chikkaballapura', 'Chikkamagaluru', 'Chitradurga', 'Dakshina Kannada',
    'Davanagere', 'Dharwad', 'Gadag', 'Hassan', 'Haveri', 'Kalaburagi', 'Kodagu',
    'Kolar', 'Koppal', 'Mandya', 'Mysuru', 'Raichur', 'Ramanagara', 'Shivamogga',
    'Tumakuru', 'Udupi', 'Uttara Kannada', 'Vijayanagara', 'Vijayapura', 'Yadgir'
  ],
  'Kerala': [
    'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam', 'Kottayam',
    'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta', 'Thiruvananthapuram', 'Thrissur', 'Wayanad'
  ],
  'Lakshadweep': ['Lakshadweep'],
  'Madhya Pradesh': [
    'Agar Malwa', 'Alirajpur', 'Anuppur', 'Ashoknagar', 'Balaghat', 'Barwani', 'Betul',
    'Bhind', 'Bhopal', 'Burhanpur', 'Chhatarpur', 'Chhindwara', 'Damoh', 'Datia',
    'Dewas', 'Dhar', 'Dindori', 'Guna', 'Gwalior', 'Harda', 'Hoshangabad (Narmadapuram)',
    'Indore', 'Jabalpur', 'Jhabua', 'Katni', 'Khandwa', 'Khargone', 'Maihar', 'Mandla',
    'Mandsaur', 'Mauganj', 'Morena', 'Narsinghpur', 'Neemuch', 'Niwari', 'Pandhurna',
    'Panna', 'Raisen', 'Rajgarh', 'Ratlam', 'Rewa', 'Sagar', 'Satna', 'Sehore',
    'Seoni', 'Shahdol', 'Shajapur', 'Sheopur', 'Shivpuri', 'Sidhi', 'Singrauli',
    'Tikamgarh', 'Ujjain', 'Umaria', 'Vidisha'
  ],
  'Maharashtra': [
    'Ahmednagar (Ahilyanagar)', 'Akola', 'Amravati', 'Chhatrapati Sambhajinagar (Aurangabad)',
    'Beed', 'Bhandara', 'Buldhana', 'Chandrapur', 'Dhule', 'Gadchiroli', 'Gondia',
    'Hingoli', 'Jalgaon', 'Jalna', 'Kolhapur', 'Latur', 'Mumbai City', 'Mumbai Suburban',
    'Nagpur', 'Nanded', 'Nandurbar', 'Nashik', 'Osmanabad (Dharashiv)', 'Palghar',
    'Parbhani', 'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara', 'Sindhudurg',
    'Solapur', 'Thane', 'Wardha', 'Washim', 'Yavatmal'
  ],
  'Manipur': [
    'Bishnupur', 'Chandel', 'Churachandpur', 'Imphal East', 'Imphal West', 'Jiribam',
    'Kakching', 'Kamjong', 'Kangpokpi', 'Noney', 'Pherzawl', 'Senapati', 'Tamenglong',
    'Tengnoupal', 'Thoubal', 'Ukhrul'
  ],
  'Meghalaya': [
    'East Garo Hills', 'East Jaintia Hills', 'East Khasi Hills', 'Eastern West Khasi Hills',
    'North Garo Hills', 'Ri Bhoi', 'South Garo Hills', 'South West Garo Hills',
    'South West Khasi Hills', 'West Garo Hills', 'West Jaintia Hills', 'West Khasi Hills'
  ],
  'Mizoram': [
    'Aizawl', 'Champhai', 'Hnahthial', 'Khawzawl', 'Kolasib', 'Lawngtlai',
    'Lunglei', 'Mamit', 'Saiha', 'Saitual', 'Serchhip'
  ],
  'Nagaland': [
    'Chümoukedima', 'Dimapur', 'Kiphire', 'Kohima', 'Longleng', 'Mokokchung',
    'Mon', 'Niuland', 'Noklak', 'Peren', 'Phek', 'Shamator', 'Tseminyü',
    'Tuensang', 'Wokha', 'Zünheboto'
  ],
  'Odisha': [
    'Angul', 'Balangir', 'Balasore', 'Bargarh', 'Bhadrak', 'Boudh', 'Cuttack',
    'Deogarh', 'Dhenkanal', 'Gajapati', 'Ganjam', 'Jagatsinghpur', 'Jajpur',
    'Jharsuguda', 'Kalahandi', 'Kandhamal', 'Kendrapara', 'Kendujhar', 'Khordha',
    'Koraput', 'Malkangiri', 'Mayurbhanj', 'Nabarangpur', 'Nayagarh', 'Nuapada',
    'Puri', 'Rayagada', 'Sambalpur', 'Subarnapur', 'Sundargarh'
  ],
  'Puducherry': ['Karaikal', 'Mahe', 'Puducherry', 'Yanam'],
  'Punjab': [
    'Amritsar', 'Barnala', 'Bathinda', 'Faridkot', 'Fatehgarh Sahib', 'Fazilka',
    'Ferozepur', 'Gurdaspur', 'Hoshiarpur', 'Jalandhar', 'Kapurthala', 'Ludhiana',
    'Malerkotla', 'Mansa', 'Moga', 'Muktsar', 'Pathankot', 'Patiala', 'Rupnagar',
    'Sahibzada Ajit Singh Nagar (Mohali)', 'Sangrur', 'Shahid Bhagat Singh Nagar (Nawanshahr)', 'Tarn Taran'
  ],
  'Rajasthan': [
    'Ajmer', 'Alwar', 'Anupgarh', 'Balotra', 'Banswara', 'Baran', 'Barmer', 'Beawar',
    'Bharatpur', 'Bhilwara', 'Bikaner', 'Bundi', 'Chittorgarh', 'Churu', 'Dausa',
    'Deeg', 'Dholpur', 'Didwana-Kuchaman', 'Dudu', 'Dungarpur', 'Gangapur City',
    'Hanumangarh', 'Jaipur', 'Jaipur Rural', 'Jaisalmer', 'Jalore', 'Jhalawar',
    'Jhunjhunu', 'Jodhpur', 'Jodhpur Rural', 'Karauli', 'Kekri', 'Khairthal-Tijara',
    'Kota', 'Kotputli-Behror', 'Nagaur', 'Neem Ka Thana', 'Pali', 'Phalodi',
    'Pratapgarh', 'Rajsamand', 'Salumbar', 'Sanchore', 'Sawai Madhopur', 'Shahpura',
    'Sikar', 'Sirohi', 'Sri Ganganagar', 'Tonk', 'Udaipur'
  ],
  'Sikkim': ['Gangtok', 'Gyalshing', 'Mangan', 'Namchi', 'Pakyong', 'Soreng'],
  'Tamil Nadu': [
    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
    'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur',
    'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal',
    'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem',
    'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli',
    'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
    'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar'
  ],
  'Telangana': [
    'Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagtial',
    'Jangaon', 'Jayashankar Bhupalpally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar',
    'Khammam', 'Kumuram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar', 'Mancherial',
    'Medak', 'Medchal-Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet',
    'Nirmal', 'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 'Ranga Reddy',
    'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad', 'Wanaparthy', 'Warangal', 'Yadadri Bhuvanagiri'
  ],
  'Tripura': [
    'Dhalai', 'Gomati', 'Khowai', 'North Tripura', 'Sepahijala', 'South Tripura', 'Unakoti', 'West Tripura'
  ],
  'Uttar Pradesh': [
    'Agra', 'Aligarh', 'Ambedkar Nagar', 'Amethi', 'Amroha (Jyotiba Phule Nagar)',
    'Auraiya', 'Ayodhya', 'Azamgarh', 'Baghpat', 'Bahraich', 'Ballia', 'Balrampur',
    'Banda', 'Barabanki', 'Bareilly', 'Basti', 'Bhadohi', 'Bijnor', 'Budaun',
    'Bulandshahr', 'Chandauli', 'Chitrakoot', 'Deoria', 'Etah', 'Etawah',
    'Farrukhabad', 'Fatehpur', 'Firozabad', 'Gautam Buddha Nagar (Noida)', 'Ghaziabad',
    'Ghazipur', 'Gonda', 'Gorakhpur', 'Hamirpur', 'Hapur', 'Hardoi', 'Hathras',
    'Jalaun', 'Jaunpur', 'Jhansi', 'Kannauj', 'Kanpur Dehat', 'Kanpur Nagar',
    'Kasganj', 'Kaushambi', 'Kheri (Lakhimpur Kheri)', 'Kushinagar', 'Lalitpur',
    'Lucknow', 'Maharajganj', 'Mahoba', 'Mainpuri', 'Mathura', 'Mau', 'Meerut',
    'Mirzapur', 'Moradabad', 'Muzaffarnagar', 'Pilibhit', 'Pratapgarh',
    'Prayagraj (Allahabad)', 'Raebareli', 'Rampur', 'Saharanpur', 'Sambhal',
    'Sant Kabir Nagar', 'Shahjahanpur', 'Shamli', 'Shravasti', 'Siddharthnagar',
    'Sitapur', 'Sonbhadra', 'Sultanpur', 'Unnao', 'Varanasi'
  ],
  'Uttarakhand': [
    'Almora', 'Bageshwar', 'Chamoli', 'Champawat', 'Dehradun', 'Haridwar',
    'Nainital', 'Pauri Garhwal', 'Pithoragarh', 'Rudraprayag', 'Tehri Garhwal',
    'Udham Singh Nagar', 'Uttarkashi'
  ],
  'West Bengal': [
    'Alipurduar', 'Bankura', 'Birbhum', 'Cooch Behar', 'Dakshin Dinajpur',
    'Darjeeling', 'Hooghly', 'Howrah', 'Jalpaiguri', 'Jhargram', 'Kalimpong',
    'Kolkata', 'Malda', 'Murshidabad', 'Nadia', 'North 24 Parganas',
    'Paschim Bardhaman', 'Paschim Medinipur', 'Purba Bardhaman', 'Purba Medinipur',
    'Purulia', 'South 24 Parganas', 'Uttar Dinajpur'
  ]
};

// Base URL for state-wise JSON files from the verified reference repository
const REPO_BASE_URL =
  'https://raw.githubusercontent.com/pranshumaheshwari/indian-cities-and-villages/master/By%20States';

// In-memory cache for state data to prevent repeated network requests
const stateDataCache = new Map<string, RawStateData>();

// In-flight fetch promises to prevent parallel duplicate requests for the same state
const pendingStateFetches = new Map<string, Promise<RawStateData | null>>();

// In-memory geocode cache to avoid duplicate OSM Nominatim calls
const geocodeCache = new Map<string, { latitude: number; longitude: number } | null>();

// Minimum delay between OSM Nominatim requests to strictly respect rate limits
let lastNominatimRequestTime = 0;
async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimRequestTime = Date.now();
}

// Known verified coordinates for Indian administrative districts (Local fallback)
const VERIFIED_DISTRICT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  // Current worker districts & subdistricts
  'begusarai': { latitude: 25.5125, longitude: 86.0883 },
  'bhagwanpur': { latitude: 25.5664, longitude: 85.9892 },
  'mandi': { latitude: 31.7087, longitude: 76.9320 },
  'lad bharol': { latitude: 31.9584, longitude: 76.7138 },
  'dhemaji': { latitude: 27.4839, longitude: 94.5779 },
  'gogamukh': { latitude: 27.4321, longitude: 94.3781 },
  'kishtwar': { latitude: 33.3129, longitude: 75.7661 },
  'kuchal': { latitude: 33.3822, longitude: 75.6106 },
  'kathua': { latitude: 32.3688, longitude: 75.5212 },
  'billawar': { latitude: 32.6077, longitude: 75.5949 },

  // Uttar Pradesh
  'moradabad': { latitude: 28.8351, longitude: 78.7747 },
  'amroha': { latitude: 28.9044, longitude: 78.4674 },
  'jyotiba phule nagar': { latitude: 28.9044, longitude: 78.4674 },
  'bareilly': { latitude: 28.3670, longitude: 79.4304 },
  'rampur': { latitude: 28.8154, longitude: 79.0257 },
  'sambhal': { latitude: 28.5833, longitude: 78.5667 },
  'bijnor': { latitude: 29.3724, longitude: 78.1358 },
  'meerut': { latitude: 28.9845, longitude: 77.7064 },
  'ghaziabad': { latitude: 28.6692, longitude: 77.4538 },
  'noida': { latitude: 28.5355, longitude: 77.3910 },
  'gautam buddha nagar': { latitude: 28.5355, longitude: 77.3910 },
  'lucknow': { latitude: 26.8467, longitude: 80.9462 },
  'kanpur': { latitude: 26.4499, longitude: 80.3319 },
  'kanpur nagar': { latitude: 26.4499, longitude: 80.3319 },
  'kanpur dehat': { latitude: 26.4172, longitude: 79.9575 },
  'varanasi': { latitude: 25.3176, longitude: 82.9739 },
  'prayagraj': { latitude: 25.4358, longitude: 81.8463 },
  'allahabad': { latitude: 25.4358, longitude: 81.8463 },
  'agra': { latitude: 27.1767, longitude: 78.0081 },
  'aligarh': { latitude: 27.8974, longitude: 78.0880 },
  'mathura': { latitude: 27.4924, longitude: 77.6737 },
  'ayodhya': { latitude: 26.7922, longitude: 82.1998 },
  'faizabad': { latitude: 26.7730, longitude: 82.1460 },
  'gorakhpur': { latitude: 26.7606, longitude: 83.3732 },
  'jhansi': { latitude: 25.4484, longitude: 78.5685 },
  'saharanpur': { latitude: 29.9679, longitude: 77.5452 },
  'muzaffarnagar': { latitude: 29.4727, longitude: 77.7085 },
  'bulandshahr': { latitude: 28.4070, longitude: 77.8498 },
  'etawah': { latitude: 26.7769, longitude: 79.0238 },
  'firozabad': { latitude: 27.1593, longitude: 78.3957 },
  'hapur': { latitude: 28.7306, longitude: 77.7759 },
  'mainpuri': { latitude: 27.2288, longitude: 79.0270 },
  'mirzapur': { latitude: 25.1337, longitude: 82.5644 },
  'pilibhit': { latitude: 28.6318, longitude: 79.8032 },
  'shahjahanpur': { latitude: 27.8814, longitude: 79.9125 },
  'sitapur': { latitude: 27.5684, longitude: 80.6829 },
  'unnao': { latitude: 26.5393, longitude: 80.4878 },
  'azangarh': { latitude: 26.0688, longitude: 83.1859 },
  'azamgarh': { latitude: 26.0688, longitude: 83.1859 },
  'ballia': { latitude: 25.7599, longitude: 84.1497 },
  'basti': { latitude: 26.8120, longitude: 82.7630 },
  'deoria': { latitude: 26.5024, longitude: 83.7791 },
  'jaunpur': { latitude: 25.7464, longitude: 82.6837 },
  'raebareli': { latitude: 26.2236, longitude: 81.2409 },
  'sultanpur': { latitude: 26.2648, longitude: 82.0727 },

  // Bihar
  'patna': { latitude: 25.5941, longitude: 85.1376 },
  'gaya': { latitude: 24.7914, longitude: 85.0002 },
  'bhagalpur': { latitude: 25.2425, longitude: 86.9842 },
  'muzaffarpur': { latitude: 26.1209, longitude: 85.3647 },
  'purnia': { latitude: 25.7771, longitude: 87.4753 },
  'darbhanga': { latitude: 26.1542, longitude: 85.8918 },
  'bihar sharif': { latitude: 25.1982, longitude: 85.5149 },
  'nalanda': { latitude: 25.1357, longitude: 85.4526 },
  'arrah': { latitude: 25.5560, longitude: 84.6603 },
  'bhojpur': { latitude: 25.4600, longitude: 84.5200 },
  'samastipur': { latitude: 25.8628, longitude: 85.7811 },
  'katihar': { latitude: 25.5396, longitude: 87.5707 },
  'munger': { latitude: 25.3757, longitude: 86.4744 },
  'chhapra': { latitude: 25.7796, longitude: 84.7499 },
  'saran': { latitude: 25.9188, longitude: 84.7499 },
  'sasaram': { latitude: 24.9525, longitude: 84.0152 },
  'rohtas': { latitude: 24.9500, longitude: 84.0000 },
  'hajipur': { latitude: 25.6858, longitude: 85.2146 },
  'vaishali': { latitude: 25.9900, longitude: 85.1300 },
  'siwan': { latitude: 26.2200, longitude: 84.3600 },
  'motihari': { latitude: 26.6500, longitude: 84.9200 },
  'east champaran': { latitude: 26.6500, longitude: 84.9200 },
  'bettiah': { latitude: 26.8000, longitude: 84.5000 },
  'west champaran': { latitude: 27.1500, longitude: 84.4500 },
  'aurangabad': { latitude: 24.7500, longitude: 84.3700 },
  'jehanabad': { latitude: 25.2100, longitude: 84.9800 },
  'madhubani': { latitude: 26.3500, longitude: 86.0700 },
  'saharsa': { latitude: 25.8800, longitude: 86.6000 },
  'supaul': { latitude: 26.1200, longitude: 86.6000 },
  'madhepura': { latitude: 25.9200, longitude: 86.7900 },
  'khagaria': { latitude: 25.5000, longitude: 86.4800 },
  'banka': { latitude: 24.8800, longitude: 86.9200 },
  'jamui': { latitude: 24.9200, longitude: 86.2200 },
  'nawada': { latitude: 24.8800, longitude: 85.5400 },
  'buxar': { latitude: 25.5700, longitude: 83.9800 },
  'gopalganj': { latitude: 26.4700, longitude: 84.4400 },
  'sitamarhi': { latitude: 26.6000, longitude: 85.4800 },
  'kishanganj': { latitude: 26.0700, longitude: 87.9500 },
  'araria': { latitude: 26.1500, longitude: 87.5200 },

  // Himachal Pradesh
  'shimla': { latitude: 31.1048, longitude: 77.1734 },
  'kangra': { latitude: 32.0998, longitude: 76.2691 },
  'dharamshala': { latitude: 32.2190, longitude: 76.3234 },
  'kullu': { latitude: 31.9579, longitude: 77.1095 },
  'solan': { latitude: 30.9084, longitude: 77.0999 },
  'hamirpur': { latitude: 31.6862, longitude: 76.5213 },
  'bilaspur': { latitude: 31.3325, longitude: 76.7589 },
  'una': { latitude: 31.4685, longitude: 76.2708 },
  'chamba': { latitude: 32.5534, longitude: 76.1258 },
  'sirmaur': { latitude: 30.5599, longitude: 77.2955 },
  'nahan': { latitude: 30.5599, longitude: 77.2955 },
  'kinnaur': { latitude: 31.6510, longitude: 78.4752 },
  'lahaul and spiti': { latitude: 32.3276, longitude: 77.2341 },

  // Assam
  'guwahati': { latitude: 26.1445, longitude: 91.7362 },
  'kamrup': { latitude: 26.3150, longitude: 91.5975 },
  'kamrup metropolitan': { latitude: 26.1445, longitude: 91.7362 },
  'dibrugarh': { latitude: 27.4728, longitude: 94.9120 },
  'silchar': { latitude: 24.8333, longitude: 92.7789 },
  'cachar': { latitude: 24.8333, longitude: 92.7789 },
  'jorhat': { latitude: 26.7509, longitude: 94.2037 },
  'nagaon': { latitude: 26.3468, longitude: 92.6840 },
  'tinsukia': { latitude: 27.4922, longitude: 95.3468 },
  'tezpur': { latitude: 26.6528, longitude: 92.7926 },
  'sonitpur': { latitude: 26.6528, longitude: 92.7926 },
  'lakhimpur': { latitude: 27.2364, longitude: 94.1037 },
  'north lakhimpur': { latitude: 27.2364, longitude: 94.1037 },
  'sivasagar': { latitude: 26.9826, longitude: 94.6425 },
  'golaghat': { latitude: 26.5239, longitude: 93.9622 },
  'barpeta': { latitude: 26.3211, longitude: 91.0064 },
  'dhubri': { latitude: 26.0207, longitude: 89.9749 },
  'goalpara': { latitude: 26.1772, longitude: 90.6258 },
  'karbi anglong': { latitude: 26.1528, longitude: 93.5813 },
  'darrang': { latitude: 26.4500, longitude: 92.0300 },
  'morigaon': { latitude: 26.2500, longitude: 92.3400 },
  'nalbari': { latitude: 26.4400, longitude: 91.4300 },
  'kokrajhar': { latitude: 26.4000, longitude: 90.2700 },
  'hailakandi': { latitude: 24.6800, longitude: 92.5600 },
  'karimganj': { latitude: 24.8700, longitude: 92.3600 },
  'bongaigaon': { latitude: 26.4800, longitude: 90.5600 },
  'chirang': { latitude: 26.5500, longitude: 90.5000 },
  'baksa': { latitude: 26.6500, longitude: 91.4000 },
  'udalguri': { latitude: 26.7400, longitude: 92.1000 },

  // Jammu & Kashmir
  'srinagar': { latitude: 34.0837, longitude: 74.7973 },
  'jammu': { latitude: 32.7266, longitude: 74.8570 },
  'anantnag': { latitude: 33.7311, longitude: 75.1522 },
  'baramulla': { latitude: 34.2093, longitude: 74.3436 },
  'udhampur': { latitude: 32.9160, longitude: 75.1416 },
  'rajouri': { latitude: 33.3718, longitude: 74.3093 },
  'poonch': { latitude: 33.7667, longitude: 74.0954 },
  'doda': { latitude: 33.1450, longitude: 75.5475 },
  'ramban': { latitude: 33.2435, longitude: 75.1950 },
  'reasi': { latitude: 33.0827, longitude: 74.8329 },
  'samba': { latitude: 32.5593, longitude: 75.1189 },
  'pulwama': { latitude: 33.8741, longitude: 74.8988 },
  'kupwara': { latitude: 34.5262, longitude: 74.2546 },
  'budgam': { latitude: 34.0150, longitude: 74.7200 },
  'ganderbal': { latitude: 34.2162, longitude: 74.7722 },
  'bandipora': { latitude: 34.4225, longitude: 74.6465 },
  'kulgam': { latitude: 33.6450, longitude: 75.0200 },
  'shopian': { latitude: 33.7200, longitude: 74.8300 },

  // Delhi & NCR / Haryana
  'delhi': { latitude: 28.6139, longitude: 77.2090 },
  'new delhi': { latitude: 28.6139, longitude: 77.2090 },
  'central delhi': { latitude: 28.6139, longitude: 77.2090 },
  'east delhi': { latitude: 28.6279, longitude: 77.2784 },
  'north delhi': { latitude: 28.7041, longitude: 77.1025 },
  'north east delhi': { latitude: 28.7180, longitude: 77.2680 },
  'north west delhi': { latitude: 28.7200, longitude: 77.0600 },
  'south delhi': { latitude: 28.5200, longitude: 77.2100 },
  'south east delhi': { latitude: 28.5400, longitude: 77.2800 },
  'south west delhi': { latitude: 28.5800, longitude: 77.0500 },
  'west delhi': { latitude: 28.6500, longitude: 77.1000 },
  'shahdara': { latitude: 28.6700, longitude: 77.2900 },
  'gurugram': { latitude: 28.4595, longitude: 77.0266 },
  'gurgaon': { latitude: 28.4595, longitude: 77.0266 },
  'faridabad': { latitude: 28.4089, longitude: 77.3178 },
  'rohtak': { latitude: 28.8955, longitude: 76.6066 },
  'hisar': { latitude: 29.1492, longitude: 75.7217 },
  'panipat': { latitude: 29.3909, longitude: 76.9635 },
  'karnal': { latitude: 29.6857, longitude: 76.9905 },
  'sonipat': { latitude: 28.9931, longitude: 77.0151 },
  'ambala': { latitude: 30.3782, longitude: 76.7767 },
  'panchkula': { latitude: 30.6942, longitude: 76.8606 },
  'yamunanagar': { latitude: 30.1290, longitude: 77.2674 },
  'kurukshetra': { latitude: 29.9695, longitude: 76.8783 },
  'bhiwani': { latitude: 28.7831, longitude: 76.1397 },
  'sirsa': { latitude: 29.5349, longitude: 75.0286 },
  'jind': { latitude: 29.3140, longitude: 76.3149 },
  'fatehabad': { latitude: 29.5152, longitude: 75.4544 },
  'rewari': { latitude: 28.1834, longitude: 76.6186 },
  'palwal': { latitude: 28.1447, longitude: 77.3260 },
  'kaithal': { latitude: 29.8015, longitude: 76.3996 },
  'jhajjar': { latitude: 28.6064, longitude: 76.6565 },
  'charkhi dadri': { latitude: 28.5921, longitude: 76.2653 },
  'mewat': { latitude: 27.9935, longitude: 77.0420 },
  'nuh': { latitude: 27.9935, longitude: 77.0420 },

  // Punjab
  'chandigarh': { latitude: 30.7333, longitude: 76.7794 },
  'ludhiana': { latitude: 30.9010, longitude: 75.8573 },
  'amritsar': { latitude: 31.6340, longitude: 74.8723 },
  'jalandhar': { latitude: 31.3260, longitude: 75.5762 },
  'patiala': { latitude: 30.3398, longitude: 76.3869 },
  'bathinda': { latitude: 30.2110, longitude: 74.9455 },
  'mohali': { latitude: 30.7046, longitude: 76.7179 },
  'hoshiarpur': { latitude: 31.5143, longitude: 75.9115 },
  'pathankot': { latitude: 32.2643, longitude: 75.6527 },
  'moga': { latitude: 30.8230, longitude: 75.1734 },
  'batala': { latitude: 31.8186, longitude: 75.2028 },
  'firozpur': { latitude: 30.9237, longitude: 74.6139 },
  'kapurthala': { latitude: 31.3802, longitude: 75.3814 },
  'sangrur': { latitude: 30.2458, longitude: 75.8421 },

  // Rajasthan
  'jaipur': { latitude: 26.9124, longitude: 75.7873 },
  'jodhpur': { latitude: 26.2389, longitude: 73.0243 },
  'kota': { latitude: 25.2138, longitude: 75.8648 },
  'bikaner': { latitude: 28.0229, longitude: 73.3119 },
  'ajmer': { latitude: 26.4499, longitude: 74.6399 },
  'udaipur': { latitude: 24.5854, longitude: 73.7125 },
  'bhilwara': { latitude: 25.3407, longitude: 74.6313 },
  'alwar': { latitude: 27.5530, longitude: 76.6346 },
  'bharatpur': { latitude: 27.2152, longitude: 77.5030 },
  'sikar': { latitude: 27.6094, longitude: 75.1398 },
  'pali': { latitude: 25.7711, longitude: 73.3234 },
  'sri ganganagar': { latitude: 29.9094, longitude: 73.8799 },
  'hanumangarh': { latitude: 29.5818, longitude: 74.3294 },
  'chittorgarh': { latitude: 24.8887, longitude: 74.6269 },
  'nagaur': { latitude: 27.2000, longitude: 73.7400 },
  'jhunjhunu': { latitude: 28.1300, longitude: 75.4000 },
  'churu': { latitude: 28.2900, longitude: 74.9600 },
  'barmer': { latitude: 25.7500, longitude: 71.3900 },
  'jaisalmer': { latitude: 26.9157, longitude: 70.9083 },

  // Madhya Pradesh
  'bhopal': { latitude: 23.2599, longitude: 77.4126 },
  'indore': { latitude: 22.7196, longitude: 75.8577 },
  'jabalpur': { latitude: 23.1815, longitude: 79.9864 },
  'gwalior': { latitude: 26.2183, longitude: 78.1828 },
  'ujjain': { latitude: 23.1765, longitude: 75.7885 },
  'sagar': { latitude: 23.8388, longitude: 78.7378 },
  'satna': { latitude: 24.6005, longitude: 80.8322 },
  'rewa': { latitude: 24.5362, longitude: 81.3037 },
  'ratlam': { latitude: 23.3315, longitude: 75.0367 },

  // Maharashtra
  'mumbai': { latitude: 19.0760, longitude: 72.8777 },
  'pune': { latitude: 18.5204, longitude: 73.8567 },
  'nagpur': { latitude: 21.1458, longitude: 79.0882 },
  'thane': { latitude: 19.2183, longitude: 72.9781 },
  'nashik': { latitude: 19.9975, longitude: 73.7898 },
  'chhatrapati sambhajinagar': { latitude: 19.8762, longitude: 75.3433 },
  'sambhajinagar': { latitude: 19.8762, longitude: 75.3433 },
  'solapur': { latitude: 17.6599, longitude: 75.9064 },
  'amravati': { latitude: 20.9374, longitude: 77.7796 },
  'kolhapur': { latitude: 16.7050, longitude: 74.2433 },
  'navi mumbai': { latitude: 19.0330, longitude: 73.0297 },

  // Gujarat
  'ahmedabad': { latitude: 23.0225, longitude: 72.5714 },
  'surat': { latitude: 21.1702, longitude: 72.8311 },
  'vadodara': { latitude: 22.3072, longitude: 73.1812 },
  'rajkot': { latitude: 22.3039, longitude: 70.8022 },
  'bhavnagar': { latitude: 21.7645, longitude: 72.1519 },
  'jamnagar': { latitude: 22.4707, longitude: 70.0577 },
  'gandhinagar': { latitude: 23.2156, longitude: 72.6369 },
  'junagadh': { latitude: 21.5222, longitude: 70.4579 },
  'anand': { latitude: 22.5645, longitude: 72.9289 },
  'kheda': { latitude: 22.7034, longitude: 72.6265 },

  // South & Eastern States
  'bengaluru': { latitude: 12.9716, longitude: 77.5946 },
  'hyderabad': { latitude: 17.3850, longitude: 78.4867 },
  'chennai': { latitude: 13.0827, longitude: 80.2707 },
  'kolkata': { latitude: 22.5726, longitude: 88.3639 },
  'bhubaneswar': { latitude: 20.2961, longitude: 85.8245 },
  'cuttack': { latitude: 20.4625, longitude: 85.8828 },
  'puri': { latitude: 19.8135, longitude: 85.8312 },
  'ranchi': { latitude: 23.3441, longitude: 85.3096 },
  'jamshedpur': { latitude: 22.8046, longitude: 86.2029 },
  'dhanbad': { latitude: 23.7957, longitude: 86.4304 },
  'latehar': { latitude: 23.7438, longitude: 84.5028 },
  'deoghar': { latitude: 24.4826, longitude: 86.6974 },
  'bokaro': { latitude: 23.6693, longitude: 86.1511 },
  'raipur': { latitude: 21.2514, longitude: 81.6296 },
  'bilaspur cg': { latitude: 22.0797, longitude: 82.1409 },
  'durg': { latitude: 21.1904, longitude: 81.2849 },
  'thiruvananthapuram': { latitude: 8.5241, longitude: 76.9366 },
  'kochi': { latitude: 9.9312, longitude: 76.2673 },
  'kozhikode': { latitude: 11.2588, longitude: 75.7804 },
  'south goa': { latitude: 15.2832, longitude: 73.9862 },
  'north goa': { latitude: 15.4989, longitude: 73.8278 },
  'mormugao': { latitude: 15.3981, longitude: 73.8052 },
  'nadia': { latitude: 23.4710, longitude: 88.5565 },
  'nainital': { latitude: 29.3919, longitude: 79.4542 },
  'dehradun': { latitude: 30.3165, longitude: 78.0322 },
  'haridwar': { latitude: 29.9457, longitude: 78.1642 },
  'udham singh nagar': { latitude: 28.9800, longitude: 79.4000 },
};

/**
 * Normalizes input state string to the exact filename in the repository
 */
function resolveStateFilename(inputState: string): string | null {
  if (!inputState || !inputState.trim()) return null;
  const s = inputState.trim().toLowerCase();

  // 1. Direct Hindi / English match against ALL_INDIA_STATES
  const matchDirect = ALL_INDIA_STATES.find(
    (item) =>
      item.name.toLowerCase() === s ||
      (item.nameHi && item.nameHi.trim() === inputState.trim()) ||
      (item.nameHi && item.nameHi.toLowerCase() === s) ||
      (item.nameHi && s.includes(item.nameHi.toLowerCase()))
  );
  if (matchDirect) return matchDirect.name;

  // 2. Transliterated English match
  const enTranslit = localizePlaceName(inputState, 'en').toLowerCase().trim();
  const matchEn = ALL_INDIA_STATES.find(
    (item) =>
      item.name.toLowerCase() === enTranslit ||
      enTranslit.includes(item.name.toLowerCase()) ||
      item.name.toLowerCase().includes(enTranslit)
  );
  if (matchEn) return matchEn.name;

  if (s.includes('andaman')) return 'Andaman & Nicobar Islands';
  if (s.includes('andhra')) return 'Andhra Pradesh';
  if (s.includes('arunachal')) return 'Arunachal Pradesh';
  if (s.includes('assam')) return 'Assam';
  if (s.includes('bihar')) return 'Bihar';
  if (s.includes('chandigarh')) return 'Chandigarh';
  if (s.includes('chhattisgarh') || s.includes('chhatisgarh')) return 'Chhattisgarh';
  if (s.includes('dadra')) return 'Dadra & Nagar Haveli';
  if (s.includes('daman')) return 'Daman & Diu';
  if (s.includes('delhi')) return 'Delhi';
  if (s.includes('goa')) return 'Goa';
  if (s.includes('gujarat')) return 'Gujarat';
  if (s.includes('haryana')) return 'Haryana';
  if (s.includes('himachal')) return 'Himachal Pradesh';
  if (s.includes('jammu') || s.includes('kashmir')) return 'Jammu & Kashmir';
  if (s.includes('jharkhand')) return 'Jharkhand';
  if (s.includes('karnataka')) return 'Karnataka';
  if (s.includes('kerala')) return 'Kerala';
  if (s.includes('lakshadweep')) return 'Lakshadweep';
  if (s.includes('madhya')) return 'Madhya Pradesh';
  if (s.includes('maharashtra')) return 'Maharashtra';
  if (s.includes('manipur')) return 'Manipur';
  if (s.includes('meghalaya')) return 'Meghalaya';
  if (s.includes('mizoram')) return 'Mizoram';
  if (s.includes('nagaland')) return 'Nagaland';
  if (s.includes('odisha') || s.includes('orissa')) return 'Odisha';
  if (s.includes('puducherry') || s.includes('pondicherry')) return 'Puducherry';
  if (s.includes('punjab')) return 'Punjab';
  if (s.includes('rajasthan')) return 'Rajasthan';
  if (s.includes('sikkim')) return 'Sikkim';
  if (s.includes('tamil')) return 'Tamil Nadu';
  if (s.includes('telangana')) return 'Telangana';
  if (s.includes('tripura')) return 'Tripura';
  if (s.includes('uttar pradesh') || s.includes('uttar')) return 'Uttar Pradesh';
  if (s.includes('uttarakhand') || s.includes('uttaranchal')) return 'Uttarakhand';
  if (s.includes('bengal')) return 'West Bengal';

  const match = ALL_INDIA_STATES.find((item) => item.name.toLowerCase() === s);
  return match ? match.name : null;
}

/**
 * Fetch state data from local public assets or remote repository with in-memory caching
 */
async function fetchStateData(stateName: string): Promise<RawStateData | null> {
  const resolvedName = resolveStateFilename(stateName);
  if (!resolvedName) {
    return null;
  }

  // Return from in-memory cache if available
  if (stateDataCache.has(resolvedName)) {
    return stateDataCache.get(resolvedName)!;
  }

  // Avoid duplicate concurrent fetches for the same state
  if (pendingStateFetches.has(resolvedName)) {
    return pendingStateFetches.get(resolvedName)!;
  }

  const safeKey = resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  const fetchPromise = (async () => {
    // 1. Try local same-origin asset first (/locations/{safeKey}.json)
    // Guarantees instant 0ms response, zero CORS errors, offline resilience, and no GitHub CDN blocks
    try {
      const localUrl = `/locations/${safeKey}.json`;
      const localRes = await fetch(localUrl, {
        headers: { Accept: 'application/json' },
      });
      if (localRes.ok) {
        const localData = (await localRes.json()) as RawStateData;
        if (localData && Array.isArray(localData.districts)) {
          stateDataCache.set(resolvedName, localData);
          return localData;
        }
      }
    } catch {
      // In Node environment or if local fetch is not available, try filesystem
      try {
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
          const fs = await import('fs');
          const path = await import('path');
          const localPath = path.resolve(process.cwd(), 'public', 'locations', `${safeKey}.json`);
          if (fs.existsSync(localPath)) {
            const content = fs.readFileSync(localPath, 'utf-8');
            const data = JSON.parse(content) as RawStateData;
            if (data && Array.isArray(data.districts)) {
              stateDataCache.set(resolvedName, data);
              return data;
            }
          }
        }
      } catch {}
    }

    // 2. Fallback to remote repository if local asset was not loaded
    try {
      const url = `${REPO_BASE_URL}/${encodeURIComponent(resolvedName)}.json`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[LocationService] Failed to fetch state data for ${resolvedName}: HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as RawStateData;
      if (data && Array.isArray(data.districts)) {
        stateDataCache.set(resolvedName, data);
        return data;
      }
      return null;
    } catch (err) {
      console.warn(`[LocationService] Error fetching state data for ${resolvedName}:`, err);
      return null;
    } finally {
      pendingStateFetches.delete(resolvedName);
    }
  })();

  pendingStateFetches.set(resolvedName, fetchPromise);
  return fetchPromise;
}

/**
 * Match a district name from raw state districts, accounting for historical naming aliases
 * and reorganized/carved-out districts (such as Amethi, Sambhal, Hapur, Shamli, etc.)
 */
function findDistrictData(districts: RawDistrict[], query: string): RawDistrict | undefined {
  if (!query || !query.trim() || !districts || districts.length === 0) return undefined;
  const q = query.trim().toLowerCase();
  const cleanQ = query.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
  const inParens = query.match(/\(([^)]+)\)/)?.[1]?.trim().toLowerCase();
  const enQ = localizePlaceName(query, 'en').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();

  // 1. Direct match (full query, clean query, in parens, or transliterated to English)
  let exact = districts.find(
    (d) =>
      d.district.toLowerCase() === q ||
      (cleanQ && d.district.toLowerCase() === cleanQ) ||
      (inParens && d.district.toLowerCase() === inParens) ||
      (enQ && d.district.toLowerCase() === enQ) ||
      localizePlaceName(d.district, 'hi') === query.trim()
  );
  if (exact) return exact;

  // 2. Known reorganized / carved-out districts whose tehsils exist in the state dataset
  // A. Amethi (carved out from Sultanpur & Rae Bareli)
  if (
    q === 'amethi' ||
    cleanQ === 'amethi' ||
    q.includes('amethi') ||
    enQ === 'amethi' ||
    enQ.includes('amethi') ||
    query.includes('अमेठी')
  ) {
    const amethiTehsils = ['amethi', 'gauriganj', 'musafirkhana', 'tiloi'];
    const collected: RawSubDistrict[] = [];
    for (const d of districts) {
      for (const s of d.subDistricts) {
        if (
          amethiTehsils.includes(s.subDistrict.toLowerCase()) &&
          !collected.some((c) => c.subDistrict.toLowerCase() === s.subDistrict.toLowerCase())
        ) {
          collected.push(s);
        }
      }
    }
    if (collected.length > 0) {
      return { district: 'Amethi', subDistricts: collected };
    }
  }

  // B. Sambhal (carved out from Moradabad & Budaun)
  if (
    q === 'sambhal' ||
    cleanQ === 'sambhal' ||
    q.includes('sambhal') ||
    enQ === 'sambhal' ||
    enQ.includes('sambhal') ||
    query.includes('सभल') ||
    query.includes('सम्भल')
  ) {
    const sambhalTehsils = ['sambhal', 'chandausi', 'gunnaur'];
    const collected: RawSubDistrict[] = [];
    for (const d of districts) {
      for (const s of d.subDistricts) {
        if (
          sambhalTehsils.includes(s.subDistrict.toLowerCase()) &&
          !collected.some((c) => c.subDistrict.toLowerCase() === s.subDistrict.toLowerCase())
        ) {
          collected.push(s);
        }
      }
    }
    if (collected.length > 0) {
      return { district: 'Sambhal', subDistricts: collected };
    }
  }

  // C. Hapur (carved out from Ghaziabad)
  if (
    q === 'hapur' ||
    cleanQ === 'hapur' ||
    q.includes('hapur') ||
    enQ === 'hapur' ||
    enQ.includes('hapur') ||
    query.includes('हापुड़')
  ) {
    const hapurTehsils = ['hapur', 'garhmukteshwar', 'dhaulana'];
    const collected: RawSubDistrict[] = [];
    for (const d of districts) {
      for (const s of d.subDistricts) {
        if (
          hapurTehsils.includes(s.subDistrict.toLowerCase()) &&
          !collected.some((c) => c.subDistrict.toLowerCase() === s.subDistrict.toLowerCase())
        ) {
          collected.push(s);
        }
      }
    }
    if (collected.length > 0) {
      return { district: 'Hapur', subDistricts: collected };
    }
  }

  // D. Shamli (carved out from Muzaffarnagar)
  if (
    q === 'shamli' ||
    cleanQ === 'shamli' ||
    q.includes('shamli') ||
    enQ === 'shamli' ||
    enQ.includes('shamli') ||
    query.includes('शामली')
  ) {
    const shamliTehsils = ['shamli', 'kairana', 'thanabhawan'];
    const collected: RawSubDistrict[] = [];
    for (const d of districts) {
      for (const s of d.subDistricts) {
        if (
          shamliTehsils.includes(s.subDistrict.toLowerCase()) &&
          !collected.some((c) => c.subDistrict.toLowerCase() === s.subDistrict.toLowerCase())
        ) {
          collected.push(s);
        }
      }
    }
    if (collected.length > 0) {
      return { district: 'Shamli', subDistricts: collected };
    }
  }

  // 3. Known historical naming aliases
  const targetCheck = enQ || cleanQ || q;
  if (targetCheck.includes('amroha') || query.includes('अमरोहा')) {
    const jpn = districts.find((d) => d.district.toLowerCase().includes('jyotiba phule nagar'));
    if (jpn) return jpn;
  }
  if (targetCheck.includes('prayagraj') || targetCheck.includes('allahabad') || query.includes('प्रयागराज')) {
    const al = districts.find((d) => d.district.toLowerCase() === 'allahabad');
    if (al) return al;
  }
  if (targetCheck.includes('ayodhya') || targetCheck.includes('faizabad') || query.includes('अयोध्या')) {
    const fz = districts.find((d) => d.district.toLowerCase() === 'faizabad');
    if (fz) return fz;
  }
  if (targetCheck.includes('kasganj') || query.includes('कासगंज')) {
    const kn = districts.find((d) => d.district.toLowerCase().includes('kanshi'));
    if (kn) return { ...kn, district: 'Kasganj' };
  }
  if (targetCheck.includes('hathras') || query.includes('हाथरस')) {
    const mn = districts.find((d) => d.district.toLowerCase().includes('mahama'));
    if (mn) return { ...mn, district: 'Hathras' };
  }
  if (targetCheck.includes('bhadohi') || query.includes('भदोही')) {
    const sr = districts.find((d) => d.district.toLowerCase().includes('sant ravidas'));
    if (sr) return { ...sr, district: 'Bhadohi' };
  }
  if (targetCheck.includes('maharajganj') || query.includes('महराजगंज')) {
    const mj = districts.find((d) => d.district.toLowerCase().includes('mahrajganj'));
    if (mj) return mj;
  }
  if (targetCheck.includes('shravasti') || query.includes('श्रावस्ती')) {
    const sh = districts.find((d) => d.district.toLowerCase().includes('shrawasti'));
    if (sh) return sh;
  }
  if (targetCheck.includes('kheri') || targetCheck.includes('lakhimpur') || query.includes('लखीमपुर')) {
    const kh = districts.find((d) => d.district.toLowerCase().includes('kheri'));
    if (kh) return kh;
  }

  // 4. Normalized whitespace match (e.g. Barabanki <-> Bara Banki, Raebareli <-> Rae Bareli)
  const noSpaceQ = (enQ || cleanQ).replace(/\s+/g, '');
  const spaceMatch = districts.find(
    (d) => d.district.toLowerCase().replace(/\s+/g, '') === noSpaceQ
  );
  if (spaceMatch) return spaceMatch;

  // 5. Automated fallback: check if any subdistrict in the dataset matches this query
  const matchingSubdistricts: RawSubDistrict[] = [];
  for (const d of districts) {
    for (const s of d.subDistricts) {
      if (
        s.subDistrict.toLowerCase() === cleanQ ||
        s.subDistrict.toLowerCase() === q ||
        (enQ && s.subDistrict.toLowerCase() === enQ)
      ) {
        matchingSubdistricts.push(s);
      }
    }
  }
  if (matchingSubdistricts.length > 0) {
    return {
      district: query,
      subDistricts: matchingSubdistricts,
    };
  }

  // 6. Substring match
  return districts.find(
    (d) =>
      d.district.toLowerCase().includes(cleanQ) ||
      cleanQ.includes(d.district.toLowerCase()) ||
      (enQ && (d.district.toLowerCase().includes(enQ) || enQ.includes(d.district.toLowerCase()))) ||
      d.district.toLowerCase().includes(q) ||
      q.includes(d.district.toLowerCase())
  );
}

/**
 * Match a sub-district (tehsil) from raw district sub-districts
 */
function findSubDistrictData(subDistricts: RawSubDistrict[], query: string): RawSubDistrict | undefined {
  if (!query || !query.trim() || !subDistricts || subDistricts.length === 0) return undefined;
  const q = query.trim().toLowerCase();
  const enQ = localizePlaceName(query, 'en').trim().toLowerCase();

  // 1. Exact match (English, Hindi, or transliterated)
  const exact = subDistricts.find(
    (s) =>
      s.subDistrict.toLowerCase() === q ||
      (enQ && s.subDistrict.toLowerCase() === enQ) ||
      localizePlaceName(s.subDistrict, 'hi') === query.trim()
  );
  if (exact) return exact;

  // 2. Substring match
  return subDistricts.find(
    (s) =>
      s.subDistrict.toLowerCase().includes(q) ||
      q.includes(s.subDistrict.toLowerCase()) ||
      (enQ && (s.subDistrict.toLowerCase().includes(enQ) || enQ.includes(s.subDistrict.toLowerCase()))) ||
      localizePlaceName(s.subDistrict, 'hi').includes(query.trim())
  );
}

export class LocationService {
  /**
   * Fast synchronous lookup of verified coordinates for an administrative district
   */
  static resolveDistrictCoordinates(district?: string): { latitude: number; longitude: number } | null {
    if (!district) return null;
    const distLower = district.trim().toLowerCase();
    if (VERIFIED_DISTRICT_COORDINATES[distLower]) {
      return VERIFIED_DISTRICT_COORDINATES[distLower];
    }
    for (const [key, coords] of Object.entries(VERIFIED_DISTRICT_COORDINATES)) {
      if (distLower.includes(key) || key.includes(distLower)) {
        return coords;
      }
    }
    return null;
  }

  /**
   * Calculate haversine distance in kilometers between two lat/lng pairs
   */
  static getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private static lastKnownPosition: { latitude: number; longitude: number } | null = null;

  static getLastKnownPosition(): { latitude: number; longitude: number } | null {
    if (this.lastKnownPosition) return this.lastKnownPosition;
    try {
      const stored = sessionStorage.getItem('kaammitra_last_coords');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          parsed.latitude !== undefined &&
          parsed.latitude !== null &&
          !isNaN(Number(parsed.latitude)) &&
          parsed.longitude !== undefined &&
          parsed.longitude !== null &&
          !isNaN(Number(parsed.longitude))
        ) {
          const coords = { latitude: Number(parsed.latitude), longitude: Number(parsed.longitude) };
          this.lastKnownPosition = coords;
          return coords;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  static setLastKnownPosition(lat: number, lng: number): void {
    if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
      this.lastKnownPosition = { latitude: lat, longitude: lng };
      try {
        sessionStorage.setItem('kaammitra_last_coords', JSON.stringify({ latitude: lat, longitude: lng }));
      } catch {
        // ignore
      }
    }
  }

  /**
   * Get device current position safely (GPS Live Location)
   * Tries high accuracy first, seamlessly falling back to standard accuracy
   * if device lacks dedicated GPS hardware or if high accuracy times out.
   */
  static async getCurrentPosition(): Promise<{
    latitude: number;
    longitude: number;
  } | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return this.getLastKnownPosition();
    }

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (coords: { latitude: number; longitude: number } | null) => {
        if (!resolved) {
          resolved = true;
          if (coords) {
            LocationService.setLastKnownPosition(coords.latitude, coords.longitude);
          }
          resolve(coords);
        }
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          finish({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          // If high-accuracy fails or times out, fallback to standard accuracy
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              finish({
                latitude: fallbackPos.coords.latitude,
                longitude: fallbackPos.coords.longitude,
              });
            },
            () => {
              finish(LocationService.getLastKnownPosition());
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    });
  }

  /**
   * Reverse geocode coordinates using OpenStreetMap Nominatim
   * (Preserved for Chat Live Location and used by GPS Location Picker)
   */
  static async reverseGeocode(
    lat: number,
    lng: number
  ): Promise<{
    place: string;
    district: string;
    subdistrict?: string;
    state: string;
  } | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=hi,en`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'KaamMitra-App/1.0',
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};

      const place =
        addr.village ||
        addr.town ||
        addr.city ||
        addr.suburb ||
        addr.hamlet ||
        addr.neighbourhood ||
        addr.locality ||
        '';

      let subdistrict =
        addr.subdistrict ||
        addr.tehsil ||
        addr.taluk ||
        addr.sub_district ||
        addr.mandal ||
        addr.block ||
        '';

      let district = addr.state_district || addr.district || '';
      const state = addr.state || '';

      // In Indian administrative hierarchy in OSM:
      // If county is present and not equal to district, county is the Tehsil/Taluk
      if (!subdistrict && addr.county && addr.county !== district) {
        subdistrict = addr.county;
      }
      if (!district && addr.county) {
        district = addr.county;
      }

      // If subdistrict (tehsil) is still missing, resolve from verified Indian administrative dataset
      if (!subdistrict && state) {
        try {
          const stateData = await fetchStateData(state);
          if (stateData && Array.isArray(stateData.districts)) {
            const cleanPlace = place.toLowerCase().trim();
            const cleanDist = district.toLowerCase().trim();

            const targetDist = stateData.districts.find(
              (d) =>
                !cleanDist ||
                d.district.toLowerCase() === cleanDist ||
                d.district.toLowerCase().includes(cleanDist) ||
                cleanDist.includes(d.district.toLowerCase())
            );

            if (targetDist && Array.isArray(targetDist.subDistricts)) {
              // Check if any subDistrict contains this village
              if (cleanPlace) {
                for (const sd of targetDist.subDistricts) {
                  if (
                    sd.villages.some(
                      (v) =>
                        v.toLowerCase() === cleanPlace ||
                        v.toLowerCase().includes(cleanPlace) ||
                        cleanPlace.includes(v.toLowerCase())
                    )
                  ) {
                    subdistrict = sd.subDistrict;
                    break;
                  }
                }
              }

              // Check if county or municipality matches a subdistrict name
              if (!subdistrict && addr.county) {
                const cLower = addr.county.toLowerCase().trim();
                const matchedSd = targetDist.subDistricts.find(
                  (sd) =>
                    sd.subDistrict.toLowerCase() === cLower ||
                    sd.subDistrict.toLowerCase().includes(cLower) ||
                    cLower.includes(sd.subDistrict.toLowerCase())
                );
                if (matchedSd) {
                  subdistrict = matchedSd.subDistrict;
                }
              }
            }
          }
        } catch {
          // Dataset resolution failure is non-fatal
        }
      }

      return {
        place: place || subdistrict || district || 'स्थानीय क्षेत्र',
        district,
        subdistrict: subdistrict || undefined,
        state,
      };
    } catch {
      return null;
    }
  }

  /**
   * Geocode a search query array using OpenStreetMap Nominatim.
   * Cached to prevent redundant network requests and throttled to respect API rate limits.
   */
  static async geocodeQuery(parts: string[]): Promise<{ latitude: number; longitude: number } | null> {
    const valid = parts.filter((p): p is string => Boolean(p && p.trim()));
    if (valid.length <= 1) return null;

    const cacheKey = valid.join('|').toLowerCase();
    if (geocodeCache.has(cacheKey)) {
      return geocodeCache.get(cacheKey) || null;
    }

    try {
      await throttleNominatim();

      const q = valid.join(', ');
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q
      )}&limit=1&accept-language=hi,en`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'KaamMitra-App-Directory/1.0 (contact: support@kaammitra.in)',
            'Accept': 'application/json',
          },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // If rate limited by OSM, do not block or cache null; allow immediate fallback
      if (res.status === 429) {
        return null;
      }

      if (!res.ok) {
        geocodeCache.set(cacheKey, null);
        return null;
      }

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          const coords = { latitude: lat, longitude: lon };
          geocodeCache.set(cacheKey, coords);
          return coords;
        }
      }
      geocodeCache.set(cacheKey, null);
      return null;
    } catch {
      geocodeCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Resolves the most specific real coordinates for a selected location hierarchy:
   * Level 1: Village/Locality + Tehsil + District + State
   * Level 2: Village/Locality + District + State
   * Level 3: Tehsil/Sub-District + District + State
   * Level 4: District + State
   * Level 5: Verified local district coordinate dataset fallback
   * Level 6: State
   * Never returns random or fake coordinates.
   */
  static async resolveLocationCoordinates(params: {
    village?: string;
    subdistrict?: string;
    district?: string;
    state?: string;
  }): Promise<{ latitude: number; longitude: number } | null> {
    const { village, district, state } = params;
    const subdistrict = params.subdistrict;

    const cacheKey = [village, subdistrict, district, state].filter(Boolean).join('_').toLowerCase();
    if (geocodeCache.has(cacheKey)) {
      const cached = geocodeCache.get(cacheKey);
      if (cached) return cached;
    }

    // Level 1: Try specific geocoding: village + subdistrict + district + state
    if (village && subdistrict && district && state) {
      const q = await this.geocodeQuery([village, subdistrict, district, state, 'India']);
      if (q) {
        geocodeCache.set(cacheKey, q);
        return q;
      }
    }

    // Level 2: Try village + district + state
    if (village && district && state) {
      const q = await this.geocodeQuery([village, district, state, 'India']);
      if (q) {
        geocodeCache.set(cacheKey, q);
        return q;
      }
    }

    // Level 3: Try subdistrict/landmark + district + state
    if (subdistrict && district && state) {
      const q = await this.geocodeQuery([subdistrict, district, state, 'India']);
      if (q) {
        geocodeCache.set(cacheKey, q);
        return q;
      }
    }

    // Level 4: Try district + state
    if (district && state) {
      const q = await this.geocodeQuery([district, state, 'India']);
      if (q) {
        geocodeCache.set(cacheKey, q);
        return q;
      }
    }

    // Level 5: Verified Local District Coordinate dataset (instant 0ms response when OSM unavailable)
    if (district) {
      const fastCoords = LocationService.resolveDistrictCoordinates(district);
      if (fastCoords) {
        geocodeCache.set(cacheKey, fastCoords);
        return fastCoords;
      }
    }

    // Level 6: District query in India
    if (district) {
      const q = await this.geocodeQuery([district, 'India']);
      if (q) {
        geocodeCache.set(cacheKey, q);
        return q;
      }
    }

    // Level 7: Fallback: state only
    if (state) {
      const q = await this.geocodeQuery([state, 'India']);
      if (q) {
        geocodeCache.set(cacheKey, q);
        return q;
      }
    }

    geocodeCache.set(cacheKey, null);
    return null;
  }

  /**
   * Geocode an administrative hierarchy (State -> District -> Place) using OpenStreetMap Nominatim.
   * Never invents fake coordinates. Returns null if not geocodable.
   */
  static async geocodeAdministrative(params: {
    state?: string;
    district?: string;
    place?: string;
  }): Promise<{ latitude: number; longitude: number } | null> {
    const parts = [params.place, params.district, params.state, 'India'].filter(
      (p): p is string => Boolean(p && p.trim())
    );

    return this.geocodeQuery(parts);
  }

  // =========================================================================
  // WORKING REFERENCE DATA FETCH MECHANISM
  // Hierarchy: State -> District -> Sub-District / Tehsil -> Village
  // Source: Verified Indian Administrative Hierarchy Dataset (36 States & UTs)
  // =========================================================================

  /**
   * Load complete list of 36 States & Union Territories of India
   */
  static async getStates(): Promise<LocationStateItem[]> {
    return ALL_INDIA_STATES;
  }

  /**
   * Load all Districts for a selected State by fetching the state JSON from the dataset
   * Guarantees instant 0ms fallback to STATIC_STATE_DISTRICTS if offline or remote fetch fails.
   */
  static async getDistricts(state: string): Promise<LocationDistrictItem[]> {
    if (!state || !state.trim()) return [];

    const resolvedName = resolveStateFilename(state);
    const staticNames = (resolvedName && STATIC_STATE_DISTRICTS[resolvedName]) || [];
    const staticItems: LocationDistrictItem[] = staticNames.map((name) => ({ name }));

    try {
      const stateData = await fetchStateData(state);
      if (stateData && Array.isArray(stateData.districts) && stateData.districts.length > 0) {
        const items: LocationDistrictItem[] = [];
        const seen = new Set<string>();

        for (const d of stateData.districts) {
          if (d.district && !seen.has(d.district.toLowerCase())) {
            seen.add(d.district.toLowerCase());
            items.push({ name: d.district });
          }

          // Add alias for Jyotiba Phule Nagar -> Amroha so both can be chosen
          if (d.district && d.district.toLowerCase() === 'jyotiba phule nagar' && !seen.has('amroha')) {
            seen.add('amroha');
            items.push({ name: 'Amroha' });
          }
        }

        // Also add any static districts that might be missing
        for (const sName of staticNames) {
          if (!seen.has(sName.toLowerCase())) {
            seen.add(sName.toLowerCase());
            items.push({ name: sName });
          }
        }

        if (items.length > 0) {
          return items.sort((a, b) => a.name.localeCompare(b.name));
        }
      }
    } catch (err) {
      console.warn('[LocationService] Remote district fetch failed, using verified static list:', err);
    }

    return staticItems.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Load all Sub-Districts / Tehsils for a selected State & District
   */
  static async getSubdistricts(state: string, district: string): Promise<LocationSubdistrictItem[]> {
    if (!state || !state.trim() || !district || !district.trim()) return [];

    const stateData = await fetchStateData(state);
    if (!stateData || !Array.isArray(stateData.districts)) {
      return [];
    }

    const districtData = findDistrictData(stateData.districts, district);
    if (!districtData || !Array.isArray(districtData.subDistricts)) {
      return [];
    }

    const items: LocationSubdistrictItem[] = [];
    const seen = new Set<string>();

    for (const s of districtData.subDistricts) {
      if (s.subDistrict && !seen.has(s.subDistrict.toLowerCase())) {
        seen.add(s.subDistrict.toLowerCase());
        items.push({ name: s.subDistrict });
      }
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Load all Villages for the selected Sub-District / Tehsil with search and pagination support
   */
  static async getVillages(params: GetVillagesParams): Promise<VillagesResponse> {
    const { state, district, subdistrict, search, page = 1, limit = 1000 } = params;
    if (!state || !district || !subdistrict) {
      return { villages: [], total: 0 };
    }

    const stateData = await fetchStateData(state);
    if (!stateData || !Array.isArray(stateData.districts)) {
      return { villages: [], total: 0 };
    }

    const districtData = findDistrictData(stateData.districts, district);
    if (!districtData || !Array.isArray(districtData.subDistricts)) {
      return { villages: [], total: 0 };
    }

    const subDistrictData = findSubDistrictData(districtData.subDistricts, subdistrict);
    if (!subDistrictData || !Array.isArray(subDistrictData.villages)) {
      return { villages: [], total: 0 };
    }

    let list = subDistrictData.villages.filter((v) => Boolean(v && v.trim()));

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((v) => v.toLowerCase().includes(q));
    }

    list.sort((a, b) => a.localeCompare(b));

    const total = list.length;

    // Apply pagination if limit is specified
    const pageNum = Math.max(1, page);
    const startIndex = (pageNum - 1) * limit;
    const paginated = limit > 0 ? list.slice(startIndex, startIndex + limit) : list;

    return {
      villages: paginated.map((v) => ({ name: v })),
      total,
    };
  }

  /**
   * Find the Tehsil (Sub-District) for a village in the administrative hierarchy
   */
  static async findSubdistrictForVillage(
    state?: string | null,
    district?: string | null,
    village?: string | null
  ): Promise<string | null> {
    if (!state || !district || !village) return null;
    const cleanVillage = village.trim().toLowerCase();
    if (!cleanVillage) return null;

    try {
      const stateData = await fetchStateData(state);
      if (!stateData || !Array.isArray(stateData.districts)) return null;

      const districtData = findDistrictData(stateData.districts, district);
      if (!districtData || !Array.isArray(districtData.subDistricts)) return null;

      for (const s of districtData.subDistricts) {
        if (s.villages && Array.isArray(s.villages)) {
          if (s.villages.some((v) => v.trim().toLowerCase() === cleanVillage)) {
            return s.subDistrict;
          }
        }
      }
    } catch {
      // fallback
    }
    return null;
  }

  /**
   * Geocode a selected Village within its administrative hierarchy.
   * Gets real coordinates with hierarchical fallback (village -> subdistrict -> district).
   */
  static async getGeocodeForVillage(params: {
    state: string;
    district: string;
    subdistrict?: string;
    village: string;
  }): Promise<{ latitude: number; longitude: number } | null> {
    const { state, district, subdistrict, village } = params;
    return this.resolveLocationCoordinates({
      village,
      subdistrict,
      district,
      state,
    });
  }

  /**
   * Localize a single place name (village, tehsil, district, or state) for display
   * Preserves underlying API data; conversion occurs strictly at presentation layer.
   */
  static localizePlaceName(name?: string | null, targetLang: 'hi' | 'en' = 'hi'): string {
    return localizePlaceName(name, targetLang);
  }

  /**
   * Localize a combined display string (such as "Pipalsana, Moradabad")
   */
  static localizeDisplayString(text?: string | null, targetLang: 'hi' | 'en' = 'hi'): string {
    if (!text || !text.trim()) return '';
    if (text.includes(',')) {
      return text
        .split(',')
        .map((p) => this.localizePlaceName(p.trim(), targetLang))
        .filter(Boolean)
        .join(', ');
    }
    return this.localizePlaceName(text, targetLang);
  }

  /**
   * Extract canonical location object handling all naming variations:
   * - location.place, location.village, location.city, location.town
   * - location.subdistrict, location.tehsil, location.landmark
   * - nested worker / profile locations and profiles.address strings
   * Guarantees WorkerCard, FullProfileDetails and Service Area always receive the village.
   */
  static extractCanonicalLocation(source?: any, fallbackAddress?: string | null): UserLocation | null {
    if (!source && !fallbackAddress) return null;

    // Resolve base location object from any nested path
    let loc: any = null;
    if (source && typeof source === 'object') {
      if (source.location && typeof source.location === 'object') {
        loc = source.location;
      } else if (source.profile?.location && typeof source.profile.location === 'object') {
        loc = source.profile.location;
      } else if (source.profile?.locations) {
        loc = Array.isArray(source.profile.locations) ? source.profile.locations[0] : source.profile.locations;
      } else if (source.locations) {
        loc = Array.isArray(source.locations) ? source.locations[0] : source.locations;
      } else if (source.place || source.district || source.state || source.landmark || source.village) {
        loc = source;
      }
    }

    const addressText =
      (typeof source?.profile?.address === 'string' ? source.profile.address : '') ||
      (typeof source?.address === 'string' ? source.address : '') ||
      (typeof fallbackAddress === 'string' ? fallbackAddress : '') ||
      '';

    let rawVillage = (
      loc?.village ||
      loc?.place ||
      loc?.city ||
      loc?.town ||
      loc?.village_name ||
      source?.village ||
      source?.place ||
      source?.profile?.village ||
      source?.profile?.place ||
      ''
    ).toString().trim();

    let rawSubdistrict = (
      loc?.subdistrict ||
      loc?.tehsil ||
      loc?.landmark ||
      loc?.taluk ||
      source?.subdistrict ||
      source?.tehsil ||
      ''
    ).toString().trim();

    let rawDistrict = (
      loc?.district ||
      source?.district ||
      source?.profile?.district ||
      ''
    ).toString().trim();

    let rawState = (
      loc?.state ||
      source?.state ||
      source?.profile?.state ||
      ''
    ).toString().trim();

    // If village or other parts are missing, parse from addressText if available
    if (addressText) {
      // 1. Check labeled patterns:
      // Village: गाँव : Lodhipur or गाँव = Lodhipur or Village: Lodhipur
      if (!rawVillage) {
        const vMatch = addressText.match(/(?:गाँव|गांव|ग्राम|Village|Gram|Gaon)\s*[:=]\s*([^,→\n]+)/i);
        if (vMatch && vMatch[1]) {
          rawVillage = vMatch[1].trim();
        }
      }

      // Tehsil: तहसील : Khair or Tehsil: Khair
      if (!rawSubdistrict) {
        const tMatch = addressText.match(/(?:तहसील|उप-जिला|तालुक|Tehsil|Subdistrict|Sub-District|Taluk)\s*[:=]\s*([^,→\n]+)/i);
        if (tMatch && tMatch[1]) {
          rawSubdistrict = tMatch[1].trim();
        }
      }

      // District: जिला : Aligarh or District: Aligarh
      if (!rawDistrict) {
        const dMatch = addressText.match(/(?:जिला|District)\s*[:=]\s*([^,→\n]+)/i);
        if (dMatch && dMatch[1]) {
          rawDistrict = dMatch[1].trim();
        }
      }

      // State: राज्य : Uttar Pradesh or State: Uttar Pradesh
      if (!rawState) {
        const sMatch = addressText.match(/(?:राज्य|State)\s*[:=]\s*([^,→\n]+)/i);
        if (sMatch && sMatch[1]) {
          rawState = sMatch[1].trim();
        }
      }

      // 2. If still missing village and address contains arrow or comma separated hierarchy (e.g. "Lodhipur → Khair → Aligarh" or "Lodhipur, Khair, Aligarh, Uttar Pradesh")
      if (!rawVillage && !addressText.includes(':') && !addressText.includes('=')) {
        const tokens = addressText.split(/[→,]/).map((t: string) => t.trim()).filter(Boolean);
        if (tokens.length >= 3) {
          const first = tokens[0];
          const isNotDistrictOrState = !ALL_INDIA_STATES.some((s) => s.name.toLowerCase() === first.toLowerCase());
          if (isNotDistrictOrState) {
            rawVillage = first;
            if (!rawSubdistrict && tokens.length >= 4) {
              rawSubdistrict = tokens[1];
            }
            if (!rawDistrict) {
              rawDistrict = tokens.length >= 4 ? tokens[2] : tokens[1];
            }
            if (!rawState && tokens.length >= 4) {
              rawState = tokens[3];
            }
          }
        }
      }
    }

    if (!rawVillage && !rawSubdistrict && !rawDistrict && !rawState) {
      return null;
    }

    const lat = loc?.latitude !== undefined && loc?.latitude !== null && loc?.latitude !== '' && !isNaN(Number(loc?.latitude))
      ? Number(loc.latitude)
      : null;
    const lng = loc?.longitude !== undefined && loc?.longitude !== null && loc?.longitude !== '' && !isNaN(Number(loc?.longitude))
      ? Number(loc.longitude)
      : null;

    return {
      ...(loc || {}),
      user_id: loc?.user_id || source?.user_id || source?.id || '',
      place: rawVillage,
      village: rawVillage,
      subdistrict: rawSubdistrict,
      tehsil: rawSubdistrict,
      landmark: rawSubdistrict || loc?.landmark || null,
      district: rawDistrict,
      state: rawState,
      latitude: lat,
      longitude: lng,
      location_source: loc?.location_source || 'manual',
    };
  }

  /**
   * Format Location for public display: "Village/Town/City → Tehsil → District → State"
   * (Approximate public-facing string, no sensitive raw coordinates exposed)
   */
  static formatDisplay(loc?: any, fallback = '', lang: 'hi' | 'en' = 'hi'): string {
    const canonical = this.extractCanonicalLocation(loc, loc?.profile?.address || loc?.address);
    if (!canonical) return fallback;

    const rawVillage = canonical.place || canonical.village;
    const rawSubdistrict = canonical.subdistrict || canonical.tehsil || canonical.landmark;
    const rawDistrict = canonical.district;
    const rawState = canonical.state;

    const village = rawVillage ? this.localizePlaceName(rawVillage.trim(), lang) : '';
    const subdistrict = rawSubdistrict ? this.localizePlaceName(rawSubdistrict.trim(), lang) : '';
    const district = rawDistrict ? this.localizePlaceName(rawDistrict.trim(), lang) : '';
    const state = rawState ? this.localizePlaceName(rawState.trim(), lang) : '';

    const parts: string[] = [];
    if (village) parts.push(village);
    if (subdistrict) parts.push(subdistrict);
    if (district) parts.push(district);
    if (state) parts.push(state);

    if (parts.length === 0) return fallback;
    return parts.join(' → ');
  }

  /**
   * Format Location with Landmark if available: "Village/Town/City → Tehsil → District → State"
   */
  static formatDisplayWithLandmark(loc?: any, fallback = '', lang: 'hi' | 'en' = 'hi'): string {
    return this.formatDisplay(loc, fallback, lang);
  }

  /**
   * Format Location for Worker Card display:
   * Format: Village : <village>, Tehsil : <tehsil>, District : <district>, State : <state>
   * (or in Hindi: गाँव : <village>, तहसील : <tehsil>, जिला : <district>, राज्य : <state>)
   * Preserves exact API location values, localizing both field labels and place names
   * according to user's selected UI language strictly at the presentation layer.
   *
   * DISPLAY FALLBACK ORDER:
   * If village exists: Village → Tehsil → District → State
   * If village is legitimately null/blank: Tehsil → District → State (no empty village label)
   */
  static formatWorkerCard(loc?: any, fallback = '', lang: 'hi' | 'en' = 'hi'): string {
    const canonical = this.extractCanonicalLocation(loc, loc?.profile?.address || loc?.address);
    if (!canonical) return fallback;

    const rawVillage = canonical.place || canonical.village;
    const rawSubdistrict = canonical.subdistrict || canonical.tehsil || canonical.landmark;
    const rawDistrict = canonical.district;
    const rawState = canonical.state;

    const village = rawVillage ? this.localizePlaceName(rawVillage.trim(), lang) : '';
    const subdistrict = rawSubdistrict ? this.localizePlaceName(rawSubdistrict.trim(), lang) : '';
    const district = rawDistrict ? this.localizePlaceName(rawDistrict.trim(), lang) : '';
    const state = rawState ? this.localizePlaceName(rawState.trim(), lang) : '';

    const labels = lang === 'hi'
      ? { village: 'गाँव', tehsil: 'तहसील', district: 'जिला', state: 'राज्य' }
      : { village: 'Village', tehsil: 'Tehsil', district: 'District', state: 'State' };

    const parts: string[] = [];

    // Exact selected Village/Town/City MUST NEVER DISAPPEAR
    if (village) {
      parts.push(`${labels.village}: ${village}`);
    }

    if (subdistrict) {
      parts.push(`${labels.tehsil}: ${subdistrict}`);
    }

    if (district) {
      parts.push(`${labels.district}: ${district}`);
    }

    if (state) {
      parts.push(`${labels.state}: ${state}`);
    }

    if (parts.length === 0) return fallback;
    return parts.join(', ');
  }

  /**
   * Format Location for Service Area / कार्य क्षेत्र section:
   * Format: Village/Town/City → Tehsil → District (or Village → Tehsil → District → State)
   * Example: Lodhipur → Khair → Aligarh
   * If village is legitimately null/blank: Tehsil → District → State without empty labels.
   */
  static formatServiceArea(loc?: any, fallback = '', lang: 'hi' | 'en' = 'hi'): string {
    const canonical = this.extractCanonicalLocation(loc, loc?.profile?.address || loc?.address);
    if (!canonical) return fallback;

    const rawVillage = canonical.place || canonical.village;
    const rawSubdistrict = canonical.subdistrict || canonical.tehsil || canonical.landmark;
    const rawDistrict = canonical.district;
    const rawState = canonical.state;

    const village = rawVillage ? this.localizePlaceName(rawVillage.trim(), lang) : '';
    const subdistrict = rawSubdistrict ? this.localizePlaceName(rawSubdistrict.trim(), lang) : '';
    const district = rawDistrict ? this.localizePlaceName(rawDistrict.trim(), lang) : '';
    const state = rawState ? this.localizePlaceName(rawState.trim(), lang) : '';

    const parts: string[] = [];

    if (village) {
      parts.push(village);
      if (subdistrict) parts.push(subdistrict);
      if (district) parts.push(district);
      if (state) parts.push(state);
    } else {
      if (subdistrict) parts.push(subdistrict);
      if (district) parts.push(district);
      if (state) parts.push(state);
    }

    if (parts.length === 0) return fallback;
    return parts.join(' → ');
  }

  /**
   * Format Complete Location for Worker Details / Full Profile View:
   * Format: Village : <village>, Tehsil : <tehsil>, District : <district>, State : <state>
   * (or in Hindi: गाँव : <village>, तहसील : <tehsil>, जिला : <district>, राज्य : <state>)
   */
  static formatFullDetails(loc?: any, fallback = '', lang: 'hi' | 'en' = 'hi'): string {
    return this.formatWorkerCard(loc, fallback, lang);
  }
}
