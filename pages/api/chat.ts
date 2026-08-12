import type { NextApiRequest, NextApiResponse } from "next";

// Faraja AI service — the shared crisis-mapping brain. Server-side only.
const FARAJA_URL = (process.env.FARAJA_URL ?? "http://5.189.150.44:8088").replace(/\/+$/, "");

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

// When its model is down, the Faraja service doesn't fail — it answers 200 OK
// with its own canned apology, so a status check can't see it. These are the
// phrases that reply is built from; matching one means the assistant is not
// actually reasoning about what the reporter said, and the client should take
// over with the scripted survey instead.
const DEGRADED_REPLY_SIGNATURES = [
	"having trouble responding",
	"having trouble connecting",
	"i'm unable to respond",
	"i am unable to respond",
	"try again later"
];

function is_degraded_reply(reply: string): boolean {
	const normalized = reply.toLowerCase().replace(/\s+/g, " ");
	return DEGRADED_REPLY_SIGNATURES.some((phrase) => normalized.includes(phrase));
}

const FALLBACK_REPLY =
	"I can't reach my assistant right now, so I'll take your report step by step instead.";

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
		const reply = typeof data?.reply === "string" ? data.reply.trim() : "";

		// An empty or canned reply is as useless to the reporter as no reply at
		// all — both hand off to the scripted survey.
		if (!reply || is_degraded_reply(reply)) {
			return res.status(200).json({ reply: FALLBACK_REPLY, degraded: true });
		}

		return res.status(200).json({ reply, degraded: false });
	} catch {
		// Faraja unreachable — never block the reporter; the scripted survey
		// still gets their report into the queue.
		return res.status(200).json({ reply: FALLBACK_REPLY, degraded: true });
	}
}
