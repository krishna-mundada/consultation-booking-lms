import { z } from "zod";
import { ERROR_CODE } from "@/lib/errors";

// The error body every failing API response carries (docs/architecture.md section 6). The server
// builds it in lib/api/handler.ts; the browser client validates against this schema instead of
// trusting an untyped `res.json()`.
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODE),
    message: z.string(),
    details: z.object({ fields: z.record(z.string(), z.array(z.string())).optional() }).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/**
 * The paging details every list reports (ADR 0007, A23). Shaped so a cursor mode can be added later
 * without changing clients: `total_pages` and `total` stay, and a cursor field would sit beside them.
 */
const pageMetaSchema = z.object({
  page: z.object({
    number: z.number(),
    size: z.number(),
    total: z.number(),
    total_pages: z.number(),
  }),
});
type PageMeta = z.infer<typeof pageMetaSchema>;

/** A page of results: `{ data, meta }`. */
export type Page<T> = { data: T[]; meta: PageMeta };

export const pageSchema = <T>(item: z.ZodType<T>): z.ZodType<Page<T>> =>
  z.object({ data: z.array(item), meta: pageMetaSchema });

/** `{ data: T }`: the body of a successful single-item response. */
export const itemSchema = <T>(item: z.ZodType<T>): z.ZodType<{ data: T }> => z.object({ data: item });
