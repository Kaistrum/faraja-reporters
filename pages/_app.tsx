import "@mantine/core/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/notifications/styles.css";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { appWithTranslation } from "next-i18next/pages";

const theme = createTheme({
	fontFamily: "DMSans",
	primaryColor: "dark"
});

function App({ Component, pageProps }: AppProps) {
	return (
		<MantineProvider theme={theme}>
			<Notifications position="top-right" />
			<Component {...pageProps} />
		</MantineProvider>
	);
}

export default appWithTranslation(App);
