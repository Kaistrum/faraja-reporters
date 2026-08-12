import type { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import http from "http";
import https from "https";
import { URL } from "url";
import {
	validate_survey,
	first_error_field,
	ERROR_MESSAGES,
	type SurveyErrors
} from "@/lib/surveyValidation";

export const config = {
	api: { bodyParser: false }
};

// REPORTS_API_URL now points at the report queue — it takes the survey
// payload (image included, as a multipart file part) and handles
// storage/dispatch from there, so this route no longer talks to Cloudinary
// directly.
const REPORTS_API_URL = (process.env.REPORTS_API_URL ?? "http://5.189.150.44:6000/survey").trim();

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Memory storage: the image is forwarded straight to the queue, so there's no
// reason to spill it to disk and clean up temp files afterwards.
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { files: 1, fileSize: MAX_IMAGE_BYTES }
}).single("image");

// Multer is Express middleware; Next's API req/res are close enough for it to
// work on (it only reads the raw request stream and writes to req.body/req.file).
type MulterRequest = NextApiRequest & {
	body: Record<string, string | string[]>;
	file?: Express.Multer.File;
};

function runUpload(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	return new Promise((resolve, reject) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		upload(req as any, res as any, (err: unknown) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

interface ImagePart {
	buffer: Buffer;
	mimeType: string;
	filename: string;
}

// Multer collapses a single occurrence of a field to a string and repeated
// occurrences to an array; normalize both to an array.
function field_values(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function field_value(value: string | string[] | undefined): string {
	return field_values(value)[0] ?? "";
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

	try {
		await runUpload(req, res);
	} catch (err) {
		const tooLarge = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
		console.error("survey upload could not be read:", err);
		return res.status(400).json({
			error: tooLarge
				? "Photo is too large — please use one under 10 MB."
				: "Report upload could not be read"
		});
	}

	const { body, file } = req as MulterRequest;

	const locationRaw = field_value(body.location);
	let location: [number, number] | null = null;
	if (locationRaw) {
		try {
			location = JSON.parse(locationRaw) as [number, number];
		} catch {
			location = null;
		}
	}

	// Last line of defence: the form gates submission, but a direct POST comes
	// through here too, so an incomplete report is rejected before it can reach
	// the report queue.
	const errors: SurveyErrors = validate_survey({
		incidentType: field_value(body.incidentType),
		infrastructure: field_values(body.infrastructure),
		otherText: field_value(body.otherText),
		infraCount: field_value(body.infraCount),
		damageClass: field_value(body.damageClass),
		debris: field_value(body.debris),
		location,
		hasPhoto: Boolean(file)
	});
	const failedField = first_error_field(errors);
	if (failedField) {
		return res.status(400).json({
			// `invalid` marks this as a report the queue will never accept, as
			// opposed to a transient failure worth retrying.
			invalid: true,
			error: ERROR_MESSAGES[errors[failedField]!] ?? "Report is incomplete",
			fields: errors
		});
	}

	// Rebuild the multipart body for the queue. Scalar fields go straight through
	// as strings; `infrastructure` is forwarded as one part per value (the queue
	// coerces repeated parts back into an array); `location` is passed as its raw
	// JSON string, which the queue parses on its end.
	const outgoing: Array<[string, string]> = [
		["incidentType", field_value(body.incidentType)],
		["otherText", field_value(body.otherText)],
		["infraName", field_value(body.infraName)],
		["infraCount", field_value(body.infraCount)],
		["damageClass", field_value(body.damageClass)],
		["debris", field_value(body.debris)],
		["description", field_value(body.description)],
		["location", locationRaw]
	];

	for (const value of field_values(body.infrastructure)) {
		outgoing.push(["infrastructure", value]);
	}

	const image: ImagePart | null = file
		? {
				buffer: file.buffer,
				mimeType: file.mimetype || "image/jpeg",
				filename: file.originalname || "photo.jpg"
			}
		: null;

	try {
		const upstream = await postMultipart(REPORTS_API_URL, outgoing, image);
		return res.status(upstream.status).json(upstream.json);
	} catch (err) {
		// Queue unreachable. Nothing is holding the report on the device any
		// more, so this has to be reported as a failure the reporter can retry
		// rather than acknowledged as if it had been accepted.
		console.error("REPORTS_API_URL unreachable:", REPORTS_API_URL, err);
		return res.status(502).json({
			error: "Couldn't reach the report service. Please try again."
		});
	}
}
