export interface TileLayerConfig {
	urlTemplate: string;
	subdomains: string[];
}

export interface BoundsLike {
	west: number;
	south: number;
	east: number;
	north: number;
}

// Safety net against huge fetch bursts if the map is zoomed far out when a
// warm-up interval fires.
const MAX_WARM_TILES = 300;

function lonToTileX(lon: number, z: number): number {
	return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
	const rad = (lat * Math.PI) / 180;
	return Math.floor(
		((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
	);
}

/** Standard slippy-map tile math — enumerates the {x,y,z} tiles covering `bounds` and builds their URLs from `layer`. */
export function getTileUrlsForBounds(
	bounds: BoundsLike,
	zoom: number,
	layer: TileLayerConfig
): string[] {
	const z = Math.round(zoom);
	const minX = lonToTileX(bounds.west, z);
	const maxX = lonToTileX(bounds.east, z);
	const minY = latToTileY(bounds.north, z);
	const maxY = latToTileY(bounds.south, z);

	const urls: string[] = [];
	let subdomainIndex = 0;

	for (let x = minX; x <= maxX; x++) {
		for (let y = minY; y <= maxY; y++) {
			if (urls.length >= MAX_WARM_TILES) return urls;
			const subdomain = layer.subdomains[subdomainIndex % layer.subdomains.length];
			subdomainIndex++;
			urls.push(
				layer.urlTemplate
					.replace("{s}", subdomain)
					.replace("{z}", String(z))
					.replace("{x}", String(x))
					.replace("{y}", String(y))
					.replace("{r}", "")
			);
		}
	}
	return urls;
}
