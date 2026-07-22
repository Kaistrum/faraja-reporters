import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";

export const config = {
	api: { bodyParser: false }
};

const CLASSIFIER_URL = process.env.CLASSIFIER_URL ?? "http://localhost:6000";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	const form = formidable({ maxFiles: 1, maxFileSize: 10 * 1024 * 1024 });
	const [, files] = await form.parse(req);

	const imageFile = files.image?.[0];
	if (!imageFile) {
		return res.status(400).json({ error: "No image provided" });
	}

	try {
		const fd = new FormData();
		const buffer = fs.readFileSync(imageFile.filepath);
		const blob = new Blob([buffer], { type: imageFile.mimetype ?? "image/jpeg" });
		fd.append("image", blob, imageFile.originalFilename ?? "photo.jpg");

		const classRes = await fetch(`${CLASSIFIER_URL}/predict`, { method: "POST", body: fd });
		const data = await classRes.json();
		return res.status(classRes.status).json(data);
	} finally {
		fs.unlinkSync(imageFile.filepath);
	}
}
