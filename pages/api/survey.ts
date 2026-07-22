import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";

export const config = {
	api: { bodyParser: false }
};

const QUEUE_URL = process.env.QUEUE_SERVICE_URL ?? "http://localhost:5000";

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

	let image: { data: string; mimeType: string; filename: string } | null = null;
	const imageFile = files.image?.[0];
	if (imageFile) {
		try {
			const buffer = fs.readFileSync(imageFile.filepath);
			image = {
				data: buffer.toString("base64"),
				mimeType: imageFile.mimetype ?? "image/jpeg",
				filename: imageFile.originalFilename ?? "photo.jpg"
			};
		} finally {
			fs.unlinkSync(imageFile.filepath);
		}
	}

	const surveyData = {
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

	const upstream = await fetch(`${QUEUE_URL}/survey`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(surveyData)
	});

	const data = await upstream.json();
	return res.status(upstream.status).json(data);
}
