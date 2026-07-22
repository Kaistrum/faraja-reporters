import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import { sync_pending_surveys } from "@/lib/offlineSurveys";

async function runSync() {
	const { synced } = await sync_pending_surveys();
	if (synced > 0) {
		notifications.show({
			title: "Synced",
			message: `${synced} queued report${synced > 1 ? "s" : ""} sent successfully.`,
			color: "teal"
		});
	}
}

export function useOfflineSync() {
	useEffect(() => {
		if (navigator.onLine) runSync();

		window.addEventListener("online", runSync);
		return () => window.removeEventListener("online", runSync);
	}, []);
}
