import { z } from "zod";

export type TokenHeader = { header: string; fromLocalStorage: string };

export type CapturedRequest = { kind?: "page"; method: string; url: string; pattern: string; status: number; contentType: string; sample: string; body?: string; requestContentType?: string; requestHeaders?: Record<string, string>; tokenHeaders?: TokenHeader[] };

export type TaskRequest = { method: string; urlPattern: string; bodyPattern?: string; contentType?: string; headers?: Record<string, string>; tokenHeaders?: TokenHeader[] };

export type Capability = {
  name: string;
  description: string;
  requests: TaskRequest[];
  inputs: { name: string; description: string; example: string }[];
  returns: string;
};

export type Task = Capability & { id: string };

export type DiscoveredCapability = Capability & { updatesTaskId?: string };

export type Discovery = { discoveredAt: string; capabilities: DiscoveredCapability[] };

export type Ordering = { enabled: boolean; limitUsd: number };

export type AutomaticSignIn = { method: "off" } | { method: "password" } | { method: "google"; googleEmail?: string };

export type Website = {
  id: string;
  name: string;
  url: string;
  tasks: Task[];
  browserProfileId?: string;
  signedInAt?: string;
  loginSavedAt?: string;
  automaticSignIn?: AutomaticSignIn;
  ordering?: Ordering;
  connectionTokenHash?: string;
  listing?: { id: string; publishedAt: string; description: string };
  installedFrom?: string;
};

export const maxApps = 100;
export const maxTasksPerApp = 500;
export const maxOrderLimitUsd = 500;

const shortText = z.string().max(200);
const longText = z.string().max(4000);
const address = z.string().max(2000);
export const maximumBodyLength = 30_000;

export const appIdSchema = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/, "Use 1 to 80 letters, digits, or hyphens.");

export const capabilitySchema = z.object({
  name: shortText,
  description: longText,
  requests: z.array(z.object({ method: z.string().min(1).max(10), urlPattern: address.min(1), bodyPattern: z.string().max(maximumBodyLength).optional(), contentType: shortText.optional(), headers: z.record(shortText, shortText).optional(), tokenHeaders: z.array(z.object({ header: shortText, fromLocalStorage: shortText })).max(10).optional() })).min(1).max(50),
  inputs: z.array(z.object({ name: shortText, description: longText, example: longText })).max(50),
  returns: longText,
}) satisfies z.ZodType<Capability>;

export const orderingSchema = z.object({
  enabled: z.boolean(),
  limitUsd: z.number().positive().max(maxOrderLimitUsd),
}) satisfies z.ZodType<Ordering>;

export const automaticSignInSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("off") }),
  z.object({ method: z.literal("password") }),
  z.object({ method: z.literal("google"), googleEmail: z.email("Enter a Google account email, or leave it empty.").max(320).optional() }),
]) satisfies z.ZodType<AutomaticSignIn>;

export const automaticSignInOf = (app: Website): AutomaticSignIn => app.automaticSignIn ?? { method: app.loginSavedAt ? "password" : "off" };

export const taskSchema = capabilitySchema.extend({ id: z.string().min(1).max(80) }) satisfies z.ZodType<Task>;

export const websiteSchema = z.object({
  id: appIdSchema,
  name: z.string().max(80).regex(/\S/, "Give the app a name."),
  url: z.url({ protocol: /^https?$/ }).max(2000),
  tasks: z.array(taskSchema).max(0, "Create the app first, then add tools."),
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
  installedFrom: appIdSchema.optional(),
});
