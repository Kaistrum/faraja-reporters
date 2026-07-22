import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ActionIcon, Tooltip } from "@mantine/core";

import ChatBot from "./ChatBot";

const { BaseLayer } = LayersControl;

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
							url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
						/>
					</BaseLayer>
					<BaseLayer name="Satellite">
						<TileLayer
							url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
							attribution="Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA"
						/>
					</BaseLayer>
					<BaseLayer name="Dark">
						<TileLayer
							url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
						/>
					</BaseLayer>
					<BaseLayer name="Buildings">
						<TileLayer
							url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
							attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
							maxZoom={17}
						/>
					</BaseLayer>
				</LayersControl>
				<UserLocation />
			</MapContainer>

			<Tooltip label="Crisis Assistant" position="left">
				<ActionIcon
					size={72}
					radius={72}
					color="dark"
					variant="filled"
					aria-label="Open crisis assistant"
					onClick={() => setChatOpen(true)}
					style={{ position: "absolute", bottom: 24, right: 16, zIndex: 100 }}>
					<img src="/chatbot.gif" alt="chatbot" width={36} height={36} />
				</ActionIcon>
			</Tooltip>

			<ChatBot opened={chatOpen} onClose={() => setChatOpen(false)} />
		</div>
	);
}
