import "@mantine/core/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/notifications/styles.css";
import "@/styles/globals.css";
import { useEffect } from "react";
import type { AppProps } from "next/app";
import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ThemeProvider, useTheme } from "@kaistrum/stratum-ui";
import { appWithTranslation } from "next-i18next/pages";
import { useOfflineSync } from "@/hooks/useOfflineSync";

const theme = createTheme({
	fontFamily: "var(--font-sans)",
	primaryColor: "dark"
});

// Stratum's ThemeProvider only applies the `.light` class when it finds a
// stored preference — on a first-ever visit (no localStorage entry yet) it
// leaves defaultTheme="light" unapplied to the DOM even though its own React
// state already says "light". Keep the class in sync with that state
// ourselves so the very first paint matches.
function ThemeClassSync() {
	const { theme: stratumTheme } = useTheme();

	useEffect(() => {
		document.documentElement.classList.toggle("light", stratumTheme === "light");
	}, [stratumTheme]);

	return null;
}

function MantineBridge({ children }: { children: React.ReactNode }) {
	const { theme: stratumTheme } = useTheme();

	return (
		<MantineProvider theme={theme} forceColorScheme={stratumTheme}>
			<Notifications position="top-right" />
			{children}
		</MantineProvider>
	);
}

function App({ Component, pageProps }: AppProps) {
	useOfflineSync();

	useEffect(() => {
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker.register("/sw.js");
		}
	}, []);

	return (
		<ThemeProvider defaultTheme="light">
			<ThemeClassSync />
			<MantineBridge>
				<Component {...pageProps} />
			</MantineBridge>
		</ThemeProvider>
	);
}

export default appWithTranslation(App);
