import type { NextConfig } from "next";
import withPWAInit, { runtimeCaching as defaultRuntimeCaching } from "@ducanh2912/next-pwa";
const { i18n } = require("./next-i18next.config");

const nextConfig: NextConfig = {
	reactStrictMode: true,
	output: "standalone",
	i18n,
	webpack(config) {
		// Turbopack's `*.svg` -> React-component rule, ported to webpack (this
		// project builds with `--webpack` so next-pwa's webpack-plugin-based
		// service worker generation can run).
		config.module.rules.push({
			test: /\.svg$/i,
			issuer: /\.[jt]sx?$/,
			use: [{ loader: "@svgr/webpack", options: { svgo: false } }]
		});
		return config;
	}
};

const withPWA = withPWAInit({
	dest: "public",
	extendDefaultRuntimeCaching: true,
	// next-pwa force-reloads the whole page on the `online` event by
	// default — that races with hooks/useOfflineSync.ts, which listens for
	// the same event to flush the IndexedDB queue, and can kill the
	// in-flight /api/survey request mid-upload before it completes.
	reloadOnOnline: false,
	workboxOptions: {
		// Next.js emits `dynamic-css-manifest.json` as an internal build
		// artifact at `.next/`, but never serves it at the public
		// `/_next/dynamic-css-manifest.json` path next-pwa's asset scan
		// assumes — precaching it 404s and fails the whole install step,
		// which silently marks the service worker "redundant". The other
		// three patterns are next-pwa's own defaults, which `exclude`
		// replaces rather than extends, so they're repeated here.
		exclude: [
			/\/_next\/static\/.*(?<!\.p)\.woff2/,
			/\.map$/,
			/^manifest.*\.js$/,
			/dynamic-css-manifest\.json$/
		],
		runtimeCaching: [
			{
				// Inlined rather than referencing an outer constant: Workbox's
				// GenerateSW plugin serializes this callback via `.toString()` into
				// the generated service worker file, which can't carry closures —
				// an outer variable reference here would compile fine but throw
				// `ReferenceError` the first time the service worker runs it.
				// `endsWith`, not exact match — OSM/CARTO/OpenTopoMap all rotate
				// across lettered subdomains (a/b/c.tile.openstreetmap.org, etc.).
				urlPattern: ({ url }) =>
					[
						"tile.openstreetmap.org",
						"server.arcgisonline.com",
						"basemaps.cartocdn.com",
						"tile.opentopomap.org"
					].some((host) => url.hostname.endsWith(host)),
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "map-tiles-v1",
					expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 24 * 60 * 60 },
					cacheableResponse: { statuses: [0, 200] }
				}
			},
			...defaultRuntimeCaching
		]
	}
});

export default withPWA(nextConfig);
