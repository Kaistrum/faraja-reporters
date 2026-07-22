import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "rapida-surveys";
const DB_VERSION = 1;
const STORE = "pending";

export interface PendingSurveyFields {
	incidentType: string;
	infrastructure: string[];
	otherText: string;
	infraName: string;
	infraCount: string;
	damageClass: string;
	debris: string;
	description: string;
	location: [number, number] | null;
	client_id: string;
}

interface PendingSurveyRecord {
	id?: number;
	created_at: number;
	client_id: string;
	fields: PendingSurveyFields;
	image?: {
		blob: Blob;
		name: string;
		type: string;
	};
}

interface SurveyDB extends DBSchema {
	[STORE]: {
		key: number;
		value: PendingSurveyRecord;
		indexes: { by_client_id: string };
	};
}

let db_promise: Promise<IDBPDatabase<SurveyDB>> | null = null;

function get_db(): Promise<IDBPDatabase<SurveyDB>> {
	if (!db_promise) {
		db_promise = openDB<SurveyDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				const store = db.createObjectStore(STORE, {
					keyPath: "id",
					autoIncrement: true
				});
				store.createIndex("by_client_id", "client_id", { unique: true });
			}
		});
	}
	return db_promise;
}

export async function save_pending_survey(
	fields: PendingSurveyFields,
	photo: File | null
): Promise<number> {
	const db = await get_db();
	const record: PendingSurveyRecord = {
		created_at: Date.now(),
		client_id: fields.client_id,
		fields,
		...(photo
			? { image: { blob: photo, name: photo.name, type: photo.type } }
			: {})
	};
	return db.add(STORE, record);
}

export async function get_pending_count(): Promise<number> {
	const db = await get_db();
	return db.count(STORE);
}

async function try_resend(record: PendingSurveyRecord): Promise<boolean> {
	const fd = new FormData();
	fd.append("incidentType", record.fields.incidentType);
	record.fields.infrastructure.forEach((v) => fd.append("infrastructure", v));
	fd.append("otherText", record.fields.otherText);
	fd.append("infraName", record.fields.infraName);
	fd.append("infraCount", record.fields.infraCount);
	fd.append("damageClass", record.fields.damageClass);
	fd.append("debris", record.fields.debris);
	fd.append("description", record.fields.description);
	fd.append("client_id", record.fields.client_id);
	if (record.fields.location) {
		fd.append("location", JSON.stringify(record.fields.location));
	}
	if (record.image) {
		fd.append("image", new File([record.image.blob], record.image.name, { type: record.image.type }));
	}

	try {
		const res = await fetch("/api/survey", { method: "POST", body: fd });
		return res.ok || res.status === 200 || res.status === 202;
	} catch {
		return false;
	}
}

export async function sync_pending_surveys(): Promise<{ synced: number; remaining: number }> {
	const db = await get_db();
	const all = await db.getAll(STORE);
	let synced = 0;
	for (const record of all) {
		const ok = await try_resend(record);
		if (ok && record.id !== undefined) {
			await db.delete(STORE, record.id);
			synced++;
		} else {
			break; // stop on first failure — likely still offline
		}
	}
	const remaining = await db.count(STORE);
	return { synced, remaining };
}

export function make_client_id(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
