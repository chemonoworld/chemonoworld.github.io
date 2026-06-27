export function slugifyTag(tag: string) {
	return tag
		.trim()
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function tagPath(tag: string) {
	return `/tags/${slugifyTag(tag)}/`;
}

export function getTagLabel(tags: string[], slug: string) {
	return tags.find((tag) => slugifyTag(tag) === slug) ?? slug;
}

export function inferLanguage(...values: Array<string | undefined>) {
	return values.some((value) => /[가-힣]/.test(value ?? "")) ? "ko" : "en";
}

export function ogLocale(lang: string) {
	return lang === "ko" ? "ko_KR" : "en_US";
}
