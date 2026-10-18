export type CapturedRequest = { kind?: "page"; method: string; url: string; pattern: string; status: number; contentType: string; sample: string };

export type Capability = {
  name: string;
  description: string;
  requests: { method: string; urlPattern: string }[];
  inputs: { name: string; description: string; example: string }[];
  returns: string;
};

export type Task = Capability & { id: string };

export type Website = {
  id: string;
  name: string;
  url: string;
  tasks: Task[];
  browserProfileId?: string;
  signedInAt?: string;
  loginSavedAt?: string;
};
