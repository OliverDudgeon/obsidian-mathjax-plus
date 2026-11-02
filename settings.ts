export const FONT_LABELS: Record<string, string> = {
	obsidian: "Obsidian default",
	newcm: "New Computer Modern",
	stix2: "STIX Two",
	tex: "TeX (classic MathJax)",
	pagella: "TeX Gyre Pagella",
	fira: "Fira Math (sans-serif)",
};

export type DisplayOverflow = "linebreak" | "scale" | "scroll" | "overflow";
export type DisplayAlign = "left" | "center" | "right";

export interface MathJaxPlusSettings {
	preamblePath: string;
	font: string;
	displayOverflow: DisplayOverflow;
	breakWidth: string;
	displayAlign: DisplayAlign;
	preferRelationBreaks: boolean;
}

export const DEFAULT_SETTINGS: MathJaxPlusSettings = {
	preamblePath: "preamble.sty",
	font: "newcm",
	displayOverflow: "linebreak",
	breakWidth: "100%",
	displayAlign: "center",
	preferRelationBreaks: true,
};

// MathJax accepts percentages and lengths; keep invalid/unfinished text out of
// the renderer while a user edits the setting.
export function validBreakWidth(value: string): boolean {
	return /^(?:\d+(?:\.\d+)?|\.\d+)(?:%|em|ex|px|pt|pc|in|cm|mm)$/.test(value)
		&& parseFloat(value) > 0;
}

export function loadSettings(data: unknown): MathJaxPlusSettings {
	const settings = { ...DEFAULT_SETTINGS };
	if (!data || typeof data !== "object") return settings;
	const saved = data as Record<string, unknown>;
	if (typeof saved.preamblePath === "string") settings.preamblePath = saved.preamblePath;
	if (typeof saved.font === "string" && Object.hasOwn(FONT_LABELS, saved.font)) settings.font = saved.font;
	if (["linebreak", "scale", "scroll", "overflow"].includes(String(saved.displayOverflow))) {
		settings.displayOverflow = saved.displayOverflow as DisplayOverflow;
	}
	if (typeof saved.breakWidth === "string" && validBreakWidth(saved.breakWidth.trim())) {
		settings.breakWidth = saved.breakWidth.trim();
	}
	if (["left", "center", "right"].includes(String(saved.displayAlign))) {
		settings.displayAlign = saved.displayAlign as DisplayAlign;
	}
	if (typeof saved.preferRelationBreaks === "boolean") settings.preferRelationBreaks = saved.preferRelationBreaks;
	return settings;
}
