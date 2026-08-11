// Single source of truth for "is this report complete enough to submit?".
// Used by the survey form (to block Next/Submit) and by /api/survey (so a
// blank report can't get in through the offline queue or a direct POST).

export const INCIDENT_TYPE_VALUES = [
	"earthquake",
	"wildfire",
	"flood",
	"landslide"
] as const;

export const INFRASTRUCTURE_VALUES = [
	"residential",
	"commercial",
	"government",
	"utility",
	"transport",
	"community",
	"recreation",
	"other"
] as const;

export const INFRA_COUNT_VALUES = ["1", "2 - 5", "6 - 20", "More than 20"] as const;

export const DAMAGE_CLASS_VALUES = ["minimal", "partial", "complete"] as const;

export const DEBRIS_VALUES = ["yes", "no"] as const;

export type SurveyField =
	| "incidentType"
	| "infrastructure"
	| "otherText"
	| "infraCount"
	| "damageClass"
	| "debris"
	| "location"
	| "photo";

export interface SurveyValidationInput {
	incidentType?: string | null;
	infrastructure?: string[] | null;
	otherText?: string | null;
	infraCount?: string | null;
	damageClass?: string | null;
	debris?: string | null;
	location?: [number, number] | null;
	hasPhoto?: boolean;
}

// Error values are i18n keys so the form can translate them; ERROR_MESSAGES
// holds the English fallback the API returns to non-UI callers.
export const ERROR_MESSAGES: Record<string, string> = {
	"validation.incidentType": "Select the type of incident.",
	"validation.infrastructure": "Select at least one type of affected infrastructure.",
	"validation.otherText": "Describe the other infrastructure you selected.",
	"validation.infraCount": "Select how many pieces of infrastructure were affected.",
	"validation.damageClass": "Select the level of damage.",
	"validation.debris": "Say whether there is debris that needs clearing.",
	"validation.location": "Drop a pin on the map to mark the disaster location.",
	"validation.photo": "Add a photo of the damaged infrastructure."
};

// Which carousel slide each field lives on, so the form can jump the user to
// the first thing they still need to fill in.
export const FIELD_SLIDE: Record<SurveyField, number> = {
	incidentType: 0,
	infrastructure: 0,
	otherText: 0,
	infraCount: 2,
	damageClass: 3,
	debris: 4,
	location: 5,
	photo: 7
};

// Fields validated on each slide, used to gate the Next button.
export const SLIDE_FIELDS: SurveyField[][] = [
	["incidentType", "infrastructure", "otherText"],
	[],
	["infraCount"],
	["damageClass"],
	["debris"],
	["location"],
	[],
	["photo"]
];

export type SurveyErrors = Partial<Record<SurveyField, string>>;

function is_valid_location(location: unknown): location is [number, number] {
	if (!Array.isArray(location) || location.length !== 2) return false;
	const [lat, lng] = location;
	if (typeof lat !== "number" || typeof lng !== "number") return false;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function validate_survey(input: SurveyValidationInput): SurveyErrors {
	const errors: SurveyErrors = {};

	const incidentType = (input.incidentType ?? "").trim();
	if (!(INCIDENT_TYPE_VALUES as readonly string[]).includes(incidentType)) {
		errors.incidentType = "validation.incidentType";
	}

	const infrastructure = (input.infrastructure ?? []).filter((v) =>
		(INFRASTRUCTURE_VALUES as readonly string[]).includes(v)
	);
	if (infrastructure.length === 0) {
		errors.infrastructure = "validation.infrastructure";
	} else if (infrastructure.includes("other") && !(input.otherText ?? "").trim()) {
		errors.otherText = "validation.otherText";
	}

	if (!(INFRA_COUNT_VALUES as readonly string[]).includes((input.infraCount ?? "").trim())) {
		errors.infraCount = "validation.infraCount";
	}

	if (!(DAMAGE_CLASS_VALUES as readonly string[]).includes((input.damageClass ?? "").trim())) {
		errors.damageClass = "validation.damageClass";
	}

	if (!(DEBRIS_VALUES as readonly string[]).includes((input.debris ?? "").trim())) {
		errors.debris = "validation.debris";
	}

	if (!is_valid_location(input.location)) {
		errors.location = "validation.location";
	}

	if (!input.hasPhoto) {
		errors.photo = "validation.photo";
	}

	return errors;
}

// Field order used when reporting "the first thing that's missing".
export const FIELD_ORDER: SurveyField[] = [
	"incidentType",
	"infrastructure",
	"otherText",
	"infraCount",
	"damageClass",
	"debris",
	"location",
	"photo"
];

export function first_error_field(errors: SurveyErrors): SurveyField | null {
	return FIELD_ORDER.find((field) => errors[field]) ?? null;
}
