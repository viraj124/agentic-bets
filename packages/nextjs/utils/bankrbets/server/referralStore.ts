import "server-only";

export interface ReferralRecord {
  referrer: string;
  referee: string;
  createdAt: number;
}

// In-memory store — persists across requests in the same server process.
// For production durability across deploys, swap to Vercel KV or a DB.
const referrals = new Map<string, ReferralRecord>(); // key = referee address (lowercase)

export function registerReferral(referee: string, referrer: string): { success: boolean; message: string } {
  const refereeLower = referee.toLowerCase();
  const referrerLower = referrer.toLowerCase();

  if (refereeLower === referrerLower) {
    return { success: false, message: "Cannot refer yourself" };
  }

  // First-referrer-wins: once set, never overwritten
  if (referrals.has(refereeLower)) {
    return { success: false, message: "Already referred" };
  }

  referrals.set(refereeLower, {
    referrer: referrerLower,
    referee: refereeLower,
    createdAt: Date.now(),
  });

  return { success: true, message: "Referral registered" };
}

export function getReferrer(referee: string): string | null {
  return referrals.get(referee.toLowerCase())?.referrer ?? null;
}

export function getReferralsByReferrer(referrer: string): ReferralRecord[] {
  const referrerLower = referrer.toLowerCase();
  return Array.from(referrals.values()).filter(r => r.referrer === referrerLower);
}

export function getAllReferrals(): ReferralRecord[] {
  return Array.from(referrals.values());
}
