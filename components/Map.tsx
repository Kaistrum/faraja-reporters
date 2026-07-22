import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconButton, Tooltip } from "@kaistrum/stratum-ui";
import { getTileUrlsForBounds, type TileLayerConfig } from "@/lib/tileCache";

import ChatBot from "./ChatBot";

const { BaseLayer } = LayersControl;

// Shared with the <TileLayer> URLs below so the warm-up cache never drifts
// out of sync with what's actually rendered.
const TILE_LAYERS: Record<string, TileLayerConfig> = {
	Streets: {
		urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
		subdomains: ["a", "b", "c"]
	},
	Satellite: {
		urlTemplate:
			"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		subdomains: [""]
	},
	Dark: {
		urlTemplate: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
		subdomains: ["a", "b", "c", "d"]
	},
	Buildings: {
		urlTemplate: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
		subdomains: ["a", "b", "c"]
	}
};

const WARM_UP_INTERVAL_MS = 5 * 60 * 1000;

/** Periodically pre-fetches tiles for the current viewport + a buffer while
 * online, so panning slightly after going offline still hits cache. Actual
 * caching happens in the service worker's fetch handler (public/sw.js) —
 * this just requests the URLs so that handler sees them. */
function TileCacheWarmer() {
	const map = useMap();
	const activeLayerRef = useRef("Streets");

	useEffect(() => {
		const onBaseLayerChange = (e: L.LayersControlEvent) => {
			if (e.name in TILE_LAYERS) activeLayerRef.current = e.name;
		};
		map.on("baselayerchange", onBaseLayerChange);
		return () => {
			map.off("baselayerchange", onBaseLayerChange);
		};
	}, [map]);

	useEffect(() => {
		const warmUp = () => {
			if (!navigator.onLine) return;
			const layer = TILE_LAYERS[activeLayerRef.current];
			if (!layer) return;
			const bounds = map.getBounds().pad(1);
			const urls = getTileUrlsForBounds(
				{
					west: bounds.getWest(),
					south: bounds.getSouth(),
					east: bounds.getEast(),
					north: bounds.getNorth()
				},
				map.getZoom(),
				layer
			);
			urls.forEach((url) => {
				fetch(url).catch(() => {});
			});
		};

		warmUp();
		const id = setInterval(warmUp, WARM_UP_INTERVAL_MS);
		return () => clearInterval(id);
	}, [map]);

	return null;
}

export function UserLocation() {
	const map = useMap();
	const markerRef = useRef<L.Marker | null>(null);

	useEffect(() => {
		const style = document.createElement("style");
		style.textContent = `
      @keyframes location-pulse {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50% { transform: scale(2.8); opacity: 0; }
      }
      .location-pulse { animation: location-pulse 1.5s ease-out infinite; }
    `;
		document.head.appendChild(style);

		const cleanup = () => {
			document.head.removeChild(style);
			markerRef.current?.remove();
		};

		if (!navigator.geolocation) return cleanup;

		const pulsingIcon = L.divIcon({
			className: "",
			html: `
        <div style="position:relative;width:20px;height:20px">
          <div class="location-pulse" style="position:absolute;inset:0;background:#3b82f6;border-radius:50%"></div>
          <div style="position:absolute;top:3px;left:3px;width:14px;height:14px;background:#3b82f6;border:2.5px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>
        </div>
      `,
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});

		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const latlng: [number, number] = [coords.latitude, coords.longitude];
				map.flyTo(latlng, 17, { animate: true, duration: 1 });
				if (markerRef.current) {
					markerRef.current.setLatLng(latlng);
				} else {
					markerRef.current = L.marker(latlng, { icon: pulsingIcon }).addTo(
						map
					);
				}
			},
			null,
			{ enableHighAccuracy: true, timeout: 10000 }
		);

		return cleanup;
	}, [map]);

	return null;
}

export default function Map() {
	const [chatOpen, setChatOpen] = useState(false);

	return (
		<div style={{ position: "relative", height: "100%", width: "100%" }}>
			<MapContainer
				center={[-1.2921, 36.8219]}
				zoom={17}
				style={{ height: "100%", width: "100%", zIndex: 10 }}>
				<LayersControl position="topright">
					<BaseLayer name="Streets" checked>
						<TileLayer
							url={TILE_LAYERS.Streets.urlTemplate}
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
						/>
					</BaseLayer>
					<BaseLayer name="Satellite">
						<TileLayer
							url={TILE_LAYERS.Satellite.urlTemplate}
							attribution="Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA"
						/>
					</BaseLayer>
					<BaseLayer name="Dark">
						<TileLayer
							url={TILE_LAYERS.Dark.urlTemplate}
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
						/>
					</BaseLayer>
					<BaseLayer name="Buildings">
						<TileLayer
							url={TILE_LAYERS.Buildings.urlTemplate}
							attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
							maxZoom={17}
						/>
					</BaseLayer>
				</LayersControl>
				<UserLocation />
				<TileCacheWarmer />
			</MapContainer>

			<div style={{ position: "absolute", bottom: 24, right: 16, zIndex: 100 }}>
				<Tooltip content="Crisis Assistant" placement="left">
					<IconButton
						aria-label="Open crisis assistant"
						variant="accent"
						size="lg"
						icon={<img src="/chatbot.gif" alt="" width={36} height={36} />}
						onClick={() => setChatOpen(true)}
						className="!h-[72px] !w-[72px] !rounded-full"
					/>
				</Tooltip>
			</div>

			<ChatBot opened={chatOpen} onClose={() => setChatOpen(false)} />
		</div>
	);
}
