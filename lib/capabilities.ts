export type CapturedRequest = { method: string; url: string; pattern: string; status: number; contentType: string; sample: string };

export type Capability = {
  name: string;
  description: string;
  requests: { method: string; urlPattern: string }[];
  inputs: { name: string; description: string; example: string }[];
  returns: string;
};
