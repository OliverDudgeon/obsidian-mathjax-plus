import assert from "node:assert/strict";
import { test } from "node:test";
import { runtime, bundleInputs } from "./runtime.mjs";

// These are native renderer integration tests, rather than mocks of MathJax.
test("fonts never bundle a second MathJax engine", () => {
	assert.equal(bundleInputs.some((path) => path.includes("@mathjax/src/")), false);
	assert.ok(bundleInputs.some((path) => path.includes("native-mathjax:output/chtml/FontData")));
});

test("native rendering, preamble replacement, layout and restoration", async () => {
	const w = await runtime();
	try {
		const { NativeMathJaxSession, getNativeMathJax, DEFAULT_SETTINGS } = w.TestAPI;
		const mj = getNativeMathJax();
		const original = { ...mj.startup };
		const hooks = [mj.tex2chtml, mj.tex2chtmlPromise, mj.chtmlStylesheet];
		const session = new NativeMathJaxSession(mj);
		const preamble = String.raw`\require{physics}\newcommand{\testmacro}{z}\renewcommand{\Re}{\operatorname{Re}}`;
		for (const font of ["newcm", "stix2", "pagella", "fira", "tex", "obsidian"]) {
			const prepared = await session.prepare({ ...DEFAULT_SETTINGS, font }, preamble);
			session.activate(prepared);
			const el = mj.tex2chtml(String.raw`\testmacro+\dd{x}+\Re(z)+\mathbb{R}+\mathscr{L}+\alpha`, { display: true });
			assert.equal(el.querySelector("mjx-merror"), null, font);
			assert.ok(el.querySelector("mjx-math"), font);
			const style = mj.chtmlStylesheet();
			w.document.head.append(style);
			assert.equal(style.textContent.includes("mjxfonts/"), false, font);
			if (!["tex", "obsidian"].includes(font)) assert.match(style.textContent, /data:font\/woff2;base64/);
			assert.equal(mj.startup.output.options.displayOverflow, "linebreak");
			assert.equal(mj.startup.output.options.linebreaks.width, "100%");
			assert.equal(mj.startup.output.linebreaks.TEXCLASS[3](0), -1500);
			// Keep the native safe handler: javascript links must be removed.
			const unsafe = mj.tex2chtml(String.raw`\href{javascript:alert(1)}{x}`);
			assert.equal(unsafe.querySelector('[href^="javascript:"]'), null);
			style.remove();
		}
		const changed = await session.prepare({ ...DEFAULT_SETTINGS, displayOverflow: "scroll", displayAlign: "left", breakWidth: "30em", preferRelationBreaks: false }, String.raw`\newcommand{\replacement}{b}`);
		session.activate(changed);
		assert.equal(mj.startup.output.options.displayOverflow, "scroll");
		assert.equal(mj.startup.output.options.displayAlign, "left");
		assert.equal(mj.startup.output.options.linebreaks.width, "30em");
		assert.equal(mj.startup.output.linebreaks.TEXCLASS[3](0), -500);
		const source = mj.tex2mml(String.raw`\testmacro+\replacement`);
		assert.match(source, /testmacro/); // removed macros no longer expand
		assert.match(source, />b</);
		await assert.rejects(session.prepare(DEFAULT_SETTINGS, String.raw`\newcommand{\oops}[1]{`));
		assert.equal(mj.startup.document, changed.document); // bad preamble never activated
		assert.deepEqual([mj.tex2chtml, mj.tex2chtmlPromise, mj.chtmlStylesheet], hooks);
		assert.equal(session.restore(), true);
		assert.equal(mj.startup.document, original.document);
		assert.equal(mj.startup.output, original.output);
		assert.equal(mj.startup.input, original.input);
		assert.doesNotThrow(() => mj.tex2chtml("x+1"));
		assert.equal(session.restore(), false);
	} finally {
		await w.happyDOM.close();
	}
});

test("saved settings are validated and old feature keys migrate", async () => {
	const w = await runtime();
	try {
		const { loadSettings, DEFAULT_SETTINGS } = w.TestAPI;
		assert.equal(JSON.stringify(loadSettings({ font: "bad", breakWidth: "0%", displayAlign: "bad" })), JSON.stringify(DEFAULT_SETTINGS));
		const saved = loadSettings({ font: "fira", preamblePath: "macros.sty", breakWidth: "80%", displayOverflow: "scale", displayAlign: "right", preferRelationBreaks: false });
		assert.equal(saved.font, "fira");
		assert.equal(saved.breakWidth, "80%");
		assert.equal(saved.preferRelationBreaks, false);
	} finally { await w.happyDOM.close(); }
});

