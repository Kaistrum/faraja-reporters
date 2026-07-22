import Head from "next/head";
import { useRef, useState } from "react";
import {
	Button,
	Card,
	Badge,
	Progress,
	Grid,
	IconButton,
	Spinner
} from "@kaistrum/stratum-ui";
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

			<div className="min-h-screen bg-bg-surface p-6">
				<div className="mx-auto max-w-2xl">
					<h2 className="mb-1 text-2xl font-semibold text-text">Image Classifier</h2>
					<p className="mb-8 text-sm text-text-dim">
						Upload a disaster photo to get damage severity, humanitarian, and disaster type predictions.
					</p>

					{/* Drop zone */}
					{!preview ? (
						<div
							onDragOver={(e) => e.preventDefault()}
							onDrop={handleDrop}
							onClick={() => inputRef.current?.click()}
							className="flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-border bg-bg-card px-6 py-16 text-text-muted transition-colors hover:border-border-strong">
							<IconPhoto size={40} stroke={1.2} />
							<span className="text-sm">Drop an image here or click to browse</span>
							<input
								ref={inputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleInput}
							/>
						</div>
					) : (
						<div className="relative overflow-hidden bg-bg-card shadow-sm">
							<img
								src={preview}
								alt="preview"
								className="max-h-72 w-full object-contain"
							/>
							<IconButton
								aria-label="Remove image"
								icon={<IconX size={14} />}
								variant="default"
								size="sm"
								onClick={clear}
								className="absolute right-2 top-2"
							/>
						</div>
					)}

					{/* Actions */}
					{file && (
						<div className="mt-4">
							<Button
								fullWidth
								variant="primary"
								size="md"
								loading={loading}
								icon={<IconUpload size={16} />}
								onClick={classify}>
								Classify image
							</Button>
						</div>
					)}

					{error && (
						<p className="mt-4 text-sm text-danger">{error}</p>
					)}

					{/* Loading */}
					{loading && (
						<div className="mt-8 flex flex-col items-center gap-2">
							<Spinner size={20} />
							<span className="text-xs text-text-muted">Running model inference…</span>
						</div>
					)}

					{/* Results */}
					{result && (
						<div className="mt-8 flex flex-col gap-4">
							<h4 className="text-lg font-semibold text-text">Results</h4>
							<Grid columns={2} gap="md">
								{Object.entries(result.results).map(([task, r]) => (
									<Card key={task} surface="card" padding="standard">
										<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
											{TASK_LABELS[task] ?? task}
										</p>
										<div className="mb-3 flex items-center justify-between">
											<span className="text-sm font-semibold text-text">{r.prediction}</span>
											<Badge variant="info">{r.confidence}%</Badge>
										</div>
										<div className="flex flex-col gap-1.5">
											{Object.entries(r.scores).map(([cls, score]) => (
												<div
													key={cls}
													className={cls === r.prediction ? undefined : "opacity-50"}>
													<div className="mb-0.5 flex justify-between">
														<span className="text-xs text-text-muted">{cls}</span>
														<span className="text-xs text-text-muted">{score}%</span>
													</div>
													<Progress value={score} />
												</div>
											))}
										</div>
									</Card>
								))}
							</Grid>
						</div>
					)}
				</div>
			</div>
		</>
	);
}
