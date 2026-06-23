// The Participant Registry admin API returns business outcomes in a FinalResponse
// envelope — { status: boolean, message?, extra? } — at HTTP 200. A `status:false`
// is a logical failure (e.g. validation rejected, duplicate), NOT a transport
// success, so write flows must inspect it rather than treat any 2xx as success.
// Endpoints that succeed with a payload (lists, validation results) carry no
// `status` field, so prFailed() is false for them.

export interface FinalResponse {
  status?: boolean;
  message?: string;
  extra?: string;
}

// True when the PR reported a logical failure (status === false) despite a 2xx.
export const prFailed = (data: any): boolean => !!data && data.status === false;

// A human-readable message from a FinalResponse: the message (ignoring the
// generic "success" sentinel the PR returns) or the extra detail, else "" so the
// caller can fall back to a localized string.
export const prMessage = (data: any): string => {
  if (!data || typeof data !== "object") return "";
  const msg = typeof data.message === "string" ? data.message.trim() : "";
  if (msg && msg.toLowerCase() !== "success") return msg;
  return typeof data.extra === "string" ? data.extra.trim() : "";
};
