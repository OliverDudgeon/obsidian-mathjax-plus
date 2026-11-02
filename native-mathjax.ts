import type { CHTML } from "@mathjax/src/js/output/chtml.js";
import type { TeX } from "@mathjax/src/js/input/tex.js";
import type { HTMLDocument } from "@mathjax/src/js/handlers/html/HTMLDocument.js";
import type { MathJaxPlusSettings } from "./settings";

type Output = CHTML<HTMLElement, Text, Document>;
type Input = TeX<HTMLElement, Text, Document>;
type MathDocument = HTMLDocument<HTMLElement, Text, Document>;

export interface NativeMathJax {
	version: string;
	config: { tex: Record<string, unknown>; options: Record<string, unknown> };
	startup: { document: MathDocument; output: Output; input: Input[] };
	_: {
		core: { MathItem: { STATE: { COMPILED: number } } };
		input: { tex_ts: { TeX: new (options: Record<string, unknown>) => Input } };
		output: { chtml_ts: { CHTML: new (options: Record<string, unknown>) => Output } };
	};
}

export function getNativeMathJax(): NativeMathJax {
	const mj = (window as unknown as { MathJax?: NativeMathJax }).MathJax;
	if (!mj?.version?.startsWith("4.") || !mj.startup?.document
		|| !mj._?.input?.tex_ts?.TeX || !mj._?.output?.chtml_ts?.CHTML) {
		throw new Error("Obsidian 1.15 or later with native MathJax 4 is required.");
	}
	if (mj.startup.output?.name !== "CHTML") {
		throw new Error("The active MathJax output is not CommonHTML.");
	}
	return mj;
}

function inlineFonts(style: HTMLStyleElement, data: Record<string, string>) {
	const swap = (value: string) => value.replace(
		/url\((["']?)mjxfonts\/([^"')]+\.woff2)\1\)/g,
		(match, _quote, file: string) => data[file] ? `url(${data[file]})` : match,
	);
	const hasFont = (rule: string) => {
		// Upstream fonts also declare empty variants with no corresponding file.
		const file = /mjxfonts\/([^"')]+\.woff2)/.exec(rule)?.[1];
		return !file || Object.hasOwn(data, file);
	};
	if (style.textContent?.includes("mjxfonts/")) {
		style.textContent = swap(style.textContent.replace(/@font-face[^{}]*\{[^}]*\}/g,
			(rule) => hasFont(rule) ? rule : ""));
	}
	const sheet = style.sheet;
	if (sheet) {
		for (let i = 0; i < sheet.cssRules.length; i++) {
			const rule = sheet.cssRules[i];
			if (rule.type === 5 && rule.cssText.includes("mjxfonts/")) {
				sheet.deleteRule(i);
				if (hasFont(rule.cssText)) sheet.insertRule(swap(rule.cssText), i);
				else i--;
			}
		}
	}
	return style;
}

/** A configured document built entirely from Obsidian's own MathJax classes.
 * Native conversion functions, loader, handler and safety mixins stay in place.
 * A separate TeX instance makes preamble changes removable on reload/unload.
 */
export class NativeMathJaxSession {
	private readonly original;
	private activeDocument: MathDocument | null = null;

	constructor(private readonly mj: NativeMathJax) {
		this.original = { ...mj.startup };
	}

	async prepare(settings: MathJaxPlusSettings, preamble: string): Promise<{
		document: MathDocument; output: Output; input: Input[];
	}> {
		// Font modules read native helper classes, so load them only after MathJax.
		const { FONTS } = await import("./font-registry");
		const entry = FONTS[settings.font];
		const originalInput = this.original.input.find((jax) => jax.name === "TeX");
		if (!originalInput) throw new Error("Obsidian's TeX input is unavailable.");
		const input = new this.mj._.input.tex_ts.TeX({
			...this.mj.config.tex,
			...originalInput.options,
		});
		const originalOutput = this.original.output;
		const output = new this.mj._.output.chtml_ts.CHTML({
			...originalOutput.options,
			fontData: entry?.FontClass ?? originalOutput.font,
			...(entry ? { fontURL: "mjxfonts" } : {}),
			displayOverflow: settings.displayOverflow,
			displayAlign: settings.displayAlign,
			linebreaks: {
				...originalOutput.options.linebreaks,
				inline: true,
				width: settings.breakWidth,
			},
		});
		if (settings.preferRelationBreaks) {
			// Modify this visitor only; never change the native class or its defaults.
			const visitor = output.linebreaks as typeof output.linebreaks & {
				TEXCLASS: Record<number, (penalty: number) => number>;
			};
			Object.assign(visitor.TEXCLASS, {
				2: (penalty: number) => penalty - 750,
				3: (penalty: number) => penalty - 1500,
			});
		}
		if (entry) {
			// Every dynamic module is bundled and already registered. Mark it loaded
			// before asking the native font to install its metrics; no network or
			// changes to mathjax.asyncLoad/asyncIsSynchronous are needed.
			const fontClass = entry.FontClass as typeof entry.FontClass & {
				dynamicFiles: Record<string, { promise: Promise<void> | null }>;
			};
			for (const dynamic of Object.values(fontClass.dynamicFiles)) {
				dynamic.promise ??= Promise.resolve();
			}
			await output.font.loadDynamicFiles();
			const styleSheet = output.styleSheet.bind(output);
			output.styleSheet = (doc) => inlineFonts(styleSheet(doc) as HTMLStyleElement, entry.data);
		}
		// The native document constructor includes Obsidian's safe/a11y mixins.
		const DocumentClass = this.original.document.constructor as typeof HTMLDocument<HTMLElement, Text, Document>;
		const document = new DocumentClass(
			this.original.document.document,
			this.original.document.adaptor,
			{ ...this.mj.config.options, InputJax: [input], OutputJax: output },
		);
		// Menu initialization can override these even with the menu disabled.
		// Preserve Obsidian's effective feature flags (including its post-startup
		// accessibility configuration), rather than the menu's defaults.
		for (const [name, value] of Object.entries(this.original.document.options)) {
			if (name.startsWith("enable")) document.options[name] = value;
		}
		if (preamble.trim()) {
			const formatError = input.options.formatError;
			input.options.formatError = (_jax: unknown, error: Error) => { throw error; };
			try {
				await document.convertPromise(preamble, { end: this.mj._.core.MathItem.STATE.COMPILED });
			} finally {
				input.options.formatError = formatError;
			}
		}
		return { document, output, input: [input] };
	}

	activate(prepared: Awaited<ReturnType<NativeMathJaxSession["prepare"]>>) {
		if (this.mj.startup.document !== (this.activeDocument ?? this.original.document)) {
			throw new Error("Another plugin changed the MathJax document. Reload Obsidian before applying settings.");
		}
		Object.assign(this.mj.startup, prepared);
		this.activeDocument = prepared.document;
	}

	restore(): boolean {
		if (!this.activeDocument || this.mj.startup.document !== this.activeDocument) return false;
		Object.assign(this.mj.startup, {
			document: this.original.document,
			output: this.original.output,
			input: this.original.input,
		});
		this.original.output.clearCache();
		this.activeDocument = null;
		return true;
	}
}
