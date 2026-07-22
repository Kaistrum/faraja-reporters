const TILE_CACHE = "map-tiles-v1";
const TILE_HOSTS = [
	"tile.openstreetmap.org",
	"server.arcgisonline.com",
	"basemaps.cartocdn.com",
	"tile.opentopomap.org"
];

self.addEventListener("install", (event) => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

function isTileRequest(url) {
	return TILE_HOSTS.some((host) => url.hostname.endsWith(host));
}

// Stale-while-revalidate: serve the cached tile immediately if present, and
// refresh the cache in the background — organically caches every tile the
// user has seen while online, and serves them back when offline.
async function handleTileRequest(request) {
	const cache = await caches.open(TILE_CACHE);
	const cached = await cache.match(request);

	const networkFetch = fetch(request)
		.then((response) => {
			if (response && response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => undefined);

	return cached ?? (await networkFetch) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (event.request.method === "GET" && isTileRequest(url)) {
		event.respondWith(handleTileRequest(event.request));
	}
});
