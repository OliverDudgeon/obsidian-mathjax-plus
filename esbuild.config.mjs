import esbuild from "esbuild";
import builtins from "builtin-modules";
import { nativeMathJaxPlugin } from "./scripts/native-mathjax-build.mjs";

const watch = process.argv.includes("--watch");

const options = {
	entryPoints: ["main.ts"],
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2020",
	plugins: [nativeMathJaxPlugin],
	// woff2 fonts are inlined as base64 data URIs so the plugin
	// ships as a single self-contained main.js — no external fonts/ folder.
	loader: { ".woff2": "dataurl" },
	// Obsidian provides these at runtime.
	external: [
		"obsidian",
		"electron",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		...builtins,
	],
	// Font packages provide ESM data modules.
	conditions: ["import", "module", "default"],
	mainFields: ["module", "main"],
	sourcemap: watch ? "inline" : false,
	logLevel: "info",
	outfile: "main.js",
};

if (watch) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	console.log("[build] watching...");
} else {
	await esbuild.build(options);
	console.log("[build] done");
}
