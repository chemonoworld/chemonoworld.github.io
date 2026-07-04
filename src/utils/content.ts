import type { CollectionEntry } from "astro:content";

type PublishableEntry = CollectionEntry<"blog"> | CollectionEntry<"notes">;

export function isPublished(entry: PublishableEntry) {
	return entry.data.draft !== true;
}
