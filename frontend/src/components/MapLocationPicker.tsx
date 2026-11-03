import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Navigation, X, Check, AlertCircle, Loader2, Search, CheckCircle2, Crosshair, ShieldAlert, Edit3 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationService, GeocodeSearchResult, ReverseGeocodeResult, AccuracyTier } from '../services/locationService';

export interface MapLocationConfirmResult {
  latitude: number;
  longitude: number;
  addressSuggestion?: string;
  pincodeSuggestion?: string;
  areaSuggestion?: string;
  flatBuilding?: string;
  street?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  formattedAddress?: string;
  isVerified?: boolean;
}

export interface MapLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: MapLocationConfirmResult) => void;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  addressContext?: string;
  title?: string;
}

// Default initial viewport center before GPS lock or custom pin placement
const DEFAULT_MAP_CENTER_LAT = 12.9716;
const DEFAULT_MAP_CENTER_LNG = 77.5946;

// Custom high-contrast SVG marker icon to avoid bundler image-asset 404s
const createCustomPinIcon = () => {
  return L.divIcon({
    className: 'superwash-map-pin',
    html: `
      <div style="
        position: relative;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: translate(-18px, -36px);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#0284c7" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="#ffffff"></circle>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36]
  });
};

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialLatitude,
  initialLongitude,
  addressContext = '',
  title = 'Adjust Pickup Location Pin'
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  const hasInitialCoords = typeof initialLatitude === 'number' && !isNaN(initialLatitude) &&
                           typeof initialLongitude === 'number' && !isNaN(initialLongitude) &&
                           LocationService.isValidCoordinate(initialLatitude, initialLongitude);

  const [hasExplicitPin, setHasExplicitPin] = useState<boolean>(hasInitialCoords);

  const [lat, setLat] = useState<number>(() => {
    return hasInitialCoords ? (initialLatitude as number) : DEFAULT_MAP_CENTER_LAT;
  });

  const [lng, setLng] = useState<number>(() => {
    return hasInitialCoords ? (initialLongitude as number) : DEFAULT_MAP_CENTER_LNG;
  });

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // GPS accuracy state
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [accuracyTier, setAccuracyTier] = useState<AccuracyTier>('unknown');
  const [accuracyMessage, setAccuracyMessage] = useState<string | null>(null);

  // Address Separation State
  // 1. Customer-entered flat/house/building details (preserved during pin moves)
  const [flatBuilding, setFlatBuilding] = useState<string>('');
  // 2. Geocoded street/road, area, city, pincode
  const [street, setStreet] = useState<string>('');
  const [area, setArea] = useState<string>('');
  const [city, setCity] = useState<string>('Bengaluru');
  const [stateName, setStateName] = useState<string>('Karnataka');
  const [pincode, setPincode] = useState<string>('');

  const [reverseAddress, setReverseAddress] = useState<ReverseGeocodeResult | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);
  const [isLocationModified, setIsLocationModified] = useState<boolean>(false);

  // Search state - EXPLICIT user-initiated search only (NO keystroke autocomplete)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  const isProviderAvailable = LocationService.isProviderAvailable();

  const extractInitialFlatDetails = (context: string) => {
    if (!context) return '';
    const parts = context.split(',');
    if (parts.length > 1) {
      return parts[0].trim();
    }
    return context.trim();
  };

  const triggerReverseGeocode = useCallback(async (targetLat: number, targetLng: number) => {
    if (!LocationService.isValidCoordinate(targetLat, targetLng)) {
      setReverseAddress(null);
      return;
    }

    setIsReverseGeocoding(true);
    try {
      const res = await LocationService.reverseGeocode(targetLat, targetLng);
      if (res) {
        setReverseAddress(res);
        setStreet(res.street || res.addressLine || '');
        setArea(res.area || '');
        setCity(res.city || 'Bengaluru');
        setStateName(res.state || 'Karnataka');
        setPincode(res.pincode || '');
      } else {
        setReverseAddress(null);
      }
    } catch {
      setReverseAddress(null);
    } finally {
      setIsReverseGeocoding(false);
    }
  }, []);

  // Sync coords and initial state when reopening
  useEffect(() => {
    if (isOpen) {
      const hasInitial = typeof initialLatitude === 'number' && !isNaN(initialLatitude) &&
                         typeof initialLongitude === 'number' && !isNaN(initialLongitude) &&
                         LocationService.isValidCoordinate(initialLatitude, initialLongitude);
      setHasExplicitPin(hasInitial);
      const validLat = hasInitial ? (initialLatitude as number) : DEFAULT_MAP_CENTER_LAT;
      const validLng = hasInitial ? (initialLongitude as number) : DEFAULT_MAP_CENTER_LNG;
      setLat(validLat);
      setLng(validLng);
      setGeoError(null);
      setAccuracyMeters(null);
      setAccuracyMessage(null);
      setSearchQuery('');
      setSearchResults([]);
      setSearchMessage(null);
      setIsLocationModified(false);

      const initFlat = extractInitialFlatDetails(addressContext);
      setFlatBuilding(initFlat);

      if (hasInitial) {
        triggerReverseGeocode(validLat, validLng);
      } else {
        setReverseAddress(null);
        setStreet('');
        setArea('');
        setPincode('');
      }
    }
  }, [isOpen, initialLatitude, initialLongitude, addressContext, triggerReverseGeocode]);

  // Explicit User-Initiated Search (Enter key or Search Button ONLY — strictly compliant with Nominatim policy)
  const handleExecuteSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query || query.length < 3) {
      setSearchMessage('Please enter at least 3 characters to search.');
      return;
    }

    if (!isProviderAvailable) {
      setSearchMessage('Address search provider is not configured. Please drag the pin on the map.');
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);
    try {
      const results = await LocationService.searchAddress(query);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchMessage('No matching localities found. Please try another street or move the pin.');
      }
    } catch (err) {
      console.warn('Search lookup error:', err);
      setSearchMessage('Search unavailable. Please set your pin directly on the map.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: GeocodeSearchResult) => {
    setSearchResults([]);
    setSearchMessage(null);

    const newLat = Number(result.latitude.toFixed(6));
    const newLng = Number(result.longitude.toFixed(6));

    setLat(newLat);
    setLng(newLng);
    setHasExplicitPin(true);
    setIsLocationModified(true);
    setAccuracyMeters(null);
    setAccuracyMessage(null);

    if (result.shortName) {
      setStreet(result.shortName);
    }
    if (result.pincode) {
      setPincode(result.pincode);
    }

    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }

    if (markerRef.current && mapInstanceRef.current) {
      const pos: [number, number] = [newLat, newLng];
      markerRef.current.setLatLng(pos);
      mapInstanceRef.current.flyTo(pos, 17, { duration: 1.0 });
    }

    triggerReverseGeocode(newLat, newLng);
  };

  // Initialize and tear down Leaflet map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;
    if (typeof window === 'undefined') return;

    try {
      const centerCoords: [number, number] = [lat, lng];

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: centerCoords,
        zoom: 16,
        zoomControl: true
      });
      mapInstanceRef.current = map;

      // Configurable tile layer with required OpenStreetMap attribution
      const tileConfig = LocationService.getTileConfig();
      const tileLayer = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom
      });
      tileLayer.on('tileerror', (error) => {
        console.warn('Notice: Map tile loading failure:', error);
      });
      tileLayer.addTo(map);

      // Create draggable pin
      const marker = L.marker(centerCoords, {
        icon: createCustomPinIcon(),
        draggable: true,
        autoPan: true
      }).addTo(map);
      markerRef.current = marker;

      // Marker drag event
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        const newLat = Number(position.lat.toFixed(6));
        const newLng = Number(position.lng.toFixed(6));
        setLat(newLat);
        setLng(newLng);
        setHasExplicitPin(true);
        setIsLocationModified(true);

        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
        setAccuracyMeters(null);
        setAccuracyMessage(null);

        triggerReverseGeocode(newLat, newLng);
      });

      // Map click event
      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        const newLat = Number(e.latlng.lat.toFixed(6));
        const newLng = Number(e.latlng.lng.toFixed(6));
        setLat(newLat);
        setLng(newLng);
        setHasExplicitPin(true);
        setIsLocationModified(true);

        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
        setAccuracyMeters(null);
        setAccuracyMessage(null);

        triggerReverseGeocode(newLat, newLng);
      });

      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 250);

      return () => {
        clearTimeout(timer);
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    } catch (err) {
      console.warn('Notice initializing map picker:', err);
    }
  }, [isOpen]);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setGeoError(null);

    try {
      const pos = await LocationService.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      setLat(pos.latitude);
      setLng(pos.longitude);
      setHasExplicitPin(true);
      setIsLocationModified(true);
      setAccuracyMeters(pos.accuracy);
      setAccuracyTier(pos.accuracyTier);
      setAccuracyMessage(pos.accuracyMessage);

      if (mapInstanceRef.current && markerRef.current) {
        const newPos: [number, number] = [pos.latitude, pos.longitude];
        markerRef.current.setLatLng(newPos);
        mapInstanceRef.current.flyTo(newPos, 17, { duration: 1.2 });

        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }

        if (pos.accuracy && pos.accuracy > 0) {
          accuracyCircleRef.current = L.circle(newPos, {
            radius: Math.min(pos.accuracy, 500),
            color: '#0284c7',
            fillColor: '#38bdf8',
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: '4, 4'
          }).addTo(mapInstanceRef.current);
        }
      }

      await triggerReverseGeocode(pos.latitude, pos.longitude);
    } catch (err: any) {
      if (err.code === 1 || err.code === 'PERMISSION_DENIED') {
        setGeoError('Location permission denied. Please click on the map to set your location pin.');
      } else if (err.code === 3 || err.code === 'TIMEOUT') {
        setGeoError('GPS request timed out. Please drag the pin on the map.');
      } else if (err.code === 'UNSUPPORTED') {
        setGeoError('GPS Geolocation is not supported by your current browser.');
      } else {
        setGeoError('Could not determine current location. Please click or drag the pin manually.');
      }
    } finally {
      setIsLocating(false);
    }
  };

  const buildCombinedAddress = (): string => {
    const parts: string[] = [];
    if (flatBuilding.trim()) parts.push(flatBuilding.trim());
    if (street.trim()) parts.push(street.trim());
    if (area.trim() && area.trim() !== street.trim()) parts.push(area.trim());
    if (city.trim()) parts.push(city.trim());

    let res = parts.join(', ');
    if (pincode.trim()) {
      res += ` - ${pincode.trim()}`;
    }
    return res;
  };

  const handleConfirm = () => {
    if (!hasExplicitPin) {
      setGeoError('Please click on the map or tap "Use My GPS" to mark your exact doorstep before confirming.');
      return;
    }

    const combined = buildCombinedAddress();
    const isVerified = Boolean(reverseAddress && reverseAddress.isVerified);

    const result: MapLocationConfirmResult = {
      latitude: lat,
      longitude: lng
    };

    if (reverseAddress) {
      result.addressSuggestion = combined || reverseAddress.addressLine || street;
      result.pincodeSuggestion = pincode || reverseAddress.pincode;
      result.areaSuggestion = area || reverseAddress.area;
      result.flatBuilding = flatBuilding.trim();
      result.street = street.trim();
      result.area = area.trim();
      result.city = city.trim();
      result.state = stateName.trim();
      result.pincode = pincode.trim();
      result.formattedAddress = combined;
      result.isVerified = isVerified;
    }

    onConfirm(result);
    onClose();
  };

  if (!isOpen) return null;

  const combinedAddressPreview = buildCombinedAddress();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      data-testid="map-location-picker-modal"
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Drag the blue pin to your exact building doorstep
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Close Map"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Address Context Bar */}
        {addressContext && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex items-center gap-2 shrink-0">
            <span className="font-bold text-slate-700 shrink-0">Target Address:</span>
            <span className="truncate">{addressContext}</span>
          </div>
        )}

        {/* Explicit User-Initiated Search Bar (NO Keystroke Autocomplete) */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-col gap-2 shrink-0">
          <form onSubmit={handleExecuteSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isProviderAvailable ? "Enter locality or street (e.g. Indiranagar, HSR Layout)..." : "Search provider unavailable (use map pin)"}
                disabled={!isProviderAvailable || isSearching}
                className="w-full pl-9 pr-3 py-2 bg-white text-xs text-slate-800 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>
            <button
              type="submit"
              disabled={!isProviderAvailable || isSearching || !searchQuery.trim()}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Search</span>
            </button>
          </form>

          {/* Search Message or Feedback */}
          {searchMessage && (
            <div className="text-[11px] text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              {searchMessage}
            </div>
          )}

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-h-36 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.latitude}-${item.longitude}-${idx}`}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 flex items-start gap-2 transition cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{item.shortName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{item.displayName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map Viewport Area */}
        <div className="relative flex-1 min-h-[260px] sm:min-h-[320px] bg-slate-100">
          <div
            ref={mapContainerRef}
            className="w-full h-full min-h-[260px] sm:min-h-[320px]"
            data-testid="map-container"
            style={{ zIndex: 1 }}
          />

          {/* Quick Floating Controls on Top of Map */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="py-2 px-3.5 bg-white/95 hover:bg-white text-slate-800 text-xs font-bold rounded-xl shadow-md border border-slate-200 backdrop-blur-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
              title="Recentres map on your device's current high-accuracy GPS"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-brand-600" />
              )}
              <span>{isLocating ? 'Acquiring GPS...' : 'Use My GPS'}</span>
            </button>
          </div>

          {/* GPS Accuracy Status Badge */}
          {accuracyMessage && (
            <div
              className={`absolute top-3 left-3 z-10 px-2.5 py-1.5 rounded-xl shadow-md border backdrop-blur-sm text-[11px] font-semibold flex items-center gap-1.5 ${
                accuracyTier === 'precise'
                  ? 'bg-emerald-50/95 border-emerald-300 text-emerald-800'
                  : accuracyTier === 'approximate'
                  ? 'bg-amber-50/95 border-amber-300 text-amber-800'
                  : 'bg-rose-50/95 border-rose-300 text-rose-800'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>{accuracyMessage}</span>
            </div>
          )}

          {/* Geolocation Notice Banner */}
          {geoError && (
            <div className="absolute top-12 left-3 right-3 z-10 p-2.5 bg-amber-50/95 border border-amber-300 text-amber-900 text-xs rounded-xl shadow-md flex items-center gap-2 backdrop-blur-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-[11px] leading-tight">{geoError}</span>
            </div>
          )}
        </div>

        {/* Synchronized Address Review & Customer Customization Section */}
        <div className="p-3.5 bg-white border-t border-slate-200 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-brand-600" />
              Doorstep Address Details
            </span>
            {reverseAddress?.isVerified ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified Geolocation
              </span>
            ) : isReverseGeocoding ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin text-brand-600" />
                Resolving address...
              </span>
            ) : hasExplicitPin ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <ShieldAlert className="w-3 h-3 text-amber-600" />
                Unverified text address (pin placed manually)
              </span>
            ) : null}
          </div>

          {/* Customer Flat / Building Field (Preserved across pin movements) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                Flat / House / Floor / Building (Customer details)
              </label>
              <input
                type="text"
                value={flatBuilding}
                onChange={(e) => setFlatBuilding(e.target.value)}
                placeholder="e.g. Flat 402, 4th Floor, Sunshine Apts"
                className="w-full px-2.5 py-1.5 bg-slate-50 text-slate-800 text-xs rounded-lg border border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                Street & Locality (From Map Pin)
              </label>
              <input
                type="text"
                value={street || area ? `${street}${area && street !== area ? `, ${area}` : ''}` : ''}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="e.g. 100 Feet Road, Indiranagar"
                className="w-full px-2.5 py-1.5 bg-slate-50 text-slate-800 text-xs rounded-lg border border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Combined Address Preview */}
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 block uppercase">Combined Doorstep Address:</span>
              <p className="text-slate-800 font-medium text-xs truncate">
                {combinedAddressPreview || 'Drag marker or type address details above'}
              </p>
            </div>
            {pincode && (
              <span className="text-[11px] font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                PIN: {pincode}
              </span>
            )}
          </div>
        </div>

        {/* Footer with Coordinate Feedback & Actions */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 font-mono">
            <span className="font-bold text-slate-700">Selected Pin:</span>{' '}
            {hasExplicitPin ? (
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            ) : (
              <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 text-[10px] font-sans font-semibold">
                Pin not placed yet (click map or use GPS)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!hasExplicitPin}
              className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
              title={!hasExplicitPin ? 'Please click on the map or tap "Use My GPS" to set your pin' : 'Confirm pin coordinates and address'}
            >
              <Check className="w-4 h-4" />
              <span>Confirm Location Pin</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
