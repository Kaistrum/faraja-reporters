import Head from "next/head";
import { useRef, useState } from "react";
import {
	Button,
	Card,
	Text,
	Badge,
	Progress,
	SimpleGrid,
	Stack,
	Title,
	Center,
	Loader
} from "@mantine/core";
import { IconUpload, IconX, IconPhoto } from "@tabler/icons-react";

type TaskResult = {
	prediction: string;
	confidence: number;
	scores: Record<string, number>;
};

type ClassifyResponse = {
	image: string;
	results: Record<string, TaskResult>;
};

const TASK_LABELS: Record<string, string> = {
	damage_severity: "Damage Severity",
	informative: "Informative",
	humanitarian: "Humanitarian",
	disaster_types: "Disaster Type"
};

async function classifyFetcher(url: string, { arg }: { arg: File }) {
	const fd = new FormData();
	fd.append("image", arg);
	const res = await fetch(url, { method: "POST", body: fd });
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error((err as { error?: string }).error ?? "Classification failed");
	}
	return res.json() as Promise<ClassifyResponse>;
}

export default function ClassifyPage() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [result, setResult] = useState<ClassifyResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleFile = (f: File) => {
		if (preview) URL.revokeObjectURL(preview);
		setFile(f);
		setPreview(URL.createObjectURL(f));
		setResult(null);
		setError(null);
	};

	const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const f = e.target.files?.[0];
		if (f) handleFile(f);
		e.target.value = "";
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const f = e.dataTransfer.files?.[0];
		if (f && f.type.startsWith("image/")) handleFile(f);
	};

	const clear = () => {
		if (preview) URL.revokeObjectURL(preview);
		setFile(null);
		setPreview(null);
		setResult(null);
		setError(null);
	};

	const classify = async () => {
		if (!file) return;
		setLoading(true);
		setError(null);
		try {
			const data = await classifyFetcher("/api/classify", { arg: file });
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<Head>
				<title>Image Classifier — Crisis Mapping</title>
			</Head>

			<div className="min-h-screen bg-gray-50 p-6">
				<div className="mx-auto max-w-2xl">
					<Title order={2} mb="xs">Image Classifier</Title>
					<Text c="dimmed" size="sm" mb="xl">
						Upload a disaster photo to get damage severity, humanitarian, and disaster type predictions.
					</Text>

					{/* Drop zone */}
					{!preview ? (
						<div
							onDragOver={(e) => e.preventDefault()}
							onDrop={handleDrop}
							onClick={() => inputRef.current?.click()}
							className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-16 text-gray-400 transition-colors hover:border-gray-400 hover:bg-gray-50">
							<IconPhoto size={40} stroke={1.2} />
							<Text size="sm">Drop an image here or click to browse</Text>
							<input
								ref={inputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleInput}
							/>
						</div>
					) : (
						<div className="relative overflow-hidden rounded-xl bg-white shadow-sm">
							<img
								src={preview}
								alt="preview"
								className="max-h-72 w-full object-contain"
							/>
							<button
								type="button"
								onClick={clear}
								className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700">
								<IconX size={14} />
							</button>
						</div>
					)}

					{/* Actions */}
					{file && (
						<Button
							mt="md"
							fullWidth
							color="dark"
							radius="xl"
							size="md"
							loading={loading}
							leftSection={<IconUpload size={16} />}
							onClick={classify}>
							Classify image
						</Button>
					)}

					{error && (
						<Text c="red" size="sm" mt="md">
							{error}
						</Text>
					)}

					{/* Loading */}
					{loading && (
						<Center mt="xl">
							<Stack align="center" gap="xs">
								<Loader size="sm" color="dark" />
								<Text size="xs" c="dimmed">Running model inference…</Text>
							</Stack>
						</Center>
					)}

					{/* Results */}
					{result && (
						<Stack mt="xl" gap="md">
							<Title order={4}>Results</Title>
							<SimpleGrid cols={2} spacing="md">
								{Object.entries(result.results).map(([task, r]) => (
									<Card key={task} withBorder radius="md" p="md">
										<Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
											{TASK_LABELS[task] ?? task}
										</Text>
										<div className="mb-3 flex items-center justify-between">
											<Text size="sm" fw={600}>{r.prediction}</Text>
											<Badge color="dark" variant="light" size="sm">
												{r.confidence}%
											</Badge>
										</div>
										<Stack gap={6}>
											{Object.entries(r.scores).map(([cls, score]) => (
												<div key={cls}>
													<div className="mb-0.5 flex justify-between">
														<Text size="xs" c="dimmed">{cls}</Text>
														<Text size="xs" c="dimmed">{score}%</Text>
													</div>
													<Progress
														value={score}
														size="xs"
														color={cls === r.prediction ? "dark" : "gray"}
													/>
												</div>
											))}
										</Stack>
									</Card>
								))}
							</SimpleGrid>
						</Stack>
					)}
				</div>
			</div>
		</>
	);
}
