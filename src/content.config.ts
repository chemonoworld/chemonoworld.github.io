import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const contentId = ({ entry }: { entry: string }) =>
	entry.replace(/\/index\.(md|mdx)$/, "").replace(/\.(md|mdx)$/, "");

const blog = defineCollection({
	loader: glob({
		pattern: "**/*.{md,mdx}",
		base: "./src/content/blog",
		generateId: contentId,
	}),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
		heroImageAlt: z.string().optional(),
		lang: z.enum(["en", "ko"]).optional(),
		canonicalUrl: z.string().url().optional(),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
	}),
});

const notes = defineCollection({
	loader: glob({
		pattern: "**/*.{md,mdx}",
		base: "./src/content/notes",
		generateId: contentId,
	}),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
		heroImageAlt: z.string().optional(),
		lang: z.enum(["en", "ko"]).optional(),
		canonicalUrl: z.string().url().optional(),
		category: z.enum(["TIL", "Tips", "Snippet", "Memo"]).default("Memo"),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
	}),
});

export const collections = { blog, notes };
