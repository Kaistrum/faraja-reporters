import { useEffect, useRef } from "react";
import {
	MapContainer,
	TileLayer,
	LayersControl,
	useMap,
	useMapEvents
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { UserLocation } from "./Map";

const { BaseLayer } = LayersControl;

function FlyToUser() {
	const map = useMap();

	useEffect(() => {
		if (!navigator.geolocation) return;
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				map.flyTo([coords.latitude, coords.longitude], 17, {
					animate: true,
					duration: 1
				});
			},
			null,
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}, [map]);

	return null;
}

function CenterTracker({
	onChange
}: {
	onChange: (latlng: [number, number]) => void;
}) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const map = useMapEvents({
		moveend: () => {
			const { lat, lng } = map.getCenter();
			onChangeRef.current([lat, lng]);
		}
	});

	useEffect(() => {
		const { lat, lng } = map.getCenter();
		onChangeRef.current([lat, lng]);
	}, [map]);

	return null;
}

export default function PinDropMap({
	value,
	onChange
}: {
	value: [number, number] | null;
	onChange: (latlng: [number, number]) => void;
}) {
	return (
		<div
			className="relative overflow-hidden rounded-lg"
			style={{ height: "400px" }}>
			<MapContainer
				center={value ?? [-1.2921, 36.8219]}
				zoom={14}
				style={{ height: "100%", width: "100%" }}
				zoomControl={true}>
				<LayersControl position="topright">
					<BaseLayer checked name="Streets">
						<TileLayer
							url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
						/>
					</BaseLayer>
					<BaseLayer name="Satellite">
						<TileLayer
							url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
							attribution="Tiles &copy; Esri"
						/>
					</BaseLayer>
					<BaseLayer name="Dark">
						<TileLayer
							url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
							attribution="&copy; OpenStreetMap contributors &copy; CARTO"
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
				<FlyToUser />
				<UserLocation />
				<CenterTracker onChange={onChange} />
			</MapContainer>

			{/* Fixed pin always at map center */}
			<div
				className="pointer-events-none absolute left-1/2 top-1/2 z-[1000]"
				style={{ transform: "translate(-50%, -100%)" }}>
				<span style={{ fontSize: "2rem", lineHeight: 1 }}>📍</span>
				{/* Shadow dot under pin tip */}
				<div
					style={{
						width: "8px",
						height: "3px",
						background: "rgba(0,0,0,0.2)",
						borderRadius: "50%",
						margin: "0 auto"
					}}
				/>
			</div>
		</div>
	);
}
