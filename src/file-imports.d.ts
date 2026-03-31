declare module "*.html" {
	const content: string;
	export default content;
}
declare module "factoriomod:*" {
	const content: Uint8Array;
	export default content;
}

// with import-glob
declare module "*.lua" {
	export const filenames: string[];
	const content: {default:string}[];
	export default content;
}

declare module "*.css" {
}