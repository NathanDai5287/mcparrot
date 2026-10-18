export const connectionToolNames = ["read_page", "view_image", "save_task", "submit_verification_code", "prepare_order", "check_order", "place_order", "cancel_order"];

export function toolName(taskName: string) {
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}
