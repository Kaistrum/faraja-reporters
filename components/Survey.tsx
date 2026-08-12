import dynamic from "next/dynamic";
import { Drawer } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Carousel } from "@mantine/carousel";
import {
	Select,
	Button,
	Checkbox,
	Radio,
	Textarea,
	Stack,
	IconButton
} from "@kaistrum/stratum-ui";
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
import {
	validate_survey,
	first_error_field,
	FIELD_SLIDE,
	SLIDE_FIELDS,
	INFRA_COUNT_VALUES,
	type SurveyErrors,
	type SurveyField
} from "@/lib/surveyValidation";

const PinDropMap = dynamic(() => import("@/components/PinDropMap"), {
	ssr: false,
	loading: () => (
		<div className="flex h-48 items-center justify-center bg-bg-card text-sm text-text-muted">
			Loading map...
		</div>
	)
});

function RequiredStar() {
	return (
		<IconAsterisk
			size={8}
			stroke={3}
			className="mb-2 ml-0.5 inline text-danger"
		/>
	);
}

function SlideShell({
	title,
	subtitle,
	required,
	error,
	children
}: {
	title: string;
	subtitle?: string;
	required?: boolean;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<Stack gap="xs" className="px-1 py-2" style={{ minHeight: 320 }}>
			<p className="text-sm font-semibold text-text">
				{title}
				{required && <RequiredStar />}
			</p>
			{subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
			{error && (
				<span role="alert" className="text-xs font-medium text-danger">
					{error}
				</span>
			)}
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
	let data: { error?: string } | null = null;
	try {
		data = await res.json();
	} catch {
		data = null;
	}
	if (!res.ok) throw new Error(data?.error ?? "Submission failed");
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
	// Slides the user has tried to move past / submit from — errors only show
	// once they've had a go at that step, not from the moment the form opens.
	const [attempted, setAttempted] = useState<Record<number, boolean>>({});

	// Show the user what's missing: flag the slide, tell them, take them there.
	const reveal_error = (field: SurveyField, message: string) => {
		const slide = FIELD_SLIDE[field];
		setAttempted((prev) => ({ ...prev, [slide]: true }));
		notifications.show({
			title: t("validation.incomplete"),
			message: t(message),
			color: "red"
		});
		embla?.scrollTo(slide);
	};

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
			// Hard gate: nothing incomplete gets sent, whatever path called
			// submitForm.
			const errors = validate_survey({
				...values,
				hasPhoto: photos.length > 0
			});
			const missing = first_error_field(errors);
			if (missing) {
				reveal_error(missing, errors[missing]!);
				return;
			}

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
					message: "Your incident report has been sent successfully.",
					color: "teal"
				});
				resetForm();
				setPhotos([]);
				setCurrent(0);
				setAttempted({});
				setSurveyOpen(false);
			} catch (err) {
				// Nothing is stored on the device, so the form stays open with the
				// reporter's answers intact for them to try again.
				notifications.show({
					title: "Report not sent",
					message:
						err instanceof Error && err.message
							? err.message
							: "Couldn't send your report. Check your connection and try again.",
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

	const toggleInfra = (value: string) => {
		formik.setFieldValue(
			"infrastructure",
			formik.values.infrastructure.includes(value)
				? formik.values.infrastructure.filter((v) => v !== value)
				: [...formik.values.infrastructure, value]
		);
	};

	const errors: SurveyErrors = validate_survey({
		...formik.values,
		hasPhoto: photos.length > 0
	});

	// Only surfaced once the user has tried to leave the slide it belongs to.
	const error_text = (field: SurveyField) =>
		attempted[FIELD_SLIDE[field]] && errors[field]
			? t(errors[field]!)
			: undefined;

	const prev = () => embla?.scrollPrev();

	const next = () => {
		const missing = SLIDE_FIELDS[current].find((field) => errors[field]);
		if (missing) {
			reveal_error(missing, errors[missing]!);
			return;
		}
		embla?.scrollNext();
	};

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
					options={INCIDENT_TYPES}
					value={formik.values.incidentType}
					onChange={(e) =>
						formik.setFieldValue("incidentType", e.target.value || "earthquake")
					}
					className="mb-4 text-center text-lg font-semibold"
				/>

				{/* Step indicator */}
				<div className="mb-3 flex items-center justify-center px-1">
					<div className="flex gap-1">
						{Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
							<div
								key={i}
								className={`h-1.5 w-5 rounded-full transition-colors ${
									i === current ? "bg-accent" : "bg-border"
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
							required
							error={error_text("infrastructure")}>
							<Stack gap="sm">
								{INFRASTRUCTURE_OPTIONS.map((opt) => (
									<Checkbox
										key={opt.value}
										checked={formik.values.infrastructure.includes(opt.value)}
										onChange={() => toggleInfra(opt.value)}
										label={opt.label}
										description={
											opt.description ? `(${opt.description})` : undefined
										}
									/>
								))}
							</Stack>
							{formik.values.infrastructure.includes("other") && (
								<Textarea
									name="otherText"
									placeholder={t("survey.pleaseSpecify")}
									value={formik.values.otherText}
									onChange={formik.handleChange}
									error={error_text("otherText")}
									rows={2}
									className="ml-8"
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
								rows={3}
							/>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 3 — Q3: Count */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q3.title")}
							subtitle={t("survey.q3.subtitle")}
							required
							error={error_text("infraCount")}>
							<Stack gap="sm">
								{INFRA_COUNT_VALUES.map((opt) => (
									<Radio
										key={opt}
										name="infraCount"
										checked={formik.values.infraCount === opt}
										onChange={() => formik.setFieldValue("infraCount", opt)}
										label={opt}
									/>
								))}
							</Stack>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 4 — Q4: Damage level */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q4.title")}
							required
							error={error_text("damageClass")}>
							<Stack gap="sm">
								{DAMAGE_OPTIONS.map((opt) => (
									<div
										key={opt.value}
										className={`cursor-pointer border p-3 transition-colors ${
											formik.values.damageClass === opt.value
												? "border-border-strong bg-bg-card"
												: "border-border"
										}`}>
										<Radio
											name="damageClass"
											checked={formik.values.damageClass === opt.value}
											onChange={() =>
												formik.setFieldValue("damageClass", opt.value)
											}
											label={
												<div>
													<span className="text-sm font-medium">
														{opt.label}
													</span>
													<p className="text-xs text-text-muted">
														{opt.description}
													</p>
												</div>
											}
										/>
									</div>
								))}
							</Stack>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 5 — Q5: Debris */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q5.title")}
							subtitle={t("survey.q5.subtitle")}
							required
							error={error_text("debris")}>
							<Stack gap="sm">
								<Radio
									name="debris"
									checked={formik.values.debris === "yes"}
									onChange={() => formik.setFieldValue("debris", "yes")}
									label={t("survey.q5.yes")}
								/>
								<Radio
									name="debris"
									checked={formik.values.debris === "no"}
									onChange={() => formik.setFieldValue("debris", "no")}
									label={t("survey.q5.no")}
								/>
							</Stack>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 6 — Q6: Location */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q6.title")}
							subtitle={t("survey.q6.subtitle")}
							required
							error={error_text("location")}>
							{formik.values.location && (
								<span className="text-xs text-accent">
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
								rows={4}
							/>
						</SlideShell>
					</Carousel.Slide>

					{/* Slide 8 — Q8: Photos */}
					<Carousel.Slide>
						<SlideShell
							title={t("survey.q8.title")}
							subtitle={t("survey.photoOfDamage")}
							required
							error={error_text("photo")}>
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
								<div className="flex flex-col gap-2">
									{photos.map((p, i) => (
										<div
											key={i}
											className="relative aspect-square w-full overflow-hidden bg-bg-card">
											<img
												src={p.preview}
												alt={`photo-${i}`}
												className="h-full w-full object-cover"
											/>
											<IconButton
												aria-label="Remove photo"
												icon={<IconX size={14} stroke={2.5} />}
												variant="default"
												size="sm"
												onClick={() => removePhoto(i)}
												className="absolute right-2 top-2 !h-7 !w-7 !rounded-full"
											/>
										</div>
									))}
								</div>
							)}

							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									className="flex-1"
									icon={<IconCamera size={16} />}
									onClick={() => cameraRef.current?.click()}>
									{t("survey.camera")}
								</Button>
								<Button
									type="button"
									variant="outline"
									className="flex-1"
									icon={<IconPhoto size={16} />}
									onClick={() => galleryRef.current?.click()}>
									{t("survey.gallery")}
								</Button>
							</div>
						</SlideShell>
					</Carousel.Slide>
				</Carousel>

				{/* Navigation */}
				<div className="mt-3 flex gap-2">
					{current > 0 && (
						<Button
							type="button"
							variant="outline"
							fullWidth
							size="md"
							onClick={prev}
							icon={<IconChevronLeft size={16} />}>
							{t("survey.back")}
						</Button>
					)}
					<Button
						type="button"
						fullWidth
						variant="primary"
						size="md"
						loading={isMutating}
						onClick={isLast ? () => formik.submitForm() : next}>
						{isLast ? t("survey.submitReport") : t("survey.next")}
						{!isLast && <IconChevronRight size={16} className="ml-1 inline" />}
					</Button>
				</div>
			</form>
		</Drawer>
	);
}
