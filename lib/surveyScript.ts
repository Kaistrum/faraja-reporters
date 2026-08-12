// A deterministic version of the survey, for when the assistant's model is
// unavailable. It walks the same questions the form asks, in the same order,
// and produces the same payload — so a report finished here goes to the queue
// exactly like one finished in the form.
//
// Everything here is pure: no React, no fetch. ChatBot drives it.

import {
	INCIDENT_TYPE_VALUES,
	INFRASTRUCTURE_VALUES,
	INFRA_COUNT_VALUES,
	DAMAGE_CLASS_VALUES,
	DEBRIS_VALUES
} from "@/lib/surveyValidation";

export interface ScriptAnswers {
	incidentType: string;
	infrastructure: string[];
	otherText: string;
	infraName: string;
	infraCount: string;
	damageClass: string;
	debris: string;
	description: string;
	location: [number, number] | null;
}

export const EMPTY_ANSWERS: ScriptAnswers = {
	incidentType: "",
	infrastructure: [],
	otherText: "",
	infraName: "",
	infraCount: "",
	damageClass: "",
	debris: "",
	description: "",
	location: null
};

export interface Option {
	value: string;
	label: string;
}

export type StepId =
	| "incidentType"
	| "infrastructure"
	| "otherText"
	| "infraName"
	| "infraCount"
	| "damageClass"
	| "debris"
	| "description"
	| "location"
	| "photo"
	| "review";

export interface Step {
	id: StepId;
	prompt: string;
	// "single"/"multi" are answered by picking options (or typing them);
	// "text" by typing; "location"/"photo" by the buttons ChatBot renders for
	// them; "review" is the final confirmation.
	kind: "single" | "multi" | "text" | "location" | "photo" | "review";
	options?: Option[];
	optional?: boolean;
}

const INCIDENT_LABELS: Record<string, string> = {
	earthquake: "Earthquake",
	wildfire: "Wildfire",
	flood: "Flood",
	landslide: "Landslide"
};

const INFRASTRUCTURE_LABELS: Record<string, string> = {
	residential: "Residential (houses, apartments)",
	commercial: "Commercial (shops, markets, hotels)",
	government: "Government building",
	utility: "Utility (water, power, waste)",
	transport: "Transport or communication (roads, bridges, towers)",
	community: "Community (schools, hospitals, halls)",
	recreation: "Public space or recreation",
	other: "Other"
};

const DAMAGE_LABELS: Record<string, string> = {
	minimal: "Minimal or no damage",
	partial: "Partially damaged, still usable with caution",
	complete: "Completely damaged, unsafe or destroyed"
};

const DEBRIS_LABELS: Record<string, string> = {
	yes: "Yes, there is debris to clear",
	no: "No debris to clear"
};

function options_from(
	values: readonly string[],
	labels: Record<string, string>
): Option[] {
	return values.map((value) => ({ value, label: labels[value] ?? value }));
}

export const STEPS: Step[] = [
	{
		id: "incidentType",
		prompt: "What kind of incident are you reporting?",
		kind: "single",
		options: options_from(INCIDENT_TYPE_VALUES, INCIDENT_LABELS)
	},
	{
		id: "infrastructure",
		prompt:
			"What kind of infrastructure was affected? Pick every one that applies, then choose Done.",
		kind: "multi",
		options: options_from(INFRASTRUCTURE_VALUES, INFRASTRUCTURE_LABELS)
	},
	{
		id: "otherText",
		prompt: "You chose Other — what kind of infrastructure was it?",
		kind: "text"
	},
	{
		id: "infraName",
		prompt:
			"Does the affected place have a name? (For example: Westlands Primary.) You can skip this.",
		kind: "text",
		optional: true
	},
	{
		id: "infraCount",
		prompt: "Roughly how many were affected?",
		kind: "single",
		options: INFRA_COUNT_VALUES.map((value) => ({ value, label: value }))
	},
	{
		id: "damageClass",
		prompt: "How bad is the damage?",
		kind: "single",
		options: options_from(DAMAGE_CLASS_VALUES, DAMAGE_LABELS)
	},
	{
		id: "debris",
		prompt: "Is there debris that needs clearing on or near the site?",
		kind: "single",
		options: options_from(DEBRIS_VALUES, DEBRIS_LABELS)
	},
	{
		id: "description",
		prompt: "Anything else responders should know? You can skip this.",
		kind: "text",
		optional: true
	},
	{
		id: "location",
		prompt:
			"Where is this? Share your location and I'll pin the report there — or close this chat and drop the pin yourself on the report form.",
		kind: "location"
	},
	{
		id: "photo",
		prompt: "Last thing — add a photo of the damage.",
		kind: "photo"
	},
	{
		id: "review",
		prompt: "Here's your report. Send it?",
		kind: "review"
	}
];

