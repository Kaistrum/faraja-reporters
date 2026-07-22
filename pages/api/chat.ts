import type { NextApiRequest, NextApiResponse } from "next";

// Faraja AI service — the shared crisis-mapping brain. Server-side only.
const FARAJA_URL = (process.env.FARAJA_URL ?? "http://localhost:8088").replace(/\/+$/, "");

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse
) {
	if (req.method !== "POST") return res.status(405).end();

	const messages: ChatMessage[] = Array.isArray(req.body?.messages)
		? req.body.messages
		: [];

	if (messages.length === 0) {
		return res.status(400).json({ error: "messages array is required" });
	}

	try {
		const ctrl = new AbortController();
		const timeout = setTimeout(() => ctrl.abort(), 60_000);
		const upstream = await fetch(`${FARAJA_URL}/reporters/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages }),
			signal: ctrl.signal
		});
		clearTimeout(timeout);

		if (!upstream.ok) throw new Error(`faraja ${upstream.status}`);
		const data = await upstream.json();
		const reply =
			typeof data?.reply === "string" && data.reply.trim()
				? data.reply
				: "I'm here to help. Could you tell me a bit more about what you're seeing?";
		return res.status(200).json({ reply });
	} catch {
		// Faraja unreachable — never block the reporter; give a safe fallback.
		return res.status(200).json({
			reply:
				"I'm having trouble connecting right now. If anyone is in immediate danger, " +
				"please call your local emergency number and follow local authorities."
		});
	}
}
