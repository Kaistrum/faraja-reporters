import { useRef, useState, useEffect } from "react";
import { Drawer } from "@mantine/core";
import { Input, IconButton, Stack, Spinner } from "@kaistrum/stratum-ui";
import { IconSend } from "@tabler/icons-react";

interface Message {
	role: "user" | "assistant";
	content: string;
}

interface ChatBotProps {
	opened: boolean;
	onClose: () => void;
}

export default function ChatBot({ opened, onClose }: ChatBotProps) {
	const [messages, setMessages] = useState<Message[]>([
		{
			role: "assistant",
			content:
				"Hello! I'm your crisis reporting assistant. How can I help you document this incident?"
		}
	]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, loading]);

	async function sendMessage() {
		if (!input.trim() || loading) return;

		const userMessage: Message = { role: "user", content: input.trim() };
		const updated = [...messages, userMessage];
		setMessages(updated);
		setInput("");
		setLoading(true);

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: updated })
			});
			const data = await res.json();
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: data.reply }
			]);
		} catch {
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content: "Sorry, I couldn't connect. Please try again."
				}
			]);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			position="bottom"
			size="100%"
			styles={{
				body: {
					display: "flex",
					flexDirection: "column",
					height: "calc(100dvh - 60px)",
					padding: 0
				}
			}}>
			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-4">
				<Stack gap="sm">
					{messages.map((msg, i) => (
						<div
							key={i}
							className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
							<div
								className={`max-w-[80%] px-4 py-2 ${
									msg.role === "user" ? "bg-text text-bg" : "bg-bg-card text-text"
								}`}>
								<span className="text-sm">{msg.content}</span>
							</div>
						</div>
					))}
					{loading && (
						<div className="flex justify-start">
							<div className="bg-bg-card px-4 py-2">
								<Spinner size={14} />
							</div>
						</div>
					)}
					<div ref={bottomRef} />
				</Stack>
			</div>

			{/* Input */}
			<Stack direction="row" gap="xs" align="center" className="border-t border-border p-4">
				<div className="flex-1">
					<Input
						placeholder="Type a message..."
						value={input}
						onChange={(e) => setInput(e.currentTarget.value)}
						onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
						disabled={loading}
					/>
				</div>
				<IconButton
					aria-label="Send message"
					variant="accent"
					size="lg"
					icon={<IconSend size={16} />}
					onClick={sendMessage}
					disabled={loading || !input.trim()}
				/>
			</Stack>
		</Drawer>
	);
}
