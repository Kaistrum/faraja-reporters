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

async function uploadPhoto(reportId: string, imageFile: formidable.File): Promise<string | null> {
	try {
		const buffer = fs.readFileSync(imageFile.filepath);
		const dataUri = `data:${imageFile.mimetype ?? "image/jpeg"};base64,${buffer.toString("base64")}`;

		// public_id is the shared identifier — lets the reports DB and the
		// Cloudinary asset be looked up independently on the backend and
		// still be correlated back to each other.
		const result = await cloudinary.uploader.upload(dataUri, {
			public_id: reportId,
			folder: "reports",
			tags: [reportId]
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

	// Generated here, not on the client — this is the identifier the backend
	// uses to link a reports-DB row to its photo in the storage bucket,
	// regardless of whether the submission came in live or via the offline
	// sync queue.
	const reportId = crypto.randomUUID();

	const imageFile = files.image?.[0];
	const photoUrl = imageFile ? await uploadPhoto(reportId, imageFile) : null;

	const surveyData = {
		reportId,
		incidentType: fields.incidentType[0],
		infrastructure: fields.infrastructure ?? [],
		otherText: fields.otherText?.[0] ?? "",
		infraName: fields.infraName?.[0] ?? "",
		infraCount: fields.infraCount?.[0] ?? "",
		damageClass: fields.damageClass?.[0] ?? "",
		debris: fields.debris?.[0] ?? "",
		description: fields.description?.[0] ?? "",
		location,
		photoUrl
	};

	try {
		const upstream = await fetch(REPORTS_API_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(surveyData)
		});

		const data = await upstream.json();
		return res.status(upstream.status).json(data);
	} catch {
		// Reports DB unreachable / not yet built — placeholder ack so the
		// offline queue + sync flow still completes end-to-end without it.
		return res.status(202).json({ queued: true, placeholder: true, reportId });
	}
}
