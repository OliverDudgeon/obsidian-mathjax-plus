import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Window } from "happy-dom";
import { build } from "esbuild";
import { nativeMathJaxPlugin } from "../scripts/native-mathjax-build.mjs";

const require = createRequire(import.meta.url);
export const packages = [
	"action", "amscd", "bbox", "boldsymbol", "braket", "bussproofs", "cancel",
	"cases", "centernot", "color", "colortbl", "empheq", "enclose", "extpfeil",
	"gensymb", "html", "mathtools", "mhchem", "noerrors", "tagformat", "textcomp",
	"unicode", "upgreek", "verb",
];

function runtimeSource() {
	if (process.env.OBSIDIAN_ASAR) {
		const archive = readFileSync(process.env.OBSIDIAN_ASAR);
		const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)));
		const file = header.files.lib.files.mathjax.files["obsidian-mathjax.js"];
		const start = 8 + archive.readUInt32LE(4) + Number(file.offset);
		return archive.subarray(start, start + file.size).toString();
	}
	// Portable equivalent of Obsidian's combined component, using the same
	// MathJax version, preloaded TeX extensions, TeX font, and safe handler.
	const root = dirname(require.resolve("@mathjax/src/package.json"));
	const files = [
		join(root, "bundle/tex-chtml-nofont.js"),
		require.resolve("@mathjax/mathjax-tex-font/chtml.js"),
		join(root, "bundle/ui/safe.js"),
		...[...new Set(["enclose", "empheq", "color", ...packages, "physics"])].map((name) => join(root, `bundle/input/tex/extensions/${name}.js`)),
	];
	return files.map((file) => readFileSync(file, "utf8")).join("\n")
		+ `\nMathJax.loader.preLoaded("ui/safe", "[mathjax-tex]/chtml", ${[...new Set([...packages, "physics"])].map(name => JSON.stringify(`[tex]/${name}`)).join(",")});`;
}

const built = await build({
	stdin: { contents: 'export * from "./native-mathjax"; export * from "./settings"; export {default as Plugin} from "./main"; export {notices} from "./tests/obsidian.mjs";', resolveDir: process.cwd() },
	bundle: true, write: false, format: "iife", globalName: "TestAPI",
	platform: "browser", loader: { ".woff2": "dataurl" }, plugins: [nativeMathJaxPlugin, { name: "test-obsidian", setup(build) { build.onResolve({ filter: /^obsidian$/ }, () => ({ path: join(process.cwd(), "tests/obsidian.mjs") })); } }],
	metafile: true,
});
export const bundleInputs = Object.keys(built.metafile.inputs);

export async function runtime() {
	const window = new Window({
		url: "http://localhost",
		settings: {
			enableJavaScriptEvaluation: true,
			suppressInsecureJavaScriptEnvironmentWarning: true,
			disableCSSFileLoading: true,
			disableJavaScriptFileLoading: true,
		},
	});
	// Happy DOM's per-window Document constructor does not include its own
	// initial HTMLDocument. Match the browser instanceof contract for MathJax.
	window.Document = Object.getPrototypeOf(window.document).constructor;
	window.console = console;
	const config = {
		loader: { paths: { "mathjax-tex": "/lib/mathjax/tex-font", "mathjax-mhchem-extension": "/lib/mathjax/mhchem-font-extension" } },
		output: { font: "mathjax-tex", ...(process.env.OBSIDIAN_ASAR ? { fontExtensions: ["mathjax-mhchem"] } : {}) },
		tex: {
			packages: { "[+]": packages },
			macros: { RequirePackage: ["\\require{#1}", 1], usepackage: ["\\require{#1}", 1] },
			inlineMath: [], displayMath: [], processEscapes: false, processEnvironments: false, processRefs: false,
		},
		startup: { typeset: false },
		options: { enableMenu: false, enableEnrichment: false, enableExplorer: false, safeOptions: { safeProtocols: { http: true, https: true, file: true, javascript: false, data: false } } },
	};
	// Construct config inside the window: MathJax checks object prototypes.
	window.eval(`window.MathJax = ${JSON.stringify(config)};`);
	window.eval(runtimeSource());
	await window.MathJax.startup.promise;
	Object.assign(window.MathJax.startup.document.options, { enableMenu: false, enableEnrichment: false, enableExplorer: false });
	window.eval(built.outputFiles[0].text);
	return window;
}