// The "Other" follow-up only applies when Other was actually picked.
export function step_applies(step: Step, answers: ScriptAnswers): boolean {
	if (step.id === "otherText") return answers.infrastructure.includes("other");
	return true;
}

export function next_step_index(from: number, answers: ScriptAnswers): number {
	for (let i = from; i < STEPS.length; i++) {
		if (step_applies(STEPS[i], answers)) return i;
	}
	return STEPS.length;
}

const SKIP_WORDS = ["skip", "no", "none", "n/a", "na", "nothing", "next"];
const DONE_WORDS = ["done", "that's all", "thats all", "finished", "continue"];

export function is_skip(input: string): boolean {
	return SKIP_WORDS.includes(input.trim().toLowerCase());
}

export function is_done(input: string): boolean {
	return DONE_WORDS.includes(input.trim().toLowerCase());
}

/** Matches typed input against a step's options: by position ("2"), by exact
 *  value or label, or by a distinctive word from the label. Returns null when
 *  nothing matches, so the caller can re-ask rather than guess. */
export function match_option(input: string, options: Option[]): Option | null {
	const cleaned = input.trim().toLowerCase().replace(/[.!,]+$/, "");
	if (!cleaned) return null;

	const byIndex = Number(cleaned);
	if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= options.length) {
		return options[byIndex - 1];
	}

	const exact = options.find(
		(o) => o.value.toLowerCase() === cleaned || o.label.toLowerCase() === cleaned
	);
	if (exact) return exact;

	// The option's own value appearing as a whole word ("a flood hit us" ->
	// flood). Whole-word only, so "other" doesn't match "another".
	const byWord = options.filter((o) =>
		new RegExp(`\\b${o.value.toLowerCase()}\\b`).test(cleaned)
	);
	if (byWord.length === 1) return byWord[0];

	// Fall back to the leading word of the label ("Residential (houses…)").
	const byLabelWord = options.filter((o) => {
		const head = o.label.toLowerCase().split(/[\s(,]/)[0];
		return head.length > 2 && new RegExp(`\\b${head}\\b`).test(cleaned);
	});
	return byLabelWord.length === 1 ? byLabelWord[0] : null;
}

/** Multi-select: "residential and transport" / "1, 5" -> both values. */
export function match_options(input: string, options: Option[]): Option[] {
	const parts = input
		.split(/,| and | & |\/|;/i)
		.map((p) => p.trim())
		.filter(Boolean);
	const matched = new Map<string, Option>();
	for (const part of parts) {
		const hit = match_option(part, options);
		if (hit) matched.set(hit.value, hit);
	}
	return [...matched.values()];
}

/** What the reporter already told the assistant before it went down is worth
 *  keeping — scan it for an incident type so the script doesn't re-ask. */
export function detect_incident_type(text: string): string | null {
	const options = options_from(INCIDENT_TYPE_VALUES, INCIDENT_LABELS);
	return match_option(text, options)?.value ?? null;
}

export function summarize(answers: ScriptAnswers, photoName: string | null): string {
	const infra = answers.infrastructure
		.map((v) => INFRASTRUCTURE_LABELS[v]?.split(" (")[0] ?? v)
		.join(", ");
	const lines = [
		`Incident: ${INCIDENT_LABELS[answers.incidentType] ?? answers.incidentType}`,
		`Infrastructure: ${infra}${answers.otherText ? ` (${answers.otherText})` : ""}`,
		answers.infraName ? `Name: ${answers.infraName}` : null,
		`Number affected: ${answers.infraCount}`,
		`Damage: ${DAMAGE_LABELS[answers.damageClass] ?? answers.damageClass}`,
		`Debris: ${DEBRIS_LABELS[answers.debris] ?? answers.debris}`,
		answers.description ? `Notes: ${answers.description}` : null,
		answers.location
			? `Location: ${answers.location[0].toFixed(5)}, ${answers.location[1].toFixed(5)}`
			: null,
		photoName ? `Photo: ${photoName}` : null
	];
	return lines.filter(Boolean).join("\n");
}

/** The same multipart body the form posts, so /api/survey can't tell the
 *  difference between a report typed here and one filled in on the form. */
export function build_survey_form(
	answers: ScriptAnswers,
	photo: File | null
): FormData {
	const fd = new FormData();
	fd.append("incidentType", answers.incidentType);
	answers.infrastructure.forEach((v) => fd.append("infrastructure", v));
	fd.append("otherText", answers.otherText);
	fd.append("infraName", answers.infraName);
	fd.append("infraCount", answers.infraCount);
	fd.append("damageClass", answers.damageClass);
	fd.append("debris", answers.debris);
	fd.append("description", answers.description);
	if (answers.location) fd.append("location", JSON.stringify(answers.location));
	if (photo) fd.append("image", photo);
	return fd;
}