test("rejects unsupported runtimes and respects another plugin's document", async () => {
	const w = await runtime();
	try {
		const { getNativeMathJax, NativeMathJaxSession, DEFAULT_SETTINGS } = w.TestAPI;
		const mj = w.MathJax;
		const version = mj.version;
		mj.version = "3.2.2";
		assert.throws(() => getNativeMathJax(), /native MathJax 4/);
		mj.version = version;
		const session = new NativeMathJaxSession(getNativeMathJax());
		const prepared = await session.prepare(DEFAULT_SETTINGS, "");
		const other = {};
		mj.startup.document = other;
		assert.throws(() => session.activate(prepared), /Another plugin/);
		assert.equal(session.restore(), false);
		assert.equal(mj.startup.document, other);
	} finally { await w.happyDOM.close(); }
});

test("plugin reloads edited and removed macros and cancels pending work on unload", async () => {
	const w = await runtime();
	try {
		const { Plugin } = w.TestAPI;
		const original = w.MathJax.startup.document;
		const files = new Map([["preamble.sty", String.raw`\newcommand{\fromvault}{a}`]]);
		const events = new Map();
		const plugin = new Plugin();
		plugin.app = {
			vault: {
				adapter: { exists: async (path) => files.has(path), read: async (path) => files.get(path) },
				on: (name, callback) => { events.set(name, callback); return { off: () => events.delete(name) }; },
			},
			workspace: { iterateAllLeaves() {} },
		};
		await plugin.onload();
		assert.match(w.MathJax.tex2mml(String.raw`\fromvault`), />a</);
		files.set("preamble.sty", String.raw`\newcommand{\fromvault}{b}`);
		events.get("modify")({ path: "preamble.sty" });
		await new Promise((resolve) => setTimeout(resolve, 450));
		await plugin.pending;
		assert.match(w.MathJax.tex2mml(String.raw`\fromvault`), />b</);
		files.delete("preamble.sty");
		await plugin.reloadMath();
		assert.match(w.MathJax.tex2mml(String.raw`\fromvault`), /fromvault/);
		// Unload while a real candidate document is being prepared.
		const prepare = plugin.session.prepare.bind(plugin.session);
		let release;
		let started;
		const entered = new Promise((resolve) => { started = resolve; });
		plugin.session.prepare = async (...args) => {
			started();
			await new Promise((resolve) => { release = resolve; });
			return prepare(...args);
		};
		const pending = plugin.reloadMath();
		await entered;
		plugin.onunload();
		for (const cleanup of plugin.cleanups) cleanup();
		release();
		await pending;
		assert.equal(w.MathJax.startup.document, original);
		assert.equal(events.size, 0);
		assert.equal(w.TestAPI.notices.length, 0);
	} finally { await w.happyDOM.close(); }
});

test("native font glyph spacing survives settings changes with an open equation", async () => {
	const w = await runtime();
	try {
		const { NativeMathJaxSession, DEFAULT_SETTINGS } = w.TestAPI;
		const mj = w.MathJax;
		// A note may already have been rendered before the plugin takes over.
		mj.tex2chtml("x+y+z", { display: true });
		const nativeStyle = mj.chtmlStylesheet();
		w.document.head.append(nativeStyle);
		const nativeFont = mj.startup.output.font;
		const session = new NativeMathJaxSession(mj);
		let previousStyle = nativeStyle;
		for (const font of ["newcm", "obsidian", "tex", "stix2", "tex", "fira", "pagella", "obsidian", "obsidian"]) {
			session.activate(await session.prepare({ ...DEFAULT_SETTINGS, font, displayAlign: "left" }, ""));
			assert.notEqual(mj.startup.output.font, nativeFont, "each renderer owns its font CSS cache");
			const equation = mj.tex2chtml("x+y+z", { display: true });
			w.document.body.replaceChildren(equation);
			const style = mj.chtmlStylesheet();
			previousStyle?.remove();
			w.document.head.append(style);
			previousStyle = style;
			const rules = Array.from(style.sheet.cssRules);
			for (const glyph of equation.querySelectorAll("mjx-c")) {
				const selector = `mjx-c.${glyph.className}`;
				assert.ok(rules.some((rule) => rule.selectorText === selector && rule.style.padding),
					`${font}: missing glyph spacing for ${glyph.textContent}; characters collapse to zero width`);
			}
		}
	} finally { await w.happyDOM.close(); }
});
