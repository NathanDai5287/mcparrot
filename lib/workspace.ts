import { Redis } from "@upstash/redis";
import type { Website } from "./capabilities";

const workspaceKey = "workspace";

export const readWorkspace = () => Redis.fromEnv().get<Website[]>(workspaceKey);

export const saveWorkspace = (apps: Website[]) => Redis.fromEnv().set(workspaceKey, apps);
