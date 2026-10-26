import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (coords: { latitude: number; longitude: number }) => void;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  addressContext?: string;
  title?: string;
}

// Default to central Bengaluru (Richmond Circle / MG Road zone)
const DEFAULT_BENGALURU_LAT = 12.9716;
const DEFAULT_BENGALURU_LNG = 77.5946;

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
  addressContext,
  title = 'Adjust Pickup Location Pin'
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const hasInitialCoords = typeof initialLatitude === 'number' && !isNaN(initialLatitude) &&
                           typeof initialLongitude === 'number' && !isNaN(initialLongitude);

  const [hasExplicitPin, setHasExplicitPin] = useState<boolean>(hasInitialCoords);

  const [lat, setLat] = useState<number>(() => {
    return hasInitialCoords ? (initialLatitude as number) : DEFAULT_BENGALURU_LAT;
  });

  const [lng, setLng] = useState<number>(() => {
    return hasInitialCoords ? (initialLongitude as number) : DEFAULT_BENGALURU_LNG;
  });

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Sync coords when reopening or initial coords change
  useEffect(() => {
    if (isOpen) {
      const hasInitial = typeof initialLatitude === 'number' && !isNaN(initialLatitude) &&
                         typeof initialLongitude === 'number' && !isNaN(initialLongitude);
      setHasExplicitPin(hasInitial);
      const validLat = hasInitial ? (initialLatitude as number) : DEFAULT_BENGALURU_LAT;
      const validLng = hasInitial ? (initialLongitude as number) : DEFAULT_BENGALURU_LNG;
      setLat(validLat);
      setLng(validLng);
      setGeoError(null);
    }
  }, [isOpen, initialLatitude, initialLongitude]);

  // Initialize and tear down Leaflet map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Guard against running in environments without DOM layout (e.g. basic jsdom)
    if (typeof window === 'undefined') return;

    try {
      const centerCoords: [number, number] = [lat, lng];

      // Cleanup prior instance if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: centerCoords,
        zoom: 16,
        zoomControl: true
      });
      mapInstanceRef.current = map;

      // OpenStreetMap tile layer (reliable, zero API key required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

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
        setLat(Number(position.lat.toFixed(6)));
        setLng(Number(position.lng.toFixed(6)));
        setHasExplicitPin(true);
      });

      // Map click event: Move marker to clicked point
      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        setLat(Number(e.latlng.lat.toFixed(6)));
        setLng(Number(e.latlng.lng.toFixed(6)));
        setHasExplicitPin(true);
      });

      // Force layout recalculation after modal transition completes
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 250);

      return () => {
        clearTimeout(timer);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    } catch (err) {
      console.warn('Notice initializing map picker:', err);
    }
  }, [isOpen]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('GPS Geolocation is not supported by your current browser.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const deviceLat = Number(pos.coords.latitude.toFixed(6));
        const deviceLng = Number(pos.coords.longitude.toFixed(6));

        setLat(deviceLat);
        setLng(deviceLng);
        setHasExplicitPin(true);
        setIsLocating(false);

        if (mapInstanceRef.current && markerRef.current) {
          const newPos: [number, number] = [deviceLat, deviceLng];
          markerRef.current.setLatLng(newPos);
          mapInstanceRef.current.flyTo(newPos, 17, { duration: 1.2 });
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setGeoError('Location permission denied. Please click on the map to set your location pin.');
        } else if (err.code === 3) {
          setGeoError('Location request timed out. Please drag the pin on the map.');
        } else {
          setGeoError('Could not determine current location. Please click or drag the pin manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleConfirm = () => {
    if (!hasExplicitPin) {
      setGeoError('Please click on the map or tap "Use My GPS" to mark your exact doorstep before confirming.');
      return;
    }
    onConfirm({ latitude: lat, longitude: lng });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      data-testid="map-location-picker-modal"
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
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
                Drag the blue pin or click anywhere on the map to mark your exact doorstep
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

        {/* Map Viewport Area */}
        <div className="relative flex-1 min-h-[320px] sm:min-h-[420px] bg-slate-100">
          <div
            ref={mapContainerRef}
            className="w-full h-full min-h-[320px] sm:min-h-[420px]"
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
              title="Recentres map on your device's current location"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-brand-600" />
              )}
              <span>{isLocating ? 'Locating...' : 'Use My GPS'}</span>
            </button>
          </div>

          {/* Geolocation Notice Banner */}
          {geoError && (
            <div className="absolute bottom-3 left-3 right-3 z-10 p-2.5 bg-amber-50/95 border border-amber-300 text-amber-900 text-xs rounded-xl shadow-md flex items-center gap-2 backdrop-blur-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-[11px] leading-tight">{geoError}</span>
            </div>
          )}
        </div>

        {/* Footer with Coordinate Feedback & Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
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
              title={!hasExplicitPin ? 'Please click on the map or tap "Use My GPS" to set your pin' : 'Confirm pin coordinates'}
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
