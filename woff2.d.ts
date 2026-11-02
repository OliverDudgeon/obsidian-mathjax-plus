// woff2 files are imported as base64 data URI strings (esbuild `dataurl` loader).
declare module "*.woff2" {
	const dataUrl: string;
	export default dataUrl;
}
