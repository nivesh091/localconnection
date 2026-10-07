import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Navigation, Layers, RefreshCw, ChevronDown, Check } from 'lucide-react';
import { WorkerProfile, Requirement, getPriceUnitLabel, CommentReference } from '../types';
import { WorkerService, setMapCacheInvalidator } from '../services/workerService';
import { RequirementService } from '../services/requirementService';
import { LocationService } from '../services/locationService';
import { MapService } from '../services/mapService';
import { WorkerDetailModal } from '../components/WorkerDetailModal';
import { RequirementDetailModal } from '../components/RequirementDetailModal';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';

interface MapPageProps {
  onOpenChat: (userId: string, commentRef?: CommentReference | null) => void;
  onRequireAuth: () => void;
  initialWorkerId?: string | null;
}

// Module-level cache for instant map rendering and profile lookups
let cachedMapWorkers: WorkerProfile[] | null = null;
let cachedMapRequirements: Requirement[] | null = null;

export function invalidateMapWorkersCache(): void {
  cachedMapWorkers = null;
}
export function invalidateMapRequirementsCache(): void {
  cachedMapRequirements = null;
}
setMapCacheInvalidator(invalidateMapWorkersCache);

export const MapPage: React.FC<MapPageProps> = ({
  onOpenChat,
  onRequireAuth,
  initialWorkerId,
}) => {
  const { t, lang } = useTranslation();
  const { location: profileLocation } = useAuth();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const workerMarkersRef = useRef<L.Marker[]>([]);
  const densityMarkersRef = useRef<L.Marker[]>([]);
  const requirementMarkersRef = useRef<L.Marker[]>([]);
  const reqDensityMarkersRef = useRef<L.Marker[]>([]);

  const [workers, setWorkers] = useState<WorkerProfile[]>(() => cachedMapWorkers || []);
  const workersRef = useRef<WorkerProfile[]>(workers);
  workersRef.current = workers;

  const [requirements, setRequirements] = useState<Requirement[]>(() => cachedMapRequirements || []);
  const requirementsRef = useRef<Requirement[]>(requirements);
  requirementsRef.current = requirements;

  const [selectedWorker, setSelectedWorker] = useState<WorkerProfile | null>(null);
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number>(10);
  const selectedRadiusRef = useRef<number>(selectedRadius);
  selectedRadiusRef.current = selectedRadius;

  const [showRadiusDropdown, setShowRadiusDropdown] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Restore worker modal on refresh / initialWorkerId change - Instant cache lookup
  useEffect(() => {
    if (initialWorkerId) {
      // 1. Instant check in loaded / cached worker profiles
      const existing = (cachedMapWorkers || workersRef.current).find((w) => w.user_id === initialWorkerId);
      if (existing) {
        setSelectedWorker(existing);
        const lat = Number(existing.location?.latitude);
        const lng = Number(existing.location?.longitude);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 14);
        }
      }

      // 2. Hydrate full details in background
      WorkerService.getWorkerDetail(initialWorkerId).then(async (w) => {
        if (w) {
          let lat = Number(w.location?.latitude);
          let lng = Number(w.location?.longitude);

          if ((!lat || !lng || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) && w.location) {
            const coords = await LocationService.resolveLocationCoordinates({
              village: w.location.place,
              subdistrict: w.location.landmark || undefined,
              district: w.location.district,
              state: w.location.state,
            });
            if (coords) {
              lat = coords.latitude;
              lng = coords.longitude;
              w.location.latitude = lat;
              w.location.longitude = lng;
            }
          }

          setSelectedWorker(w);
          if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && mapInstanceRef.current) {
            mapInstanceRef.current.setView([lat, lng], 14);
          }
        }
      });
    } else {
      setSelectedWorker(null);
    }
  }, [initialWorkerId]);

  // Back navigation hierarchy for worker details modal (Point 5 & Issue 3)
  useEffect(() => {
    const handlePopState = () => {
      if (!window.location.hash.includes('worker=')) {
        setSelectedWorker(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenDetail = (worker: WorkerProfile) => {
    setSelectedWorker(worker);
    window.history.pushState(
      { tab: 'map', workerId: worker.user_id },
      '',
      `#map?worker=${encodeURIComponent(worker.user_id)}`
    );
  };

  const handleCloseDetail = () => {
    setSelectedWorker(null);
    if (window.location.hash.includes('worker=')) {
      window.history.back();
    }
  };

  // Initialize Map with Leaflet + OpenStreetMap (Section 31)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default India center (approx 22.5, 78.5, zoom 5)
    const map = L.map(mapContainerRef.current, {
      center: [22.9734, 78.6569],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
      keepBuffer: 2,
      updateWhenIdle: true,
      updateWhenZooming: false,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Fast-invalidate map size once layout completes to prevent grey tile gaps
    requestAnimationFrame(() => {
      if (mapInstanceRef.current === map) {
        try {
          map.invalidateSize();
        } catch {}
      }
    });
    const timer = setTimeout(() => {
      if (mapInstanceRef.current === map) {
        try {
          map.invalidateSize();
        } catch {}
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      if (userMarkerRef.current) {
        try {
          userMarkerRef.current.remove();
        } catch {}
        userMarkerRef.current = null;
      }
      if (radiusCircleRef.current) {
        try {
          radiusCircleRef.current.remove();
        } catch {}
        radiusCircleRef.current = null;
      }
      workerMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      workerMarkersRef.current = [];
      densityMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      densityMarkersRef.current = [];
      requirementMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      requirementMarkersRef.current = [];
      reqDensityMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      reqDensityMarkersRef.current = [];
      lastRenderedZoomRef.current = null;
      lastRenderedWorkersRef.current = null;
      try {
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
    };
  }, []);

  // Fetch real workers and display workers with coordinates immediately, resolving remaining in background
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const res = await WorkerService.getWorkers({}, 0, 100);
        if (!isMounted) return;

        // Partition workers: render those with verified coordinates immediately
        const immediate: WorkerProfile[] = [];
        const needsGeo: WorkerProfile[] = [];

        for (const w of res.workers) {
          const lat = Number(w.location?.latitude);
          const lng = Number(w.location?.longitude);
          if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            immediate.push(w);
          } else if (w.location) {
            needsGeo.push(w);
          }
        }

        // Show available workers immediately on map (0ms waiting)
        if (immediate.length > 0 && isMounted) {
          cachedMapWorkers = immediate;
          setWorkers(immediate);
        }

        // Resolve coordinates for remaining workers with capped concurrency (max 6)
        if (needsGeo.length > 0) {
          const toResolve = needsGeo.slice(0, 6);
          const resolvedList = await Promise.all(
            toResolve.map(async (w) => {
              const coords = await LocationService.resolveLocationCoordinates({
                village: w.location?.place,
                subdistrict: w.location?.landmark || undefined,
                district: w.location?.district,
                state: w.location?.state,
              });
              if (coords) {
                return {
                  ...w,
                  location: {
                    ...w.location!,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  },
                };
              }
              return null;
            })
          );

          if (!isMounted) return;
          const newlyResolved: WorkerProfile[] = [];
          for (const item of resolvedList) {
            if (item) newlyResolved.push(item as WorkerProfile);
          }
          if (newlyResolved.length > 0) {
            const combined: WorkerProfile[] = [...immediate, ...newlyResolved];
            cachedMapWorkers = combined;
            setWorkers(combined);
          }
        }
      } catch (err) {
        console.warn('Map worker load warning:', err);
      }
    }

    load();

    // Auto-refresh when internet connectivity returns
    const handleOnline = () => {
      load();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Fetch real requirements and display requirements with coordinates on map
  useEffect(() => {
    let isMounted = true;

    async function loadReqs() {
      try {
        const reqs = await RequirementService.getPublicRequirements({}, undefined);
        if (!isMounted) return;

        const immediate: Requirement[] = [];
        const needsGeo: Requirement[] = [];

        for (const r of reqs) {
          const lat = Number(r.latitude);
          const lng = Number(r.longitude);
          if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            immediate.push(r);
          } else {
            needsGeo.push(r);
          }
        }

        if (immediate.length > 0 && isMounted) {
          cachedMapRequirements = immediate;
          setRequirements(immediate);
        }

        if (needsGeo.length > 0) {
          const toResolve = needsGeo.slice(0, 6);
          const resolvedList = await Promise.all(
            toResolve.map(async (r) => {
              const coords = await LocationService.resolveLocationCoordinates({
                village: r.place || undefined,
                subdistrict: r.subdistrict || r.tehsil || undefined,
                district: r.district || undefined,
                state: r.state || undefined,
              });
              if (coords) {
                return {
                  ...r,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                };
              }
              return null;
            })
          );

          if (!isMounted) return;
          const newlyResolved: Requirement[] = [];
          for (const item of resolvedList) {
            if (item) newlyResolved.push(item as Requirement);
          }
          if (newlyResolved.length > 0) {
            const combined: Requirement[] = [...immediate, ...newlyResolved];
            cachedMapRequirements = combined;
            setRequirements(combined);
          }
        }
      } catch (err) {
        console.warn('Map requirement load warning:', err);
      }
    }

    loadReqs();

    const handleOnline = () => {
      loadReqs();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Track rendered zoom level to skip unnecessary DOM marker reconstruction during pan
  const lastRenderedZoomRef = useRef<number | null>(null);
  const lastRenderedWorkersRef = useRef<WorkerProfile[] | null>(null);
  const lastRenderedRequirementsRef = useRef<Requirement[] | null>(null);

  // Render worker layers based on zoom level (Level 1: India density, Level 2: State/District density, Level 3: Individual workers)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const renderMapLayers = (force = false) => {
      const zoom = map.getZoom();
      const isIndividual = zoom >= 12;

      // If we are already in individual mode and data haven't changed,
      // Leaflet automatically handles panning coordinates. Skip costly DOM re-creation.
      if (
        !force &&
        isIndividual &&
        lastRenderedZoomRef.current !== null &&
        lastRenderedZoomRef.current >= 12 &&
        workerMarkersRef.current.length > 0 &&
        workers === lastRenderedWorkersRef.current &&
        requirements === lastRenderedRequirementsRef.current
      ) {
        return;
      }

      // Clean up previous markers from map
      workerMarkersRef.current.forEach((m) => m.remove());
      workerMarkersRef.current = [];
      densityMarkersRef.current.forEach((m) => m.remove());
      densityMarkersRef.current = [];
      requirementMarkersRef.current.forEach((m) => m.remove());
      requirementMarkersRef.current = [];
      reqDensityMarkersRef.current.forEach((m) => m.remove());
      reqDensityMarkersRef.current = [];

      lastRenderedZoomRef.current = zoom;
      lastRenderedWorkersRef.current = workers;
      lastRenderedRequirementsRef.current = requirements;

      if (isIndividual) {
        // LEVEL 3: HIGH ZOOM / LOCAL AREA (zoom >= 12)
        // Show actual individual worker markers with full details and popup preview
        const coordinateCount: Record<string, number> = {};

        workers.forEach((worker) => {
          let lat = Number(worker.location?.latitude);
          let lng = Number(worker.location?.longitude);
          if (!lat || !lng || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

          // Minor collision jitter for overlapping coordinates
          const key = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
          if (coordinateCount[key]) {
            const offset = coordinateCount[key] * 0.0012;
            lat += offset;
            lng += offset;
            coordinateCount[key]++;
          } else {
            coordinateCount[key] = 1;
          }

          const rawName = worker.profile?.name || 'सेवा विशेषज्ञ';
          // Strip artificial leading zeros (e.g. "0000000004" -> "4")
          const name = /^0+\d+$/.test(rawName.trim()) ? rawName.trim().replace(/^0+/, '') : rawName;
          const category = worker.category?.name_hi || worker.other_category || 'सेवा विशेषज्ञ';
          const price = worker.price_per_day;

          // Custom HTML Marker Icon with horizontal display, centered, never wraps digits vertically
          const customIcon = L.divIcon({
            className: 'custom-map-pin',
            html: `
              <div style="background-color: #0f766e; color: white; padding: 4px 10px; border-radius: 14px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; line-height: 1; text-align: center; min-width: 32px; transform: translate(-50%, -50%);">
                <span style="flex-shrink: 0;">🔧</span>
                <span style="white-space: nowrap; font-variant-numeric: tabular-nums;">${name}</span>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

          const priceUnitStr = getPriceUnitLabel(worker.price_unit, worker.custom_price_unit, 'hi');

          // Popup preview with natural word-wrapping and compact name/category spacing
          const popupContent = document.createElement('div');
          popupContent.className = 'p-1 text-xs text-slate-800 space-y-0.5';
          popupContent.innerHTML = `
            <div style="font-weight: bold; font-size: 13px; line-height: 1.25; word-break: break-word;">${rawName}</div>
            <div style="color: #0f766e; font-weight: 600; font-size: 11px; margin-top: 2px;">${category}</div>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">₹${price} / ${priceUnitStr}</div>
          `;

          const btn = document.createElement('button');
          btn.innerText = 'प्रोफ़ाइल देखें';
          btn.style.cssText =
            'margin-top: 6px; width: 100%; background: #0f766e; color: white; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;';
          btn.onclick = () => {
            handleOpenDetail(worker);
          };
          popupContent.appendChild(btn);

          marker.bindPopup(popupContent);
          workerMarkersRef.current.push(marker);
        });

        // LEVEL 3: REQUIREMENTS (Individual Blue Markers - strictly required: REQUIREMENT MARKER = BLUE)
        requirements.forEach((req) => {
          let lat = Number(req.latitude);
          let lng = Number(req.longitude);
          if (!lat || !lng || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

          // Minor collision jitter for overlapping coordinates
          const key = `req_${lat.toFixed(4)}_${lng.toFixed(4)}`;
          if (coordinateCount[key]) {
            const offset = coordinateCount[key] * 0.0012;
            lat += offset;
            lng += offset;
            coordinateCount[key]++;
          } else {
            coordinateCount[key] = 1;
          }

          const rawTitle = req.short_requirement || req.category || 'आवश्यकता';
          const title = rawTitle.length > 20 ? `${rawTitle.slice(0, 18)}...` : rawTitle;

          // BLUE Requirement Marker with 📋 icon
          const customReqIcon = L.divIcon({
            className: 'custom-map-pin-requirement',
            html: `
              <div style="background-color: #2563eb; color: white; padding: 4px 10px; border-radius: 14px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; line-height: 1; text-align: center; min-width: 32px; transform: translate(-50%, -50%);">
                <span style="flex-shrink: 0;">📋</span>
                <span style="white-space: nowrap; font-variant-numeric: tabular-nums;">${title}</span>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const marker = L.marker([lat, lng], { icon: customReqIcon }).addTo(map);

          const popupContent = document.createElement('div');
          popupContent.className = 'p-1 text-xs text-slate-800 space-y-0.5';
          popupContent.innerHTML = `
            <div style="font-weight: bold; font-size: 13px; line-height: 1.25; word-break: break-word;">${req.short_requirement || req.category}</div>
            <div style="color: #2563eb; font-weight: 600; font-size: 11px; margin-top: 2px;">श्रेणी: ${req.category}</div>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">बजट: ₹${req.maximum_budget || 0}</div>
            ${req.place ? `<div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">स्थान: ${req.place}</div>` : ''}
          `;

          const btn = document.createElement('button');
          btn.innerText = 'आवश्यकता देखें';
          btn.style.cssText =
            'margin-top: 6px; width: 100%; background: #2563eb; color: white; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;';
          btn.onclick = () => {
            setSelectedRequirement(req);
          };
          popupContent.appendChild(btn);

          marker.bindPopup(popupContent);
          requirementMarkersRef.current.push(marker);
        });
      } else {
        // LEVEL 1 & 2: DENSITY VIEW (ZOOM-DEPENDENT)
        // Zoom < 8: Level 1 (Far Zoom / India View) -> Broader regional density
        // 8 <= Zoom < 12: Level 2 (State/District View) -> Localized district density
        const isFarZoom = zoom < 8;
        const clusters = MapService.clusterWorkersByBoundsAndZoom(workers, {
          zoom,
          bounds: map.getBounds(),
        });

        clusters.forEach((cluster) => {
          const densityIcon = L.divIcon({
            className: 'density-map-pin',
            html: isFarZoom
              ? `
                <div style="display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 9999px; background-color: #0f766e; color: white; font-weight: 800; font-size: 12px; border: 2.5px solid white; box-shadow: 0 0 0 6px rgba(15, 118, 110, 0.22), 0 3px 8px rgba(0,0,0,0.35); white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer; padding: 0 6px; font-variant-numeric: tabular-nums;">
                  <span>${cluster.count}</span>
                </div>
              `
              : `
                <div style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 9999px; background-color: #0d9488; color: white; font-weight: 800; font-size: 11px; border: 2px solid white; box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.25), 0 2px 6px rgba(0,0,0,0.25); white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer; padding: 0 5px; font-variant-numeric: tabular-nums;">
                  <span>${cluster.count}</span>
                </div>
              `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const dMarker = L.marker([cluster.lat, cluster.lng], { icon: densityIcon }).addTo(map);

          // Click on density marker smoothly zooms closer into this worker group
          dMarker.on('click', () => {
            const nextZoom = isFarZoom ? 9 : 13;
            map.flyTo([cluster.lat, cluster.lng], nextZoom, { duration: 0.6 });
          });

          dMarker.bindTooltip(
            `<div style="font-size: 11px; font-weight: 600; text-align: center;">${cluster.count} सेवा प्रदाता उपलब्ध<br/><span style="font-size: 10px; color: #0f766e;">ज़ूम करने के लिए क्लिक करें</span></div>`,
            { direction: 'top', offset: [0, -14] }
          );

          densityMarkersRef.current.push(dMarker);
        });

        // REQUIREMENTS DENSITY CLUSTERS (BLUE)
        const reqClusters = MapService.clusterRequirementsByBoundsAndZoom(requirements, {
          zoom,
          bounds: map.getBounds(),
        });

        reqClusters.forEach((cluster) => {
          const reqDensityIcon = L.divIcon({
            className: 'density-map-pin-req',
            html: isFarZoom
              ? `
                <div style="display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 9999px; background-color: #2563eb; color: white; font-weight: 800; font-size: 12px; border: 2.5px solid white; box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.22), 0 3px 8px rgba(0,0,0,0.35); white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer; padding: 0 6px; font-variant-numeric: tabular-nums;">
                  <span>${cluster.count}</span>
                </div>
              `
              : `
                <div style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 9999px; background-color: #3b82f6; color: white; font-weight: 800; font-size: 11px; border: 2px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.25), 0 2px 6px rgba(0,0,0,0.25); white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer; padding: 0 5px; font-variant-numeric: tabular-nums;">
                  <span>${cluster.count}</span>
                </div>
              `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const dMarker = L.marker([cluster.lat, cluster.lng], { icon: reqDensityIcon }).addTo(map);

          dMarker.on('click', () => {
            const nextZoom = isFarZoom ? 9 : 13;
            map.flyTo([cluster.lat, cluster.lng], nextZoom, { duration: 0.6 });
          });

          dMarker.bindTooltip(
            `<div style="font-size: 11px; font-weight: 600; text-align: center;"><span style="color: #2563eb;">${cluster.count} आवश्यकताएँ उपलब्ध</span><br/><span style="font-size: 10px; color: #64748b;">ज़ूम करने के लिए क्लिक करें</span></div>`,
            { direction: 'top', offset: [0, -14] }
          );

          reqDensityMarkersRef.current.push(dMarker);
        });
      }
    };

    renderMapLayers(true);

    const onZoom = () => {
      if (mapInstanceRef.current === map) renderMapLayers(true);
    };
    const onMove = () => {
      if (mapInstanceRef.current === map) renderMapLayers(false);
    };

    map.on('zoomend', onZoom);
    map.on('moveend', onMove);

    return () => {
      try {
        map.off('zoomend', onZoom);
        map.off('moveend', onMove);
      } catch {}
      workerMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      workerMarkersRef.current = [];
      densityMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      densityMarkersRef.current = [];
      requirementMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      requirementMarkersRef.current = [];
      reqDensityMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {}
      });
      reqDensityMarkersRef.current = [];
    };
  }, [workers, requirements]);

  // Helper to place user/profile point on map with radius circle
  const applyPointToMap = (lat: number, lng: number, label: string, isLive: boolean, fitRadius = false) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (isLive) {
      map.flyTo([lat, lng], 13, { duration: 0.8 });
    } else {
      map.setView([lat, lng], 13);
    }

    const userIcon = L.divIcon({
      className: 'user-location-pin',
      html: `
        <div style="width: 18px; height: 18px; background-color: ${isLive ? '#2563eb' : '#0f766e'}; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.35);"></div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    if (userMarkerRef.current && map.hasLayer(userMarkerRef.current)) {
      userMarkerRef.current.setLatLng([lat, lng]);
      userMarkerRef.current.setIcon(userIcon);
      userMarkerRef.current.bindPopup(label);
    } else {
      if (userMarkerRef.current) {
        try {
          userMarkerRef.current.remove();
        } catch {}
      }
      userMarkerRef.current = L.marker([lat, lng], { icon: userIcon }).addTo(map);
      userMarkerRef.current.bindPopup(label);
    }

    const radiusMeters = selectedRadiusRef.current * 1000;
    if (radiusCircleRef.current && map.hasLayer(radiusCircleRef.current)) {
      radiusCircleRef.current.setLatLng([lat, lng]);
      radiusCircleRef.current.setRadius(radiusMeters);
    } else {
      if (radiusCircleRef.current) {
        try {
          radiusCircleRef.current.remove();
        } catch {}
      }
      radiusCircleRef.current = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#0f766e',
        fillColor: '#0f766e',
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);
    }

    if (fitRadius) {
      try {
        const bounds = L.latLng(lat, lng).toBounds(radiusMeters * 2);
        map.fitBounds(bounds, {
          padding: [30, 30],
          maxZoom: 14,
        });
      } catch (err) {
        console.warn('Map fitBounds warning:', err);
      }
    }
  };

  // Profile location fallback: If live GPS is not active, point map to user's selected profile location
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (userLocation) return; // Do not overwrite explicit live GPS location

    if (profileLocation) {
      const lat = Number(profileLocation.latitude);
      const lng = Number(profileLocation.longitude);

      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        applyPointToMap(
          lat,
          lng,
          `${lang === 'hi' ? 'चयनित स्थान' : 'Selected Location'}: ${LocationService.formatFullDetails(profileLocation, '', lang)}`,
          false
        );
      } else if (profileLocation.district) {
        const districtCoords = LocationService.resolveDistrictCoordinates(profileLocation.district);
        if (districtCoords && !userLocation && mapInstanceRef.current) {
          applyPointToMap(
            districtCoords.latitude,
            districtCoords.longitude,
            `${lang === 'hi' ? 'चयनित स्थान' : 'Selected Location'}: ${LocationService.formatFullDetails(profileLocation, '', lang)}`,
            false
          );
        } else if (profileLocation.place || profileLocation.state) {
          LocationService.resolveLocationCoordinates({
            village: profileLocation.place,
            subdistrict: profileLocation.landmark || undefined,
            district: profileLocation.district,
            state: profileLocation.state,
          }).then((coords) => {
            if (coords && !userLocation && mapInstanceRef.current) {
              applyPointToMap(
                coords.latitude,
                coords.longitude,
                `${lang === 'hi' ? 'चयनित स्थान' : 'Selected Location'}: ${LocationService.formatFullDetails(profileLocation, '', lang)}`,
                false
              );
            }
          });
        }
      }
    } else {
      const lastKnown = LocationService.getLastKnownPosition();
      if (lastKnown && !userLocation && mapInstanceRef.current) {
        applyPointToMap(
          lastKnown.latitude,
          lastKnown.longitude,
          'पिछली ज्ञात लोकेशन (Last Known Location)',
          false
        );
      }
    }
  }, [profileLocation, userLocation]);

  // Handle "Your Current Location" control (Section 32)
  const handleCurrentLocation = async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const pos = await LocationService.getCurrentPosition();
      if (!pos) {
        setLocationError('लोकेशन अनुमति नहीं मिली या उपलब्ध नहीं है।');
        setTimeout(() => setLocationError(null), 3500);
        return;
      }

      const { latitude, longitude } = pos;
      setUserLocation({ lat: latitude, lng: longitude });
      LocationService.setLastKnownPosition(latitude, longitude);

      applyPointToMap(
        latitude,
        longitude,
        'आपकी लाइव लोकेशन (Live GPS Location)',
        true,
        true
      );
    } catch {
      setLocationError('लोकेशन प्राप्त नहीं हो सकी।');
      setTimeout(() => setLocationError(null), 3500);
    } finally {
      setIsLocating(false);
    }
  };

  // Update radius circle when radius changes
  const handleRadiusChange = (r: number) => {
    setSelectedRadius(r);
    selectedRadiusRef.current = r;
    const map = mapInstanceRef.current;
    if (!map) return;

    // Resolve current center: userLocation > profileLocation > userMarker > lastKnownPosition > mapCenter
    let centerLat = userLocation?.lat;
    let centerLng = userLocation?.lng;

    if (centerLat === undefined || centerLng === undefined) {
      if (profileLocation && Number(profileLocation.latitude) && Number(profileLocation.longitude)) {
        centerLat = Number(profileLocation.latitude);
        centerLng = Number(profileLocation.longitude);
      } else if (profileLocation?.district) {
        const dCoords = LocationService.resolveDistrictCoordinates(profileLocation.district);
        if (dCoords) {
          centerLat = dCoords.latitude;
          centerLng = dCoords.longitude;
        }
      }

      if (centerLat === undefined || centerLng === undefined) {
        if (userMarkerRef.current && map.hasLayer(userMarkerRef.current)) {
          const markerPos = userMarkerRef.current.getLatLng();
          centerLat = markerPos.lat;
          centerLng = markerPos.lng;
        } else {
          const lastKnown = LocationService.getLastKnownPosition();
          if (lastKnown) {
            centerLat = lastKnown.latitude;
            centerLng = lastKnown.longitude;
          } else {
            const mapCenter = map.getCenter();
            centerLat = mapCenter.lat;
            centerLng = mapCenter.lng;
          }
        }
      }
    }

    const radiusMeters = r * 1000;
    if (radiusCircleRef.current && map.hasLayer(radiusCircleRef.current)) {
      radiusCircleRef.current.setLatLng([centerLat, centerLng]);
      radiusCircleRef.current.setRadius(radiusMeters);
    } else {
      if (radiusCircleRef.current) {
        try {
          radiusCircleRef.current.remove();
        } catch {}
      }
      radiusCircleRef.current = L.circle([centerLat, centerLng], {
        radius: radiusMeters,
        color: '#0f766e',
        fillColor: '#0f766e',
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);
    }

    // Adjust view so the selected radius circle is cleanly visible
    try {
      const bounds = L.latLng(centerLat, centerLng).toBounds(radiusMeters * 2);
      map.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 14,
      });
    } catch (err) {
      console.warn('Map fitBounds warning:', err);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-112px)] overflow-hidden">
      {/* Top Floating Controls: "Your Current Location" + Radius circles */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Your Current Location Button */}
        <button
          type="button"
          onClick={handleCurrentLocation}
          disabled={isLocating}
          className="pointer-events-auto bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 shadow-md text-xs font-bold text-slate-800 hover:bg-slate-50 active:scale-95 transition flex items-center gap-2 shrink-0"
        >
          <Navigation className={`w-3.5 h-3.5 text-teal-700 ${isLocating ? 'animate-spin' : ''}`} />
          <span>{t.currentLocation}</span>
        </button>

        {/* Worker Count Display Badge: Always single horizontal line, centered, fits 4, 12, 125, 1000 */}
        <div
          className="pointer-events-auto bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200 shadow-md text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[40px] text-center"
          title={lang === 'hi' ? `उपलब्ध सेवा विशेषज्ञ: ${workers.length}` : `Available Service Professionals: ${workers.length}`}
        >
          <span className="text-teal-700 text-xs">🔧</span>
          <span className="font-mono text-xs sm:text-sm font-extrabold text-teal-900 whitespace-nowrap px-1 py-0.2 bg-teal-50 border border-teal-200/80 rounded-md">
            {workers.length}
          </span>
          <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
            {lang === 'hi' ? 'सेवा विशेषज्ञ' : 'Service Experts'}
          </span>
        </div>

        {/* Requirement Count Display Badge: Shows available requirements on map */}
        <div
          className="pointer-events-auto bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200 shadow-md text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[40px] text-center"
          title={`उपलब्ध आवश्यकताएँ: ${requirements.length}`}
        >
          <span className="text-blue-600 text-xs">📋</span>
          <span className="font-mono text-xs sm:text-sm font-extrabold text-blue-900 whitespace-nowrap px-1 py-0.2 bg-blue-50 border border-blue-200/80 rounded-md">
            {requirements.length}
          </span>
          <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
            आवश्यकताएँ
          </span>
        </div>

        {/* Radius Selector: Single 'Select Radius' dropdown button (Requirement 21) */}
        <div className="relative pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowRadiusDropdown((prev) => !prev)}
            className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 shadow-md text-xs font-bold text-slate-800 hover:bg-slate-50 transition flex items-center gap-1.5"
            title="दायरा चुनें"
          >
            <Layers className="w-3.5 h-3.5 text-teal-700" />
            <span>दायरा: {selectedRadius} km</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {showRadiusDropdown && (
            <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl py-1 z-30 min-w-[130px] text-xs">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                दायरा चुनें (Radius)
              </div>
              {[1, 2, 5, 10, 20, 50, 100, 200].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    handleRadiusChange(r);
                    setShowRadiusDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between transition ${
                    selectedRadius === r ? 'font-bold text-teal-800 bg-teal-50' : 'text-slate-700'
                  }`}
                >
                  <span>{r} km</span>
                  {selectedRadius === r && <Check className="w-3.5 h-3.5 text-teal-700" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Non-intrusive location error notice */}
      {locationError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-rose-50 text-rose-800 border border-rose-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          {locationError}
        </div>
      )}

      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Worker Detail Modal */}
      <WorkerDetailModal
        worker={selectedWorker}
        onClose={handleCloseDetail}
        onOpenChat={onOpenChat}
        onRequireAuth={onRequireAuth}
      />

      {/* Requirement Detail Modal */}
      <RequirementDetailModal
        requirement={selectedRequirement}
        onClose={() => setSelectedRequirement(null)}
        onOpenChat={onOpenChat}
        onRequireAuth={onRequireAuth}
      />
    </div>
  );
};
