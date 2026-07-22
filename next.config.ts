import type { NextConfig } from "next";
const { i18n } = require("./next-i18next.config");

const nextConfig: NextConfig = {
	reactStrictMode: true,
	output: "standalone",
	i18n,
	turbopack: {
		rules: {
			"*.svg": {
				loaders: [{ loader: "@svgr/webpack", options: { svgo: false } }],
				as: "*.js"
			}
		}
	}
};

export default nextConfig;
