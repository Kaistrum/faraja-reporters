import { useRef, useState, useEffect } from "react";
import { Drawer } from "@mantine/core";
import { Input, IconButton, Button, Stack, Spinner } from "@kaistrum/stratum-ui";
import { IconSend, IconMapPin, IconCamera, IconPhoto, IconX } from "@tabler/icons-react";
import {
	STEPS,
	EMPTY_ANSWERS,
	next_step_index,
	match_option,
	match_options,
	detect_incident_type,
	summarize,
	build_survey_form,
	is_skip,
	is_done,
	type ScriptAnswers,
	type Option,
	type Step
} from "@/lib/surveyScript";

interface Message {
	role: "user" | "assistant";
	content: string;
}

interface ChatBotProps {
	opened: boolean;
	onClose: () => void;
}

const GREETING =
	"Hello! I'm your crisis reporting assistant. How can I help you document this incident?";

export default function ChatBot({ opened, onClose }: ChatBotProps) {
	const [messages, setMessages] = useState<Message[]>([
		{ role: "assistant", content: GREETING }
	]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);

	// Scripted-survey state. `stepIndex` is null while the assistant is
	// answering normally; it's set the moment the assistant reports it's
	// degraded, and from then on this component asks the questions itself.
	const [stepIndex, setStepIndex] = useState<number | null>(null);
	const [answers, setAnswers] = useState<ScriptAnswers>(EMPTY_ANSWERS);
	const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const cameraRef = useRef<HTMLInputElement>(null);
	const galleryRef = useRef<HTMLInputElement>(null);

	const step: Step | null =
		stepIndex !== null && stepIndex < STEPS.length ? STEPS[stepIndex] : null;
	const scripted = stepIndex !== null;

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, loading, step, photo]);

	useEffect(() => {
		return () => {
			if (photo) URL.revokeObjectURL(photo.preview);
		};
	}, [photo]);

	const say = (content: string) =>
		setMessages((prev) => [...prev, { role: "assistant", content }]);

	const sayUser = (content: string) =>
		setMessages((prev) => [...prev, { role: "user", content }]);

	/** Move to the next applicable step and ask its question. `photoName` is
	 *  passed explicitly because the review summary can be reached in the same
	 *  tick the photo is chosen, before `photo` state has flushed. */
	const advance = (
		from: number,
		current: ScriptAnswers,
		photoName: string | null = photo?.file.name ?? null
	) => {
		const index = next_step_index(from, current);
		setStepIndex(index);
		if (index < STEPS.length) {
			const next = STEPS[index];
			say(
				next.kind === "review"
					? `${next.prompt}\n\n${summarize(current, photoName)}`
					: next.prompt
			);
		}
	};

	/** Hand over from the assistant to the scripted survey. The reporter isn't
	 *  told this happened — from their side the assistant just starts asking
	 *  about the incident, which is what they opened the chat to do. */
	const startScript = (transcript: Message[]) => {
		const said = transcript
			.filter((m) => m.role === "user")
			.map((m) => m.content)
			.join(" ");
		const detected = detect_incident_type(said);
		const seeded: ScriptAnswers = detected
			? { ...EMPTY_ANSWERS, incidentType: detected }
			: EMPTY_ANSWERS;
		setAnswers(seeded);

		if (detected) {
			say(
				`Sorry you're dealing with this. Let me take down the details of the ${detected} so responders can act on it.`
			);
			advance(1, seeded);
		} else {
			say("Let me take down the details so responders can act on this.");
			advance(0, seeded);
		}
	};

	const record = (patch: Partial<ScriptAnswers>) => {
		const updated = { ...answers, ...patch };
		setAnswers(updated);
		advance((stepIndex ?? 0) + 1, updated);
		return updated;
	};

	/** Answer the current step with one of its options (chip tap or typed). */
	const chooseOption = (option: Option) => {
		if (!step) return;
		sayUser(option.label);
		if (step.kind === "multi") {
			const picked = answers.infrastructure.includes(option.value)
				? answers.infrastructure.filter((v) => v !== option.value)
				: [...answers.infrastructure, option.value];
			setAnswers((prev) => ({ ...prev, infrastructure: picked }));
			return;
		}
		record({ [step.id]: option.value } as Partial<ScriptAnswers>);
	};

	const finishMulti = () => {
		if (!step || step.kind !== "multi") return;
		if (answers.infrastructure.length === 0) {
			say("Please pick at least one type of infrastructure before we move on.");
			return;
		}
		sayUser("Done");
		advance((stepIndex ?? 0) + 1, answers);
	};

	const shareLocation = () => {
		if (!navigator.geolocation) {
			say(
				"This device can't share a location. You can close this chat and drop the pin on the report form instead."
			);
			return;
		}
		say("Getting your location...");
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const latlng: [number, number] = [coords.latitude, coords.longitude];
				say(`Pinned at ${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}.`);
				record({ location: latlng });
			},
			() => {
				say(
					"I couldn't get your location — please allow location access and try again, or drop the pin on the report form instead."
				);
			},
			{ enableHighAccuracy: true, timeout: 15000 }
		);
	};

	const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const [file] = Array.from(e.target.files ?? []);
		e.target.value = "";
		if (!file) return;
		if (photo) URL.revokeObjectURL(photo.preview);
		setPhoto({ file, preview: URL.createObjectURL(file) });
		sayUser(file.name);
		if (step?.kind === "photo") advance((stepIndex ?? 0) + 1, answers, file.name);
	};

	const submitReport = async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/survey", {
				method: "POST",
				body: build_survey_form(answers, photo?.file ?? null)
			});
			let data: { error?: string } | null = null;
			try {
				data = await res.json();
			} catch {
				data = null;
			}
			if (!res.ok) throw new Error(data?.error ?? "Submission failed");
			setSubmitted(true);
			setStepIndex(STEPS.length);
			say(
				"Your report has been sent to responders. Thank you — you can close this chat now."
			);
		} catch {
			// The one failure the reporter does need to hear about: their report
			// isn't stored anywhere, so they have to send it again themselves.
			say("That didn't go through. Tap Send report to try again.");
		} finally {
			setSubmitting(false);
		}
	};

	/** Typed input while the script is running. */
	const answerByText = (text: string) => {
		if (!step) return;

		if (step.kind === "text") {
			if (step.optional && is_skip(text)) {
				record({ [step.id]: "" } as Partial<ScriptAnswers>);
				return;
			}
			record({ [step.id]: text } as Partial<ScriptAnswers>);
			return;
		}

		if (step.kind === "single" && step.options) {
			const hit = match_option(text, step.options);
			if (!hit) {
				say("Sorry, I didn't catch that — please pick one of the options above.");
				return;
			}
			record({ [step.id]: hit.value } as Partial<ScriptAnswers>);
			return;
		}

		if (step.kind === "multi" && step.options) {
			if (is_done(text)) {
				finishMulti();
				return;
			}
			const hits = match_options(text, step.options);
			if (hits.length === 0) {
				say("Sorry, I didn't catch that — please pick from the options above.");
				return;
			}
			const picked = [
				...new Set([...answers.infrastructure, ...hits.map((h) => h.value)])
			];
			setAnswers((prev) => ({ ...prev, infrastructure: picked }));
			say(
				`Got it. Pick any others, or choose Done.`
			);
			return;
		}

		// location / photo / review steps are answered with their buttons.
		say("Use the buttons above to finish this step.");
	};

	async function sendMessage() {
		const text = input.trim();
		if (!text || loading) return;

		setInput("");

		if (scripted) {
			sayUser(text);
			answerByText(text);
			return;
		}

		const userMessage: Message = { role: "user", content: text };
		const updated = [...messages, userMessage];
		setMessages(updated);
		setLoading(true);

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: updated })
			});
			const data = await res.json();
			// A degraded response carries no text — the scripted survey speaks
			// instead, so there's no seam for the reporter to notice.
			if (data.reply) {
				setMessages((prev) => [
					...prev,
					{ role: "assistant", content: data.reply }
				]);
			}
			// The assistant is answering with canned text rather than reasoning —
			// take over and collect the report ourselves.
			if (data.degraded) startScript(updated);
		} catch {
			startScript(updated);
		} finally {
			setLoading(false);
		}
	}

	const showOptions = step?.options && (step.kind === "single" || step.kind === "multi");

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
								<span className="whitespace-pre-line text-sm">{msg.content}</span>
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

			<input
				ref={cameraRef}
				type="file"
				accept="image/*"
				capture="environment"
				className="hidden"
				onChange={handlePhotoSelect}
			/>
			<input
				ref={galleryRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={handlePhotoSelect}
			/>

			{/* Step controls — only while the scripted survey is running */}
			{step && !submitted && (
				<div className="border-t border-border px-4 py-3">
					{showOptions && (
						<div className="flex flex-wrap gap-2">
							{step.options!.map((opt) => {
								const selected =
									step.kind === "multi" &&
									answers.infrastructure.includes(opt.value);
								return (
									<Button
										key={opt.value}
										type="button"
										size="sm"
										variant={selected ? "primary" : "outline"}
										onClick={() => chooseOption(opt)}>
										{opt.label}
									</Button>
								);
							})}
						</div>
					)}

					{step.kind === "multi" && (
						<Button
							type="button"
							size="sm"
							variant="primary"
							className="mt-3"
							onClick={finishMulti}>
							Done
						</Button>
					)}

					{step.kind === "location" && (
						<Button
							type="button"
							size="sm"
							variant="primary"
							icon={<IconMapPin size={16} />}
							onClick={shareLocation}>
							Share my location
						</Button>
					)}

					{step.kind === "photo" && (
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline"
								icon={<IconCamera size={16} />}
								onClick={() => cameraRef.current?.click()}>
								Camera
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								icon={<IconPhoto size={16} />}
								onClick={() => galleryRef.current?.click()}>
								Gallery
							</Button>
						</div>
					)}

					{step.kind === "review" && (
						<div className="flex flex-col gap-3">
							{photo && (
								<div className="relative aspect-square w-full overflow-hidden bg-bg-card">
									<img
										src={photo.preview}
										alt="Report photo"
										className="h-full w-full object-cover"
									/>
									<IconButton
										aria-label="Remove photo"
										icon={<IconX size={14} stroke={2.5} />}
										variant="default"
										size="sm"
										onClick={() => {
											URL.revokeObjectURL(photo.preview);
											setPhoto(null);
										}}
										className="absolute right-2 top-2 !h-7 !w-7 !rounded-full"
									/>
								</div>
							)}
							<Button
								type="button"
								size="md"
								variant="primary"
								fullWidth
								loading={submitting}
								onClick={submitReport}>
								Send report
							</Button>
						</div>
					)}
				</div>
			)}

			{/* Input */}
			<Stack direction="row" gap="xs" align="center" className="border-t border-border p-4">
				<div className="flex-1">
					<Input
						placeholder={
							step?.kind === "location"
								? "Use the button above to share your location"
								: step?.kind === "photo"
									? "Add a photo with the buttons above"
									: "Type a message..."
						}
						value={input}
						onChange={(e) => setInput(e.currentTarget.value)}
						onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
						disabled={loading || submitting || submitted}
					/>
				</div>
				<IconButton
					aria-label="Send message"
					variant="accent"
					size="lg"
					icon={<IconSend size={16} />}
					onClick={sendMessage}
					disabled={loading || submitting || submitted || !input.trim()}
				/>
			</Stack>
		</Drawer>
	);
}
