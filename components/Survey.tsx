import dynamic from "next/dynamic";
import {
	Select,
	Button,
	Drawer,
	Checkbox,
	Radio,
	Textarea,
	Stack,
	Text
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Carousel } from "@mantine/carousel";
import { useRef } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import {
	IconAsterisk,
	IconCamera,
	IconPhoto,
	IconX,
	IconChevronLeft,
	IconChevronRight
} from "@tabler/icons-react";
import { useFormik } from "formik";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import useSWRMutation from "swr/mutation";

const PinDropMap = dynamic(() => import("@/components/PinDropMap"), {
	ssr: false,
	loading: () => (
		<div className="flex h-48 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
			Loading map...
		</div>
	)
});

function RequiredStar() {
	return (
		<IconAsterisk
			size={8}
			stroke={3}
			className="mb-2 ml-0.5 inline text-red-500"
		/>
	);
}

function SlideShell({
	title,
	subtitle,
	required,
	children
}: {
	title: string;
	subtitle?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Stack gap="xs" px={4} py="xs" style={{ minHeight: 320 }}>
			<p className="text-sm font-semibold">
				{title}
				{required && <RequiredStar />}
			</p>
			{subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
			{children}
		</Stack>
	);
}

type SurveyPayload = {
	incidentType: string;
	infrastructure: string[];
	otherText: string;
	infraName: string;
	infraCount: string;
	damageClass: string;
	debris: string;
	description: string;
	location: [number, number] | null;
	photo?: File;
};

async function postSurvey(url: string, { arg }: { arg: SurveyPayload }) {
	const fd = new FormData();
	fd.append("incidentType", arg.incidentType);
	arg.infrastructure.forEach((v) => fd.append("infrastructure", v));
	fd.append("otherText", arg.otherText);
	fd.append("infraName", arg.infraName);
	fd.append("infraCount", arg.infraCount);
	fd.append("damageClass", arg.damageClass);
	fd.append("debris", arg.debris);
	fd.append("description", arg.description);
	if (arg.location) fd.append("location", JSON.stringify(arg.location));
	if (arg.photo) fd.append("image", arg.photo);

	const res = await fetch(url, { method: "POST", body: fd });
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? "Submission failed");
	return data;
}

