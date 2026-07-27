import { Head, Html, Main, NextScript } from "next/document";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";

export default function Document() {
	return (
		<Html lang="en" {...mantineHtmlProps}>
			<Head>
				<ColorSchemeScript defaultColorScheme="auto" />
				{/* Stratum UI's ThemeProvider defaults to dark and only applies its
				    `.light` class inside a useEffect (after first paint, and never
				    at all on a first-ever visit with no stored preference) — this
				    caused a dark/black flash before hydration. Applying it here,
				    blocking, before paint, matches what defaultTheme="light" in
				    _app.tsx already intends. */}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem("design-system-theme")||"light";document.documentElement.classList.toggle("light",t==="light");}catch(e){}})();`
					}}
				/>
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
				/>
				<link rel="manifest" href="/manifest.json" />
				<meta name="theme-color" content="#005BCC" />
				<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
				<meta name="mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-title" content="Faraja" />
			</Head>
			<body>
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
