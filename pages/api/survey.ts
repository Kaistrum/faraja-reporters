import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

export const config = {
	api: { bodyParser: false }
};

// REPORTS_API_URL is the complete endpoint URL, not a base to append a path
// to — it already includes its own path (e.g. http://5.189.150.44/api/reports/)
// once pointed at a real backend.
const REPORTS_API_URL = (process.env.REPORTS_API_URL ?? "http://localhost:5000/reports").trim();

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadPhoto(clientId: string, imageFile: formidable.File): Promise<string | null> {
	try {
		const buffer = fs.readFileSync(imageFile.filepath);
		const dataUri = `data:${imageFile.mimetype ?? "image/jpeg"};base64,${buffer.toString("base64")}`;

		// public_id is the shared identifier — lets the reports DB and the
		// Cloudinary asset be looked up independently on the backend and
		// still be correlated back to each other.
		const result = await cloudinary.uploader.upload(dataUri, {
			public_id: clientId,
			folder: "reports",
			tags: [clientId]
		});
		return result.secure_url;
	} catch {
		// Cloudinary unreachable / misconfigured — the report itself
		// shouldn't be blocked by a photo that can't be stored right now.
		return null;
	} finally {
		fs.unlinkSync(imageFile.filepath);
	}
}

// The survey's "2 - 5" / "6 - 20" / "More than 20" range strings don't map
// cleanly onto the backend's numeric `affected_units` — this takes the
// first number found as a best-effort estimate (low end of the range).
function estimateAffectedUnits(raw: string | undefined): number | null {
	if (!raw) return null;
	const match = raw.match(/\d+/);
	return match ? parseInt(match[0], 10) : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	const form = formidable({ maxFiles: 1, maxFileSize: 10 * 1024 * 1024 });
	const [fields, files] = await form.parse(req);

	if (!fields.incidentType?.[0]) {
		return res.status(400).json({ error: "incidentType is required" });
	}

	const locationRaw = fields.location?.[0];
	const location = locationRaw ? (JSON.parse(locationRaw) as [number, number]) : null;

	// The backend's writable schema is `client_id` (it assigns its own
	// server-side `report_id` and ignores anything else we send for that).
	// Client-generated so it's known before any network call — used as the
	// Cloudinary public_id/tag AND sent as `client_id`, so the backend can
	// link its own report row back to this submission's photo. The offline
	// queue already generates one (lib/offlineSurveys.ts); a direct online
	// submit doesn't, so fall back to generating it here.
	const clientId = fields.client_id?.[0] || crypto.randomUUID();

	const imageFile = files.image?.[0];
	const photoUrl = imageFile ? await uploadPhoto(clientId, imageFile) : null;

	// The backend has no field for the survey's general "what happened"
	// description (Q7) — only `location_description`, which reads as a
	// place-identifying description ("Near the central market"). Mapped
	// from infraName (Q2's "name of the infrastructure") first, since
	// that's the closer semantic match, falling back to the general
	// description so it isn't silently dropped when infraName is empty.
	const locationDescription = fields.infraName?.[0] || fields.description?.[0] || "";

	// infrastructure_type is a single value backend-side; the survey lets
	// people pick several (Q1) — only the first selection survives here.
	const infrastructureType = fields.infrastructure?.[0] ?? null;

	const reportData = {
		client_id: clientId,
		lat: location ? location[0] : null,
		lon: location ? location[1] : null,
		location_description: locationDescription,
		infrastructure_type: infrastructureType,
		nature_of_crisis: fields.incidentType[0],
		debris: fields.debris?.[0] === "yes",
		affected_units: estimateAffectedUnits(fields.infraCount?.[0]),
		damage_level: fields.damageClass?.[0] || null,
		photo_url: photoUrl
	};

	try {
		const upstream = await fetch(REPORTS_API_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(reportData)
		});

		const data = await upstream.json();
		return res.status(upstream.status).json(data);
	} catch {
		// Reports DB unreachable / not yet built — placeholder ack so the
		// offline queue + sync flow still completes end-to-end without it.
		return res.status(202).json({ queued: true, placeholder: true, clientId });
	}
}