export default function Survey({
	surveyOpen,
	setSurveyOpen
}: {
	surveyOpen: boolean;
	setSurveyOpen: (opt: boolean) => void;
}) {
	const { t } = useTranslation("common");
	const [embla, setEmbla] = useState<EmblaCarouselType | null>(null);
	const [current, setCurrent] = useState(0);

	const { trigger, isMutating } = useSWRMutation("/api/survey", postSurvey);

	const INCIDENT_TYPES = [
		{ value: "earthquake", label: t("incident.earthquake") },
		{ value: "wildfire", label: t("incident.wildfire") },
		{ value: "flood", label: t("incident.flood") },
		{ value: "landslide", label: t("incident.landslide") }
	];

	const INFRASTRUCTURE_OPTIONS = [
		{
			value: "residential",
			label: t("infra.residential.label"),
			description: t("infra.residential.desc")
		},
		{
			value: "commercial",
			label: t("infra.commercial.label"),
			description: t("infra.commercial.desc")
		},
		{
			value: "government",
			label: t("infra.government.label"),
			description: t("infra.government.desc")
		},
		{
			value: "utility",
			label: t("infra.utility.label"),
			description: t("infra.utility.desc")
		},
		{
			value: "transport",
			label: t("infra.transport.label"),
			description: t("infra.transport.desc")
		},
		{
			value: "community",
			label: t("infra.community.label"),
			description: t("infra.community.desc")
		},
		{
			value: "recreation",
			label: t("infra.recreation.label"),
			description: t("infra.recreation.desc")
		},
		{ value: "other", label: t("infra.other.label"), description: "" }
	];

	const DAMAGE_OPTIONS = [
		{
			value: "minimal",
			label: t("damage.minimal.label"),
			description: t("damage.minimal.desc")
		},
		{
			value: "partial",
			label: t("damage.partial.label"),
			description: t("damage.partial.desc")
		},
		{
			value: "complete",
			label: t("damage.complete.label"),
			description: t("damage.complete.desc")
		}
	];

	const TOTAL_SLIDES = 8;

	const formik = useFormik({
		initialValues: {
			incidentType: "earthquake",
			infrastructure: [] as string[],
			otherText: "",
			infraName: "",
			infraCount: "",
			damageClass: "",
			debris: "",
			description: "",
			location: null as [number, number] | null
		},
		onSubmit: async (values, { resetForm }) => {
			try {
				await trigger({
					incidentType: values.incidentType,
					infrastructure: values.infrastructure,
					otherText: values.otherText,
					infraName: values.infraName,
					infraCount: values.infraCount,
					damageClass: values.damageClass,
					debris: values.debris,
					description: values.description,
					location: values.location,
					photo: photos[0]?.file
				});
				notifications.show({
					title: "Report submitted",
					message: "Your incident report has been queued successfully.",
					color: "teal"
				});
				resetForm();
				setPhotos([]);
				setCurrent(0);
				setSurveyOpen(false);
			} catch (err) {
				notifications.show({
					title: "Submission failed",
					message: err instanceof Error ? err.message : "Unknown error",
					color: "red"
				});
			}
		}
	});

	const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
	const cameraRef = useRef<HTMLInputElement>(null);
	const galleryRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		return () => photos.forEach((p) => URL.revokeObjectURL(p.preview));
	}, []);

	const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const [file] = Array.from(e.target.files ?? []);
		if (!file) return;
		setPhotos((prev) => {
			prev.forEach((p) => URL.revokeObjectURL(p.preview));
			return [{ file, preview: URL.createObjectURL(file) }];
		});
		e.target.value = "";
	};

	const removePhoto = (index: number) => {
		setPhotos((prev) => {
			URL.revokeObjectURL(prev[index].preview);
			return prev.filter((_, i) => i !== index);
		});
	};

	const prev = () => embla?.scrollPrev();
	const next = () => embla?.scrollNext();
	const isLast = current === TOTAL_SLIDES - 1;

	return (
		<Drawer
			opened={surveyOpen}
			onClose={() => setSurveyOpen(false)}
			position="bottom"
			size="90%"
			title={<strong className="text-lg">{t("survey.reportIncident")}</strong>}
			styles={{
				header: { padding: "1rem 1rem 0.5rem" },
				body: {
					padding: "0 1rem 1rem",
					display: "flex",
					flexDirection: "column",
					height: "calc(100% - 60px)",
					overflow: "hidden"
				}
			}}>
			<form
				onSubmit={formik.handleSubmit}
				className="flex h-full flex-col overflow-hidden">
				{/* Incident type — always visible at top */}
				<Select
					data={INCIDENT_TYPES}
					value={formik.values.incidentType}
					onChange={(v) =>
						formik.setFieldValue("incidentType", v ?? "earthquake")
					}
					mb="md"
					comboboxProps={{ withinPortal: true }}
					styles={{
						input: {
							textAlign: "center",
							fontWeight: 600,
							fontSize: "1.1rem",
							border: "1px solid #e5e7eb",
							borderRadius: "0.5rem"
						}
					}}
				/>

				{/* Step indicator */}
				<div className="mb-3 flex items-center justify-center px-1">
					<div className="flex gap-1">
						{Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
							<div
								key={i}
								className={`h-1.5 w-5 rounded-full transition-colors ${
									i === current ? "bg-gray-800" : "bg-gray-200"
								}`}
							/>
						))}
					</div>
				</div>

				{/* Carousel */}
				<Carousel
					getEmblaApi={(api) => setEmbla(api)}
					onSlideChange={(index) => setCurrent(index)}
					withControls={false}
					emblaOptions={{ watchDrag: false }}
					style={{ flex: 1, overflow: "hidden" }}
					styles={{
						root: { height: "100%", display: "flex", flexDirection: "column" },
						viewport: { flex: 1, overflow: "hidden" },
						container: { height: "100%" },
						slide: { overflowY: "auto" }
					}}>
					{/* Slide 1 — Q1: Infrastructure */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q1.title")}
							subtitle={t("survey.q1.subtitle")}
							required>
							<Checkbox.Group
								value={formik.values.infrastructure}
								onChange={(v) => formik.setFieldValue("infrastructure", v)}>
								<Stack gap="sm">
									{INFRASTRUCTURE_OPTIONS.map((opt) => (
										<Checkbox
											key={opt.value}
											value={opt.value}
											label={
												<div>
													<span className="text-sm">{opt.label}</span>
													{opt.description && (
														<p className="text-xs text-gray-500">
															({opt.description})
														</p>
													)}
												</div>
											}
										/>
									))}
								</Stack>
							</Checkbox.Group>
							{formik.values.infrastructure.includes("other") && (
								<Textarea
									name="otherText"
									placeholder={t("survey.pleaseSpecify")}
									value={formik.values.otherText}
									onChange={formik.handleChange}
									size="sm"
									ml="xl"
									autosize
									minRows={2}
								/>
							)}
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 2 — Q2: Infrastructure name */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q2.title")}
							subtitle={t("survey.q2.subtitle")}>
							<Textarea
								name="infraName"
								value={formik.values.infraName}
								onChange={formik.handleChange}
								size="sm"
								autosize
								minRows={3}
							/>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 3 — Q3: Count */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q3.title")}
							subtitle={t("survey.q3.subtitle")}
							required>
							<Radio.Group
								value={formik.values.infraCount}
								onChange={(v) => formik.setFieldValue("infraCount", v)}>
								<Stack gap="sm">
									{["1", "2 - 5", "6 - 20", "More than 20"].map((opt) => (
										<Radio key={opt} value={opt} label={opt} />
									))}
								</Stack>
							</Radio.Group>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 4 — Q4: Damage level */}
					<Carousel.Slide>
						<SlideShell title={t("survey.q4.title")} required>
							<Radio.Group
								value={formik.values.damageClass}
								onChange={(v) => formik.setFieldValue("damageClass", v)}>
								<Stack gap="sm">
									{DAMAGE_OPTIONS.map((opt) => (
										<div
											key={opt.value}
											className={`cursor-pointer rounded-lg border p-3 transition-colors ${
												formik.values.damageClass === opt.value
													? "border-gray-800 bg-gray-50"
													: "border-gray-200"
											}`}>
											<Radio
												value={opt.value}
												label={
													<div>
														<span className="text-sm font-medium">
															{opt.label}
														</span>
														<p className="text-xs text-gray-500">
															{opt.description}
														</p>
													</div>
												}
											/>
										</div>
									))}
								</Stack>
							</Radio.Group>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 5 — Q5: Debris */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q5.title")}
							subtitle={t("survey.q5.subtitle")}
							required>
							<Radio.Group
								value={formik.values.debris}
								onChange={(v) => formik.setFieldValue("debris", v)}>
								<Stack gap="sm">
									<Radio value="yes" label={t("survey.q5.yes")} />
									<Radio value="no" label={t("survey.q5.no")} />
								</Stack>
							</Radio.Group>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 6 — Q6: Location */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q6.title")}
							subtitle={t("survey.q6.subtitle")}
							required>
							{formik.values.location && (
								<span className="text-xs text-teal-600">
									{t("survey.pinSetAt")} {formik.values.location[0].toFixed(5)},{" "}
									{formik.values.location[1].toFixed(5)}
								</span>
							)}
							<PinDropMap
								value={formik.values.location}
								onChange={(latlng) => formik.setFieldValue("location", latlng)}
							/>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 7 — Q7: Description */}
					<Carousel.Slide>
						<SlideShell
							title={`${t("survey.q7.title")} (${t("survey.optional")})`}
							subtitle={t("survey.describeHint")}>
							<Textarea
								name="description"
								value={formik.values.description}
								onChange={formik.handleChange}
								placeholder={t("survey.descriptionPlaceholder")}
								size="sm"
								autosize
								minRows={4}
							/>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 8 — Q8: Photos */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q8.title")}
							subtitle={t("survey.photoOfDamage")}
							required>
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

							{photos.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{photos.map((p, i) => (
										<div key={i} className="relative h-24 w-24 flex-shrink-0">
											<img
												src={p.preview}
												alt={`photo-${i}`}
												className="h-full w-full object-cover rounded"
											/>
											<button
												type="button"
												onClick={() => removePhoto(i)}
												className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white">
												<IconX size={10} stroke={2.5} />
											</button>
										</div>
									))}
								</div>
							)}

							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => cameraRef.current?.click()}
									className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:bg-gray-50">
									<IconCamera size={16} />
									{t("survey.camera")}
								</button>
								<button
									type="button"
									onClick={() => galleryRef.current?.click()}
									className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:bg-gray-50">
									<IconPhoto size={16} />
									{t("survey.gallery")}
								</button>
							</div>
						</SlideShell>
					</Carousel.Slide>
				</Carousel>

				{/* Navigation */}
				<div className="mt-3 flex gap-2">
					{current > 0 && (
						<Button
							type="button"
							variant="default"
							radius="xl"
							fullWidth
							size="md"
							onClick={prev}
							leftSection={<IconChevronLeft size={16} />}>
							{t("survey.back")}
						</Button>
					)}
					<Button
						type="button"
						fullWidth
						color="dark"
						radius="xl"
						size="md"
						loading={isMutating}
						onClick={isLast ? () => formik.submitForm() : next}
						rightSection={!isLast ? <IconChevronRight size={16} /> : undefined}>
						{isLast ? t("survey.submitReport") : t("survey.next")}
					</Button>
				</div>
			</form>
		</Drawer>
	);
}
