import { z } from "zod";

export type CapturedRequest = { kind?: "page"; method: string; url: string; pattern: string; status: number; contentType: string; sample: string };

export type Capability = {
  name: string;
  description: string;
  requests: { method: string; urlPattern: string }[];
  inputs: { name: string; description: string; example: string }[];
  returns: string;
};

export type Task = Capability & { id: string };

export type Ordering = { enabled: boolean; limitUsd: number };

export type Website = {
  id: string;
  name: string;
  url: string;
  tasks: Task[];
  browserProfileId?: string;
  signedInAt?: string;
  loginSavedAt?: string;
  ordering?: Ordering;
};

export const maxApps = 100;
export const maxTasksPerApp = 500;
export const maxOrderLimitUsd = 500;

const shortText = z.string().max(200);
const longText = z.string().max(4000);
const address = z.string().max(2000);

export const appIdSchema = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/, "Use 1 to 80 letters, digits, or hyphens.");

export const capabilitySchema = z.object({
  name: shortText,
  description: longText,
  requests: z.array(z.object({ method: z.string().min(1).max(10), urlPattern: address.min(1) })).min(1).max(50),
  inputs: z.array(z.object({ name: shortText, description: longText, example: longText })).max(50),
  returns: longText,
}) satisfies z.ZodType<Capability>;

export const orderingSchema = z.object({
  enabled: z.boolean(),
  limitUsd: z.number().positive().max(maxOrderLimitUsd),
}) satisfies z.ZodType<Ordering>;

export const taskSchema = capabilitySchema.extend({ id: z.string().min(1).max(80) }) satisfies z.ZodType<Task>;

export const websiteSchema = z.object({
  id: appIdSchema,
  name: z.string().max(80).regex(/\S/, "Give the app a name."),
  url: z.url({ protocol: /^https?$/ }).max(2000),
  tasks: z.array(taskSchema).max(0, "Create the app first, then add tasks."),
}) satisfies z.ZodType<Website>;

export const storedWebsiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().refine((url) => URL.canParse(url)),
  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    requests: z.array(z.object({ method: z.string(), urlPattern: z.string() })),
    inputs: z.array(z.object({ name: z.string() })),
  })),
});
