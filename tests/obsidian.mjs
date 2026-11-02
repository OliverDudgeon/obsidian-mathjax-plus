// Only the host lifecycle is stubbed. Rendering uses the real MathJax runtime.
export const notices = [];
export class Notice { constructor(message) { notices.push(message); } }
export class MarkdownView {}
export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
export class Setting {}
export class Plugin {
	cleanups = [];
	async loadData() { return null; }
	async saveData(data) { this.data = data; }
	addSettingTab() {}
	addCommand(command) { this.command = command; }
	register(cleanup) { this.cleanups.push(cleanup); }
	registerEvent(event) { this.register(() => event.off?.()); }
}
export async function loadMathJax() {}
export async function finishRenderMath() {
	const style = window.MathJax.chtmlStylesheet();
	window.document.getElementById(style.id)?.remove();
	window.document.head.append(style);
}
export function normalizePath(path) { return path.replaceAll("\\", "/").replace(/\/+/, "/").replace(/^\.\//, ""); }
export function debounce(callback, delay) {
	let timer;
	const run = () => { clearTimeout(timer); timer = setTimeout(callback, delay); };
	run.cancel = () => clearTimeout(timer);
	return run;
}
