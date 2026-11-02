// Font packages import a handful of MathJax helpers. Resolve those imports to
// Obsidian's loaded classes, so font data never pulls a second engine into main.js.
export const nativeMathJaxPlugin = {
	name: "obsidian-native-mathjax",
	setup(build) {
		const modules = {
			"output/common/FontData": ["FontData", "VFUZZ", "HFUZZ", "NOSTRETCH", "mergeOptions"],
			"output/common/Direction": ["DIRECTION", "V", "H"],
			"output/chtml/FontData": ["ChtmlFontData", "AddCSS"],
			"output/chtml/DynamicFonts": ["AddFontIds"],
		};
		build.onResolve({ filter: /^@mathjax\/src\// }, ({ path }) => {
			const key = path.replace(/^@mathjax\/src\/(?:mjs|js)\//, "").replace(/\.js$/, "");
			if (!modules[key]) throw new Error(`Unmapped native MathJax import: ${path}`);
			return { path: key, namespace: "native-mathjax" };
		});
		build.onLoad({ filter: /.*/, namespace: "native-mathjax" }, ({ path }) => ({
			contents: modules[path].map((name) =>
				`export const ${name} = window.MathJax._.${path.replaceAll("/", ".")}.${name};`,
			).join("\n"),
			loader: "js",
		}));
	},
};
