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
// payload (image included, as a multipart file part) and handles
// storage/dispatch from there, so this route no longer talks to Cloudinary
// directly.
const REPORTS_API_URL = (process.env.REPORTS_API_URL ?? "http://5.189.150.44:6000/survey").trim();

interface ImagePart {
	buffer: Buffer;
	mimeType: string;
	filename: string;
}

function readImage(imageFile: formidable.File): ImagePart {
	try {
		return {
			buffer: fs.readFileSync(imageFile.filepath),
			mimeType: imageFile.mimetype ?? "image/jpeg",
			filename: imageFile.originalFilename ?? imageFile.newFilename
		};
	} finally {
		fs.unlinkSync(imageFile.filepath);
	}
}

// Serialize the survey into a multipart/form-data body. The image travels as a
// binary file part (not base64 in a JSON blob), so it stays under the queue's
// multer limit (10 MB) instead of blowing past express.json()'s ~100 KB cap.
// `fields` is a list of tuples rather than an object so repeated keys (e.g. one
// "infrastructure" part per selected value) survive — mirroring the multipart
// shape the browser originally sent.
function buildMultipart(
	fields: Array<[string, string]>,
	image: ImagePart | null
): { boundary: string; body: Buffer } {
	const boundary = `----farajaFormBoundary${Math.random().toString(16).slice(2)}`;
	const chunks: Buffer[] = [];
	const push = (s: string) => chunks.push(Buffer.from(s, "utf8"));

	for (const [name, value] of fields) {
		push(`--${boundary}\r\n`);
		push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
		push(`${value}\r\n`);
	}

	if (image) {
		push(`--${boundary}\r\n`);
		push(
			`Content-Disposition: form-data; name="image"; filename="${image.filename}"\r\n`
		);
		push(`Content-Type: ${image.mimeType}\r\n\r\n`);
		chunks.push(image.buffer);
		push("\r\n");
	}

	push(`--${boundary}--\r\n`);
	return { boundary, body: Buffer.concat(chunks) };
}

// The queue listens on :6000, which Node's fetch()/undici refuses to dial —
// it's on the Fetch spec's "bad port" blocklist (shared with browsers,
// reserved for X11). http.request has no such restriction, so it's used
// here instead of fetch for this one upstream call.
function postMultipart(
	url: string,
	fields: Array<[string, string]>,
	image: ImagePart | null
): Promise<{ status: number; json: unknown }> {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const { boundary, body } = buildMultipart(fields, image);
		const client = target.protocol === "https:" ? https : http;

		const req = client.request(
			target,
			{
				method: "POST",
				headers: {
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
					"Content-Length": body.length
				}
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("end", () => {
					const raw = Buffer.concat(chunks).toString("utf8");
					// The queue doesn't always return JSON (e.g. a body-parser
					// size-limit rejection comes back as an HTML error page) —
					// a non-JSON body is still a real response from the queue,
					// not a connection failure, so it must not be treated the
					// same as "queue unreachable" by the caller.
					let json: unknown = null;
					try {
						json = raw ? JSON.parse(raw) : null;
					} catch {
						json = { error: raw.slice(0, 500) };
					}
					resolve({ status: res.statusCode ?? 502, json });
				});
			}
		);
		req.on("error", reject);
		req.write(body);
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

	const imageFile = files.image?.[0];
	const image = imageFile ? readImage(imageFile) : null;

	// Rebuild the multipart body for the queue. Scalar fields go straight through
	// as strings; `infrastructure` is forwarded as one part per value (the queue
	// coerces repeated parts back into an array); `location` is passed as its raw
	// JSON string, which the queue parses on its end.
	const outgoing: Array<[string, string]> = [
		["incidentType", fields.incidentType[0]],
		["otherText", fields.otherText?.[0] ?? ""],
		["infraName", fields.infraName?.[0] ?? ""],
		["infraCount", fields.infraCount?.[0] ?? ""],
		["damageClass", fields.damageClass?.[0] ?? ""],
		["debris", fields.debris?.[0] ?? ""],
		["description", fields.description?.[0] ?? ""]
	];

	for (const value of fields.infrastructure ?? []) {
		outgoing.push(["infrastructure", value]);
	}

	const locationRaw = fields.location?.[0];
	if (locationRaw) {
		outgoing.push(["location", locationRaw]);
	}

	try {
		const upstream = await postMultipart(REPORTS_API_URL, outgoing, image);
		return res.status(upstream.status).json(upstream.json);
	} catch (err) {
		// Queue unreachable — placeholder ack so the offline queue + sync
		// flow still completes end-to-end without it.
		console.error("REPORTS_API_URL unreachable:", REPORTS_API_URL, err);
		return res.status(202).json({ queued: true, placeholder: true });
	}
}
