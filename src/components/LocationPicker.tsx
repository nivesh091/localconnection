import React, { useState, useEffect, useCallback, useRef } from 'react';
import L from 'leaflet';
import { useTranslation } from '../hooks/useTranslation';
import {
  LocationService,
  LocationStateItem,
  LocationDistrictItem,
  LocationSubdistrictItem,
  LocationVillageItem,
} from '../services/locationService';
import {
  MapPin,
  Navigation,
  CheckCircle,
  Loader2,
  RotateCcw,
  Building,
  Home,
  Compass,
  AlertCircle,
} from 'lucide-react';

export interface LocationPickerValue {
  state: string;
  district: string;
  subdistrict?: string;
  landmark?: string | null;
  place: string; // Village / Town / City
  village?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_source?: 'gps' | 'manual';
}

interface LocationPickerProps {
  value?: Partial<LocationPickerValue> | null;
  onChange: (val: LocationPickerValue | null) => void;
  showLiveLocationOption?: boolean;
  manualOnly?: boolean;
  disabled?: boolean;
  title?: string;
  hideHeader?: boolean;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  showLiveLocationOption = false,
  manualOnly = false,
  disabled = false,
  title,
  hideHeader = false,
}) => {
  const { lang } = useTranslation();

  // Mode selection: 'manual' vs 'gps' (When manualOnly is true, GPS is completely barred)
  const isGpsAllowed = showLiveLocationOption && !manualOnly;
  const [activeMode, setActiveMode] = useState<'manual' | 'gps'>('manual');

  useEffect(() => {
    if (manualOnly && activeMode !== 'manual') {
      setActiveMode('manual');
    }
  }, [manualOnly, activeMode]);

  // Hierarchical values: State -> District -> Sub-District (Tehsil) -> Village / Town / City
  const [selectedState, setSelectedState] = useState<string>(value?.state || '');
  const [selectedDistrict, setSelectedDistrict] = useState<string>(value?.district || '');
  const [selectedSubdistrict, setSelectedSubdistrict] = useState<string>(
    value?.subdistrict || ''
  );
  const [selectedVillage, setSelectedVillage] = useState<string>(value?.place || '');
  const [customPlace, setCustomPlace] = useState<string>('');
  const [isCustomPlaceMode, setIsCustomPlaceMode] = useState<boolean>(false);
  const [customSubdistrict, setCustomSubdistrict] = useState<string>('');
  const [isCustomSubdistrictMode, setIsCustomSubdistrictMode] = useState<boolean>(false);

  // Coordinates & source (handled in background, no manual entry)
  const [latitude, setLatitude] = useState<number | null>(value?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(value?.longitude ?? null);
  const [locationSource, setLocationSource] = useState<'gps' | 'manual'>(
    value?.location_source || 'manual'
  );

  // Loaded options
  const [states, setStates] = useState<LocationStateItem[]>([]);
  const [districts, setDistricts] = useState<LocationDistrictItem[]>([]);
  const [subdistricts, setSubdistricts] = useState<LocationSubdistrictItem[]>([]);
  const [villages, setVillages] = useState<LocationVillageItem[]>([]);

  // Loading states
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [isLoadingSubdistricts, setIsLoadingSubdistricts] = useState(false);
  const [isLoadingVillages, setIsLoadingVillages] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Embedded Leaflet Map preview
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Sync external value
  useEffect(() => {
    if (value) {
      setSelectedState(value.state || '');
      setSelectedDistrict(value.district || '');
      setSelectedSubdistrict(value.subdistrict || value.landmark || '');
      setSelectedVillage(value.place || (value as any).village || (value as any).city || (value as any).town || '');
      setLatitude(value.latitude ?? null);
      setLongitude(value.longitude ?? null);
      setLocationSource(value.location_source || 'manual');
    }
  }, [
    value?.state,
    value?.district,
    value?.subdistrict,
    value?.landmark,
    value?.place,
    (value as any)?.village,
    value?.latitude,
    value?.longitude,
    value?.location_source,
  ]);

  // Load States on mount
  useEffect(() => {
    let isMounted = true;
    const fetchStates = async () => {
      setIsLoadingStates(true);
      try {
        const data = await LocationService.getStates();
        if (isMounted) setStates(data);
      } finally {
        if (isMounted) setIsLoadingStates(false);
      }
    };
    fetchStates();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load Districts when State changes
  useEffect(() => {
    let isMounted = true;
    if (!selectedState) {
      setDistricts([]);
      return;
    }
    const fetchDistricts = async () => {
      setIsLoadingDistricts(true);
      try {
        const data = await LocationService.getDistricts(selectedState);
        if (isMounted) setDistricts(data);
      } finally {
        if (isMounted) setIsLoadingDistricts(false);
      }
    };
    fetchDistricts();
    return () => {
      isMounted = false;
    };
  }, [selectedState]);

  // Load Subdistricts (Tehsils) when District changes
  useEffect(() => {
    let isMounted = true;
    if (!selectedState || !selectedDistrict) {
      setSubdistricts([]);
      return;
    }
    const fetchSubdistricts = async () => {
      setIsLoadingSubdistricts(true);
      try {
        const data = await LocationService.getSubdistricts(selectedState, selectedDistrict);
        if (isMounted) setSubdistricts(data);
      } finally {
        if (isMounted) setIsLoadingSubdistricts(false);
      }
    };
    fetchSubdistricts();
    return () => {
      isMounted = false;
    };
  }, [selectedState, selectedDistrict]);

  // Load Villages when Subdistrict changes
  useEffect(() => {
    let isMounted = true;
    if (!selectedState || !selectedDistrict || !selectedSubdistrict) {
      setVillages([]);
      return;
    }
    const fetchVillages = async () => {
      setIsLoadingVillages(true);
      try {
        const res = await LocationService.getVillages({
          state: selectedState,
          district: selectedDistrict,
          subdistrict: selectedSubdistrict,
        });
        if (isMounted) setVillages(res.villages);
      } finally {
        if (isMounted) setIsLoadingVillages(false);
      }
    };
    fetchVillages();
    return () => {
      isMounted = false;
    };
  }, [selectedState, selectedDistrict, selectedSubdistrict]);

  // Notify parent of location changes
  const notifyChange = useCallback(
    (
      st: string,
      dist: string,
      sub: string,
      pl: string,
      lat: number | null,
      lng: number | null,
      src: 'gps' | 'manual'
    ) => {
      if (!st && !dist && !sub && !pl) {
        onChange(null);
        return;
      }
      onChange({
        state: st,
        district: dist,
        subdistrict: sub,
        landmark: sub || null,
        place: pl,
        village: pl,
        latitude: lat,
        longitude: lng,
        location_source: src,
      });
    },
    [onChange]
  );

  // Initialize and update embedded Leaflet Map preview
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!latitude || !longitude) {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [latitude, longitude],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="background-color: #0f766e; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid white;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      const marker = L.marker([latitude, longitude], { icon: pinIcon }).addTo(map);
      markerRef.current = marker;
      mapInstanceRef.current = map;

      // Invalidate size to guarantee correct tile layout
      timer = setTimeout(() => {
        if (mapInstanceRef.current === map) {
          try {
            map.invalidateSize();
          } catch {}
        }
      }, 100);
    } else {
      mapInstanceRef.current.setView([latitude, longitude], 12);
      if (markerRef.current && mapInstanceRef.current.hasLayer(markerRef.current)) {
        markerRef.current.setLatLng([latitude, longitude]);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [latitude, longitude]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (markerRef.current) {
        try {
          markerRef.current.remove();
        } catch {}
        markerRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // STEP 1: Handle State Change
  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    setSelectedState(newState);
    setSelectedDistrict('');
    setSelectedSubdistrict('');
    setSelectedVillage('');
    setCustomPlace('');
    setIsCustomPlaceMode(false);
    setDistricts([]);
    setSubdistricts([]);
    setVillages([]);
    setLatitude(null);
    setLongitude(null);
    setLocationSource('manual');
    setGpsError(null);

    notifyChange(newState, '', '', '', null, null, 'manual');
  };

  // STEP 2: Handle District Change
  const handleDistrictChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDistrict = e.target.value;
    setSelectedDistrict(newDistrict);
    setSelectedSubdistrict('');
    setSelectedVillage('');
    setCustomPlace('');
    setIsCustomPlaceMode(false);
    setSubdistricts([]);
    setVillages([]);
    setLocationSource('manual');
    setGpsError(null);

    // Eagerly resolve district coordinates as base fallback (instant lookup)
    let lat: number | null = null;
    let lng: number | null = null;
    if (newDistrict) {
      const fast = LocationService.resolveDistrictCoordinates(newDistrict);
      lat = fast?.latitude ?? null;
      lng = fast?.longitude ?? null;
    }

    setLatitude(lat);
    setLongitude(lng);
    notifyChange(selectedState, newDistrict, '', '', lat, lng, 'manual');

    // Refine coordinates asynchronously in the background if fast lookup had no coords
    if (newDistrict && (!lat || !lng)) {
      LocationService.resolveLocationCoordinates({
        state: selectedState,
        district: newDistrict,
      }).then((coords) => {
        if (coords) {
          setLatitude(coords.latitude);
          setLongitude(coords.longitude);
        }
      }).catch(() => {});
    }
  };

  // STEP 3: Handle Subdistrict / Tehsil Change
  const handleSubdistrictChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubdistrict = e.target.value;
    setSelectedSubdistrict(newSubdistrict);
    setSelectedVillage('');
    setCustomPlace('');
    setIsCustomPlaceMode(false);
    setVillages([]);
    setLocationSource('manual');
    setGpsError(null);

    // Eagerly resolve subdistrict coordinates
    let lat = latitude;
    let lng = longitude;
    if (newSubdistrict) {
      const coords = await LocationService.resolveLocationCoordinates({
        state: selectedState,
        district: selectedDistrict,
        subdistrict: newSubdistrict,
      });
      if (coords) {
        lat = coords.latitude;
        lng = coords.longitude;
      }
    }

    setLatitude(lat);
    setLongitude(lng);
    notifyChange(selectedState, selectedDistrict, newSubdistrict, '', lat, lng, 'manual');
  };

  // STEP 4: Handle Village Selection
  const handleVillageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVillage = e.target.value;
    setSelectedVillage(newVillage);
    setGpsError(null);

    if (!newVillage) {
      // Fallback to subdistrict or district coordinates
      const coords = await LocationService.resolveLocationCoordinates({
        state: selectedState,
        district: selectedDistrict,
        subdistrict: selectedSubdistrict,
      });
      const lat = coords?.latitude ?? null;
      const lng = coords?.longitude ?? null;
      setLatitude(lat);
      setLongitude(lng);
      notifyChange(selectedState, selectedDistrict, selectedSubdistrict, '', lat, lng, 'manual');
      return;
    }

    // Resolve coordinates with full hierarchical fallback (village -> subdistrict -> district)
    const coords = await LocationService.getGeocodeForVillage({
      state: selectedState,
      district: selectedDistrict,
      subdistrict: selectedSubdistrict,
      village: newVillage,
    });

    const lat = coords?.latitude ?? null;
    const lng = coords?.longitude ?? null;
    setLatitude(lat);
    setLongitude(lng);

    notifyChange(
      selectedState,
      selectedDistrict,
      selectedSubdistrict,
      newVillage,
      lat,
      lng,
      locationSource
    );
  };

  // Custom Village / Town / City entry handler
  const handleCustomPlaceSubmit = async () => {
    const placeName = customPlace.trim();
    if (!placeName) return;

    setSelectedVillage(placeName);
    setGpsError(null);

    const coords = await LocationService.resolveLocationCoordinates({
      state: selectedState,
      district: selectedDistrict,
      subdistrict: selectedSubdistrict,
      village: placeName,
    });

    const lat = coords?.latitude ?? null;
    const lng = coords?.longitude ?? null;
    setLatitude(lat);
    setLongitude(lng);

    notifyChange(
      selectedState,
      selectedDistrict,
      selectedSubdistrict,
      placeName,
      lat,
      lng,
      locationSource
    );
  };

  // GPS Current Location Detection with Reverse Geocoding
  const handleGpsDetect = async () => {
    setIsGpsLoading(true);
    setGpsError(null);

    try {
      const pos = await LocationService.getCurrentPosition();
      if (!pos) {
        setGpsError('जीपीएस अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में लोकेशन अनुमति दें।');
        return;
      }

      // Safe approximate coordinates
      setLatitude(pos.latitude);
      setLongitude(pos.longitude);
      setLocationSource('gps');

      // Reverse geocode to populate State, District, Tehsil, and Place
      const rev = await LocationService.reverseGeocode(pos.latitude, pos.longitude);
      if (rev) {
        if (rev.state) setSelectedState(rev.state);
        if (rev.district) setSelectedDistrict(rev.district);
        if (rev.subdistrict) setSelectedSubdistrict(rev.subdistrict);
        if (rev.place) setSelectedVillage(rev.place);

        notifyChange(
          rev.state || selectedState,
          rev.district || selectedDistrict,
          rev.subdistrict || selectedSubdistrict,
          rev.place || selectedVillage,
          pos.latitude,
          pos.longitude,
          'gps'
        );
      } else {
        notifyChange(
          selectedState,
          selectedDistrict,
          selectedSubdistrict,
          selectedVillage,
          pos.latitude,
          pos.longitude,
          'gps'
        );
      }
    } catch {
      setGpsError('लोकेशन प्राप्त करने में त्रुटि हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsGpsLoading(false);
    }
  };

  // Reset entire selection
  const handleResetAll = () => {
    setSelectedState('');
    setSelectedDistrict('');
    setSelectedSubdistrict('');
    setSelectedVillage('');
    setCustomPlace('');
    setIsCustomPlaceMode(false);
    setLatitude(null);
    setLongitude(null);
    setLocationSource('manual');
    setGpsError(null);
    notifyChange('', '', '', '', null, null, 'manual');
  };

  const hasSelectedLocation = Boolean(selectedState || selectedDistrict || selectedVillage);

  return (
    <div className="space-y-3.5 bg-slate-50/90 p-4 rounded-2xl border border-slate-200 shadow-2xs">
      {/* Top Header & Reset */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs sm:text-sm">
            <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
            <span>{title || (lang === 'hi' ? 'प्राथमिक स्थान चयन (Base Location)' : 'Base Location')}</span>
          </div>

          {hasSelectedLocation && !disabled && (
            <button
              type="button"
              onClick={handleResetAll}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition"
              title="स्थान रीसेट करें"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{lang === 'hi' ? 'रीसेट' : 'Reset'}</span>
            </button>
          )}
        </div>
      )}

      {/* Mode Switch: [मैन्युअल चयन] vs [जीपीएस / वर्तमान स्थान] */}
      {isGpsAllowed && !disabled && (
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveMode('manual')}
            className={`py-2 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeMode === 'manual'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>मैन्युअल चयन</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('gps')}
            className={`py-2 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeMode === 'gps'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>जीपीएस / वर्तमान स्थान</span>
          </button>
        </div>
      )}

      {/* GPS MODE */}
      {activeMode === 'gps' && isGpsAllowed && (
        <div className="p-3.5 bg-white rounded-xl border border-teal-100 space-y-3">
          <p className="text-xs text-slate-600">
            अपने डिवाइस के जीपीएस से अपना गाँव/नगर, तहसील, जिला और राज्य स्वतः प्राप्त करें:
          </p>

          <button
            type="button"
            onClick={handleGpsDetect}
            disabled={isGpsLoading || disabled}
            className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-60"
          >
            {isGpsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>जीपीएस से स्थान प्राप्त हो रहा है...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" />
                <span>वर्तमान जीपीएस स्थान का उपयोग करें</span>
              </>
            )}
          </button>

          {gpsError && (
            <div className="flex items-start gap-1.5 text-rose-600 text-xs bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{gpsError}</span>
            </div>
          )}

          {locationSource === 'gps' && selectedVillage && (
            <div className="p-2.5 bg-teal-50/70 border border-teal-200 rounded-lg text-xs space-y-1 text-teal-900">
              <p className="font-bold flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-teal-700" />
                <span>{lang === 'hi' ? 'जीपीएस द्वारा पहचाना गया स्थान:' : 'GPS Detected Location:'}</span>
              </p>
              <p className="font-medium text-slate-700">
                {lang === 'hi' ? LocationService.localizePlaceName(selectedVillage, 'hi') : selectedVillage}
                {selectedSubdistrict ? ` → ${lang === 'hi' ? LocationService.localizePlaceName(selectedSubdistrict, 'hi') : selectedSubdistrict}` : ''}
                {selectedDistrict ? ` → ${lang === 'hi' ? LocationService.localizePlaceName(selectedDistrict, 'hi') : selectedDistrict}` : ''}
                {selectedState ? ` → ${lang === 'hi' ? LocationService.localizePlaceName(selectedState, 'hi') : selectedState}` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* MANUAL MODE HIERARCHY: State → District → Tehsil / Sub-District → Village / Town / City */}
      {activeMode === 'manual' && (
        <div className="space-y-3">
          {/* 1. State */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs">
              1. राज्य (State) <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedState}
              onChange={handleStateChange}
              disabled={disabled || isLoadingStates}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 disabled:opacity-50"
            >
              <option value="">
                {isLoadingStates
                  ? (lang === 'hi' ? '-- राज्य लोड हो रहे हैं... --' : '-- Loading States... --')
                  : (lang === 'hi' ? '-- राज्य चुनें (Select State) --' : '-- Select State --')}
              </option>
              {states.map((st) => (
                <option key={st.name} value={st.name}>
                  {lang === 'hi' ? (st.nameHi || LocationService.localizePlaceName(st.name, 'hi')) : st.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. District (Dependent on State) */}
          {selectedState && (
            <div className="pt-2 border-t border-slate-200">
              <label className="block font-semibold text-slate-700 mb-1 text-xs">
                2. जिला (District) <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedDistrict}
                onChange={handleDistrictChange}
                disabled={disabled || isLoadingDistricts}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 disabled:opacity-50"
              >
                <option value="">
                  {isLoadingDistricts
                    ? (lang === 'hi' ? '-- जिले लोड हो रहे हैं... --' : '-- Loading Districts... --')
                    : (lang === 'hi' ? '-- जिला चुनें (Select District) --' : '-- Select District --')}
                </option>
                {districts.map((d) => (
                  <option key={d.name} value={d.name}>
                    {lang === 'hi' ? LocationService.localizePlaceName(d.name, 'hi') : d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Tehsil / Sub-District (Dependent on District) */}
          {selectedDistrict && (
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 text-xs">
                  3. तहसील / उप-जिला (Tehsil / Sub-District){' '}
                  {!isLoadingSubdistricts && subdistricts.length > 0 ? `(${subdistricts.length} उपलब्ध)` : ''}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomSubdistrictMode(!isCustomSubdistrictMode)}
                  className="text-[11px] text-teal-700 hover:underline font-semibold"
                >
                  {isCustomSubdistrictMode ? 'सूची से चुनें' : 'सूची में नहीं है? नाम लिखें'}
                </button>
              </div>

              {!isCustomSubdistrictMode ? (
                <select
                  value={selectedSubdistrict}
                  onChange={handleSubdistrictChange}
                  disabled={disabled || isLoadingSubdistricts}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 disabled:opacity-50"
                >
                  <option value="">
                    {isLoadingSubdistricts
                      ? (lang === 'hi' ? '-- तहसीलें लोड हो रही हैं... --' : '-- Loading Tehsils... --')
                      : subdistricts.length === 0
                      ? (lang === 'hi' ? '-- कोई तहसील उपलब्ध नहीं --' : '-- No Tehsils Available --')
                      : (lang === 'hi' ? `-- तहसील चुनें (${subdistricts.length} उपलब्ध) --` : `-- Select Tehsil (${subdistricts.length} available) --`)}
                  </option>
                  {subdistricts.map((sub) => (
                    <option key={sub.name} value={sub.name}>
                      {lang === 'hi' ? LocationService.localizePlaceName(sub.name, 'hi') : sub.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSubdistrict || selectedSubdistrict}
                    onChange={(e) => {
                      setCustomSubdistrict(e.target.value);
                      setSelectedSubdistrict(e.target.value);
                      notifyChange(
                        selectedState,
                        selectedDistrict,
                        e.target.value.trim(),
                        selectedVillage,
                        latitude,
                        longitude,
                        locationSource
                      );
                    }}
                    placeholder="अपनी तहसील या ब्लॉक का नाम लिखें"
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
                  />
                </div>
              )}
            </div>
          )}

          {/* 4. Village / Town / City (Dependent on Tehsil or District) */}
          {(selectedSubdistrict || (selectedDistrict && subdistricts.length === 0 && !isLoadingSubdistricts)) && (
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 text-xs">
                  4. गाँव / कस्बा / नगर (Village / Town / City){' '}
                  {!isLoadingVillages && villages.length > 0 ? `(${villages.length} उपलब्ध)` : ''}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomPlaceMode(!isCustomPlaceMode)}
                  className="text-[11px] text-teal-700 hover:underline font-semibold"
                >
                  {isCustomPlaceMode ? 'सूची से चुनें' : 'सूची में नहीं है? नाम लिखें'}
                </button>
              </div>

              {!isCustomPlaceMode ? (
                <select
                  value={selectedVillage}
                  onChange={handleVillageChange}
                  disabled={disabled || isLoadingVillages}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700 disabled:opacity-50"
                >
                  <option value="">
                    {isLoadingVillages
                      ? (lang === 'hi' ? '-- गाँव लोड हो रहे हैं... --' : '-- Loading Villages... --')
                      : villages.length === 0
                      ? (lang === 'hi' ? '-- कोई गाँव उपलब्ध नहीं --' : '-- No Villages Available --')
                      : (lang === 'hi' ? `-- गाँव या नगर चुनें (${villages.length} उपलब्ध) --` : `-- Select Village (${villages.length} available) --`)}
                  </option>
                  {villages.map((v) => (
                    <option key={v.name} value={v.name}>
                      {lang === 'hi' ? LocationService.localizePlaceName(v.name, 'hi') : v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPlace}
                    onChange={(e) => setCustomPlace(e.target.value)}
                    placeholder="अपने गाँव, कस्बे या नगर का नाम लिखें"
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-teal-700"
                  />
                  <button
                    type="button"
                    onClick={handleCustomPlaceSubmit}
                    className="px-3.5 py-2 bg-teal-700 text-white rounded-xl text-xs font-bold hover:bg-teal-800 transition"
                  >
                    सहेजें
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Empty State Banner: "अपना गाँव या नगर भरे" */}
      {!hasSelectedLocation && (
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span className="font-semibold">अपना गाँव या नगर भरे</span>
        </div>
      )}

      {/* Selected Location Summary */}
      {hasSelectedLocation && selectedVillage && (
        <div className="pt-2 border-t border-slate-200 space-y-2">
          <div className="flex items-start gap-1.5 text-xs text-teal-900 bg-teal-50/70 p-2.5 rounded-xl border border-teal-200/80">
            <CheckCircle className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 truncate">
                {lang === 'hi' ? LocationService.localizePlaceName(selectedVillage, 'hi') : selectedVillage}
              </p>
              <p className="text-[11px] text-slate-600 truncate mt-0.5">
                {selectedSubdistrict ? `${lang === 'hi' ? LocationService.localizePlaceName(selectedSubdistrict, 'hi') : selectedSubdistrict} → ` : ''}
                {selectedDistrict ? `${lang === 'hi' ? LocationService.localizePlaceName(selectedDistrict, 'hi') : selectedDistrict} → ` : ''}
                {lang === 'hi' ? LocationService.localizePlaceName(selectedState, 'hi') : selectedState}
              </p>
            </div>
          </div>

          {/* Leaflet + OpenStreetMap Mini Map Preview */}
          {latitude && longitude && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span className="flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-teal-600" />
                  <span>मानचित्र पर अनुमानित स्थिति (OpenStreetMap)</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  {locationSource === 'gps' ? 'जीपीएस द्वारा' : 'क्षेत्रीय निर्देशांक'}
                </span>
              </div>
              <div
                ref={mapContainerRef}
                className="w-full h-36 rounded-xl border border-slate-300 overflow-hidden shadow-inner relative z-0"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
