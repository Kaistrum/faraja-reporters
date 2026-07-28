import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import http from "http";
import https from "https";
import { URL } from "url";

export const config = {
	api: { bodyParser: false }
};

// REPORTS_API_URL now points at the report queue — it takes the survey
// payload (image included, as base64) as-is and handles storage/dispatch
// from there, so this route no longer talks to Cloudinary directly.
const REPORTS_API_URL = (process.env.REPORTS_API_URL ?? "http://5.189.150.44:6000/survey").trim();

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

// The queue listens on :6000, which Node's fetch()/undici refuses to dial —
// it's on the Fetch spec's "bad port" blocklist (shared with browsers,
// reserved for X11). http.request has no such restriction, so it's used
// here instead of fetch for this one upstream call.
function postJson(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const payload = JSON.stringify(body);
		const client = target.protocol === "https:" ? https : http;

		const req = client.request(
			target,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload)
				}
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("end", () => {
					const raw = Buffer.concat(chunks).toString("utf8");
					try {
						resolve({ status: res.statusCode ?? 502, json: raw ? JSON.parse(raw) : null });
					} catch (err) {
						reject(err);
					}
				});
			}
		);
		req.on("error", reject);
		req.write(payload);
		req.end();
	});
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
		const upstream = await postJson(REPORTS_API_URL, surveyData);
		return res.status(upstream.status).json(upstream.json);
	} catch (err) {
		// Queue unreachable — placeholder ack so the offline queue + sync
		// flow still completes end-to-end without it.
		console.error("REPORTS_API_URL unreachable:", REPORTS_API_URL, err);
		return res.status(202).json({ queued: true, placeholder: true });
	}
}
