import { useRef, useState, useEffect } from "react";
import {
	Drawer,
	TextInput,
	ActionIcon,
	Text,
	Stack,
	Paper,
	Group,
	Loader
} from "@mantine/core";
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
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					padding: "var(--mantine-spacing-md)"
				}}>
				<Stack gap="sm">
					{messages.map((msg, i) => (
						<div
							key={i}
							style={{
								display: "flex",
								justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
							}}>
							<Paper
								px="md"
								py="sm"
								radius="md"
								bg={msg.role === "user" ? "dark" : "gray.1"}
								style={{ maxWidth: "80%" }}>
								<Text size="sm" c={msg.role === "user" ? "white" : "dark"}>
									{msg.content}
								</Text>
							</Paper>
						</div>
					))}
					{loading && (
						<div style={{ display: "flex", justifyContent: "flex-start" }}>
							<Paper px="md" py="sm" radius="md" bg="gray.1">
								<Loader size="xs" color="dark" />
							</Paper>
						</div>
					)}
					<div ref={bottomRef} />
				</Stack>
			</div>

			{/* Input */}
			<Group
				p="md"
				gap="xs"
				style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
				<TextInput
					flex={1}
					placeholder="Type a message..."
					value={input}
					onChange={(e) => setInput(e.currentTarget.value)}
					onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
					disabled={loading}
				/>
				<ActionIcon
					size="lg"
					variant="filled"
					color="dark"
					onClick={sendMessage}
					disabled={loading || !input.trim()}>
					<IconSend size={16} />
				</ActionIcon>
			</Group>
		</Drawer>
	);
}
