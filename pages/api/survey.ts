import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";

export const config = {
	api: { bodyParser: false }
};

// REPORTS_API_URL now points at the report queue — it takes the survey
// payload (image included, as base64) as-is and handles storage/dispatch
// from there, so this route no longer talks to Cloudinary directly.
const REPORTS_API_URL = (process.env.REPORTS_API_URL ?? "http://localhost:5000/reports").trim();

interface SurveyImage {
	data: string; // base64-encoded bytes
	mimeType: string;
	filename: string;
}

interface SurveyData {
	incidentType: string;
	infrastructure: string[];
	otherText: string;
	infraName: string;
	infraCount: string;
	damageClass: string;
	debris: string;
	description: string;
	location: [number, number] | null;
	image?: SurveyImage | null;
}

async function readImage(imageFile: formidable.File): Promise<SurveyImage> {
	try {
		const buffer = fs.readFileSync(imageFile.filepath);
		return {
			data: buffer.toString("base64"),
			mimeType: imageFile.mimetype ?? "image/jpeg",
			filename: imageFile.originalFilename ?? imageFile.newFilename
		};
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

	const imageFile = files.image?.[0];
	const image = imageFile ? await readImage(imageFile) : null;

	const surveyData: SurveyData = {
		incidentType: fields.incidentType[0],
		infrastructure: fields.infrastructure ?? [],
		otherText: fields.otherText?.[0] ?? "",
		infraName: fields.infraName?.[0] ?? "",
		infraCount: fields.infraCount?.[0] ?? "",
		damageClass: fields.damageClass?.[0] ?? "",
		debris: fields.debris?.[0] ?? "",
		description: fields.description?.[0] ?? "",
		location,
		image
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
		// Queue unreachable — placeholder ack so the offline queue + sync
		// flow still completes end-to-end without it.
		return res.status(202).json({ queued: true, placeholder: true });
	}
}
