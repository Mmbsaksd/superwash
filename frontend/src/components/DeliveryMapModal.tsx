import React, { useEffect, useRef } from 'react';
import { MapPin, Navigation, X, Phone, AlertTriangle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Order } from '../types';
import { LocationService } from '../services/locationService';

export interface DeliveryMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

const createDeliveryPinIcon = () => {
  return L.divIcon({
    className: 'superwash-delivery-pin',
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#059669" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="#ffffff"></circle>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36]
  });
};

export const DeliveryMapModal: React.FC<DeliveryMapModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const hasCoords = order && LocationService.isValidCoordinate(order.pickup_latitude, order.pickup_longitude);
  const lat = hasCoords ? Number(order!.pickup_latitude) : null;
  const lng = hasCoords ? Number(order!.pickup_longitude) : null;

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current || !hasCoords || lat === null || lng === null) return;
    if (typeof window === 'undefined') return;

    try {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 17,
        zoomControl: true
      });
      mapInstanceRef.current = map;

      const tileConfig = LocationService.getTileConfig();
      const tileLayer = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom
      });
      tileLayer.on('tileerror', (error) => {
        console.warn('Notice: Delivery map tile loading failure:', error);
      });
      tileLayer.addTo(map);

      const marker = L.marker([lat, lng], {
        icon: createDeliveryPinIcon(),
        draggable: false
      }).addTo(map);

      marker.bindPopup(
        `<div style="font-family: sans-serif; font-size: 12px; font-weight: bold; padding: 2px;">
          ${order?.customer_name || 'Customer'}<br/>
          <span style="font-size: 10px; color: #64748b; font-weight: normal;">${order?.pickup_address || ''}</span>
        </div>`
      ).openPopup();

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
      console.warn('Notice initializing delivery map preview:', err);
    }
  }, [isOpen, hasCoords, lat, lng, order]);

  if (!isOpen || !order) return null;

  const navUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    : LocationService.getGoogleMapsDirectionsUrl(order);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      data-testid="delivery-map-modal"
    >
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight">
                  Doorstep Location Pin
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  #{order.order_number}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {order.customer_name} • {order.customer_phone}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Viewport Area */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[360px] bg-slate-100">
          {hasCoords ? (
            <div
              ref={mapContainerRef}
              className="w-full h-full min-h-[300px] sm:min-h-[360px]"
              data-testid="delivery-map-container"
              style={{ zIndex: 1 }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
              <p className="text-sm font-bold text-slate-800">No Precise GPS Coordinates</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                The customer booked using a text address without pinning their doorstep on the map.
              </p>
            </div>
          )}
        </div>

        {/* Address Details & Actions Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-3 shrink-0">
          <div className="text-xs text-slate-700 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Delivery Address:</span>
              {hasCoords ? (
                <span className="font-mono text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                  {lat?.toFixed(6)}, {lng?.toFixed(6)}
                </span>
              ) : (
                <span className="text-[11px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                  Text Address Only
                </span>
              )}
            </div>
            <p className="text-slate-600 leading-snug">{order.pickup_address}</p>
            {order.pickup_landmark && (
              <p className="text-slate-500 text-[11px]">Landmark: {order.pickup_landmark}</p>
            )}
            <div className="text-slate-500 font-mono text-[11px] pt-0.5">
              PIN: {order.pickup_pincode} • Slot: {order.pickup_slot}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={`tel:${order.customer_phone}`}
              className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-1.5 transition text-center cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-slate-600" />
              <span>Call Customer</span>
            </a>

            <a
              href={navUrl}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition text-center cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{hasCoords ? 'Start GPS Navigation' : 'Search in Google Maps'}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
