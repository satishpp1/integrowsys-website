import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: z.object({ title:z.string(), description:z.string(), category:z.string(), order:z.number().default(99), draft:z.boolean().default(false) })
});
export const collections = { services };
