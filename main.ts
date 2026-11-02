import {
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	debounce,
	finishRenderMath,
	loadMathJax,
	normalizePath,
} from "obsidian";
import { getNativeMathJax, NativeMathJaxSession } from "./native-mathjax";
import {
	DEFAULT_SETTINGS, FONT_LABELS, loadSettings, validBreakWidth,
	type MathJaxPlusSettings, type DisplayOverflow, type DisplayAlign,
} from "./settings";

export default class MathJaxPlusPlugin extends Plugin {
	settings: MathJaxPlusSettings = { ...DEFAULT_SETTINGS };
	private session: NativeMathJaxSession | null = null;
	private disposed = false;
	private revision = 0;
	private pending: Promise<void> = Promise.resolve();

	async onload() {
		this.settings = loadSettings(await this.loadData());
		this.addSettingTab(new MathJaxPlusSettingTab(this.app, this));
		this.addCommand({
			id: "reload-preamble",
			name: "Reload preamble and refresh math",
			callback: () => { void this.reloadMath(); },
		});

		const reload = debounce(() => { void this.reloadMath(); }, 400, true);
		this.register(() => reload.cancel());
		const changed = (path: string) => {
			if (this.preamblePath && normalizePath(path) === this.preamblePath) reload();
		};
		this.registerEvent(this.app.vault.on("modify", (file) => changed(file.path)));
		this.registerEvent(this.app.vault.on("create", (file) => changed(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => changed(file.path)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			changed(oldPath);
			changed(file.path);
		}));

		try {
			await loadMathJax();
			if (this.disposed) return;
			this.session = new NativeMathJaxSession(getNativeMathJax());
			await this.reloadMath();
		} catch (error) {
			this.reportError(error);
		}
	}

	private get preamblePath(): string {
		const path = this.settings.preamblePath.trim();
		return path ? normalizePath(path) : "";
	}

	/** Serialize reloads and discard stale work, including work pending at unload. */
	reloadMath(): Promise<void> {
		const revision = ++this.revision;
		this.pending = this.pending.then(async () => {
			if (this.disposed || revision !== this.revision || !this.session) return;
			const settings = { ...this.settings };
			const path = this.preamblePath;
			let preamble = "";
			if (path && await this.app.vault.adapter.exists(path)) {
				preamble = await this.app.vault.adapter.read(path);
			}
			const prepared = await this.session.prepare(settings, preamble);
			if (this.disposed || revision !== this.revision) return;
			this.session.activate(prepared);
			this.refreshMath();
		}).catch((error: unknown) => {
			if (!this.disposed && revision === this.revision) this.reportError(error);
		});
		return this.pending;
	}

	private reportError(error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`MathJax Plus: ${message}`);
		console.error("[mathjax-plus]", error);
	}

	private refreshMath() {
		void finishRenderMath();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!(leaf.view instanceof MarkdownView)) return;
			// Obsidian 1.15's internal rebuild refreshes both Live Preview and Reading
			// view. Keep a public-API fallback for future versions.
			const rebuild = (leaf as unknown as { rebuildView?: () => void }).rebuildView;
			if (typeof rebuild === "function") rebuild.call(leaf);
			else leaf.view.previewMode.rerender(true);
		});
	}

	onunload() {
		this.disposed = true;
		++this.revision;
		if (this.session?.restore()) this.refreshMath();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MathJaxPlusSettingTab extends PluginSettingTab {
	constructor(
		app: MathJaxPlusSettingTab["app"],
		private plugin: MathJaxPlusPlugin,
	) {
		super(app, plugin);
	}

	display() {
		const { containerEl } = this;
		const plugin = this.plugin;
		containerEl.empty();

		new Setting(containerEl).setName("Rendering").setHeading();

		new Setting(containerEl)
			.setName("Math font")
			.setDesc("The font used by Obsidian’s native MathJax renderer. Fonts are bundled for offline use.")
			.addDropdown((dd) => {
				for (const [key, entry] of Object.entries(FONT_LABELS)) dd.addOption(key, entry);
				dd.setValue(plugin.settings.font).onChange(async (value) => {
					plugin.settings.font = value;
					await plugin.saveSettings();
					await plugin.reloadMath();
				});
			});

		new Setting(containerEl)
			.setName("Wide display equations")
			.setDesc(
				"How to handle display equations too wide for the note: line-break, scale to fit, scroll, or let them overflow.",
			)
			.addDropdown((dd) => {
				dd.addOptions({
					linebreak: "Line-break",
					scale: "Scale to fit",
					scroll: "Scroll",
					overflow: "Overflow",
				})
					.setValue(plugin.settings.displayOverflow)
					.onChange(async (value) => {
						plugin.settings.displayOverflow = value as DisplayOverflow;
						await plugin.saveSettings();
						await plugin.reloadMath();
					});
			});

		new Setting(containerEl)
			.setName("Line-break width")
			.setDesc(
				'Wrap width as a percentage of MathJax’s rendering width or a fixed size (e.g. "100%", "80%", "30em").',
			)
			.addText((text) =>
				text
					.setPlaceholder("100%")
					.setValue(plugin.settings.breakWidth)
					.onChange(async (value) => {
						const width = value.trim() || "100%";
						if (!validBreakWidth(width)) return;
						plugin.settings.breakWidth = width;
						await plugin.saveSettings();
						await plugin.reloadMath();
					}),
			);

		new Setting(containerEl)
			.setName("Display alignment")
			.setDesc("Horizontal alignment of display equations.")
			.addDropdown((dd) => {
				dd.addOptions({ left: "Left", center: "Center", right: "Right" })
					.setValue(plugin.settings.displayAlign)
					.onChange(async (value) => {
						plugin.settings.displayAlign = value as DisplayAlign;
						await plugin.saveSettings();
						await plugin.reloadMath();
					});
			});

		new Setting(containerEl)
			.setName("Prefer breaks at relations")
			.setDesc(
				"When auto-breaking wide equations, strongly prefer breaking at relations (=, ≤) and operators (+, −) rather than mid-expression. Turn off for MathJax's default balancing.",
			)
			.addToggle((tg) =>
				tg.setValue(plugin.settings.preferRelationBreaks).onChange(async (value) => {
					plugin.settings.preferRelationBreaks = value;
					await plugin.saveSettings();
					await plugin.reloadMath();
				}),
			);

		new Setting(containerEl).setName("Preamble").setHeading();

		new Setting(containerEl)
			.setName("Preamble file")
			.setDesc(
				"Vault-relative path to a .sty file of macros and \\require directives. Changes reload automatically. Leave empty to disable.",
			)
			.addText((text) =>
				text
					.setPlaceholder("preamble.sty")
					.setValue(plugin.settings.preamblePath)
					.onChange(async (value) => {
						plugin.settings.preamblePath = value;
						await plugin.saveSettings();
						await plugin.reloadMath();
					}),
			);
	}
}
