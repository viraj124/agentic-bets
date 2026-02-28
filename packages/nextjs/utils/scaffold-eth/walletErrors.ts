import { getParsedError } from "./getParsedError";

const USER_REJECTED_PATTERNS = [
  "user rejected",
  "user denied",
  "request rejected",
  "request was rejected",
  "action_rejected",
  "rejected the request",
  "denied transaction signature",
];

const WRONG_NETWORK_PATTERNS = [
  "wrong network",
  "switch to",
  "chain mismatch",
  "chainid mismatch",
  "unsupported chain",
  "network does not support",
];

function flattenErrorMessages(error: any): string {
  const seen = new Set<any>();
  const queue: any[] = [error];
  const parts: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === "string") {
      parts.push(current);
      continue;
    }

    if (typeof current?.message === "string") parts.push(current.message);
    if (typeof current?.shortMessage === "string") parts.push(current.shortMessage);
    if (typeof current?.details === "string") parts.push(current.details);

    if (current?.cause) queue.push(current.cause);
    if (current?.error) queue.push(current.error);
    if (current?.data) queue.push(current.data);
    if (typeof current?.walk === "function") {
      try {
        queue.push(current.walk());
      } catch {
        // ignore walk failures
      }
    }
  }

  return parts.join(" ").toLowerCase();
}

function extractErrorCode(error: any): unknown {
  const parsed = error?.walk ? error.walk() : error;
  return parsed?.code ?? parsed?.cause?.code ?? parsed?.error?.code ?? parsed?.data?.code;
}

export function isUserRejectedRequestError(error: any): boolean {
  const code = extractErrorCode(error);
  if (code === 4001 || code === "ACTION_REJECTED") return true;

  const message = flattenErrorMessages(error);
  return USER_REJECTED_PATTERNS.some(pattern => message.includes(pattern));
}

export function isWrongNetworkError(error: any): boolean {
  const code = extractErrorCode(error);
  if (code === 4902) return true;

  const message = flattenErrorMessages(error);
  return WRONG_NETWORK_PATTERNS.some(pattern => message.includes(pattern));
}

export function getWalletActionErrorMessage(
  error: any,
  options?: {
    actionLabel?: string;
    networkName?: string;
    fallback?: string;
  },
): string {
  const actionLabel = options?.actionLabel ?? "Action";
  const networkName = options?.networkName ?? "the supported network";
  const fallback = options?.fallback ?? "Request failed";

  if (isUserRejectedRequestError(error)) {
    return `${actionLabel} cancelled in wallet`;
  }

  if (isWrongNetworkError(error)) {
    return `Wrong network. Please switch to ${networkName}`;
  }

  const parsed = getParsedError(error);
  return parsed || fallback;
}
