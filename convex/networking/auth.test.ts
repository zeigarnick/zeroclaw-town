import { ConvexError } from 'convex/values';
import {
  assertAgentStatusIsClaimed,
  formatClaimUrl,
  generateApiKey,
  generateClaimToken,
  generateVerificationCode,
  getKeyPrefix,
  hashSecret,
} from './auth';

describe('networking auth helpers', () => {
  test('generates one-time plaintext credentials with stable public prefixes', () => {
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();

    expect(apiKey).toMatch(/^town_[A-Za-z0-9_-]+$/);
    expect(claimToken).toMatch(/^town_claim_[A-Za-z0-9_-]+$/);
    expect(verificationCode).toMatch(/^town-[A-Z2-9]{6}$/);
    expect(getKeyPrefix(apiKey)).toBe(apiKey.slice(0, 12));
  });

  test('hashes secrets without preserving plaintext', async () => {
    const first = await hashSecret('town_secret');
    const second = await hashSecret('town_secret');
    const different = await hashSecret('town_other_secret');

    expect(new Uint8Array(first)).toEqual(new Uint8Array(second));
    expect(new Uint8Array(first)).not.toEqual(new Uint8Array(different));
    expect(Buffer.from(first).toString('utf8')).not.toContain('town_secret');
  });

  test('rejects pending agents with a stable Convex error code', () => {
    expect(() => assertAgentStatusIsClaimed({ status: 'pending_claim' } as any)).toThrow(
      ConvexError,
    );

    try {
      assertAgentStatusIsClaimed({ status: 'pending_claim' } as any);
      throw new Error('expected pending agent assertion to throw');
    } catch (error) {
      expect((error as ConvexError<{ code: string }>).data.code).toBe('pending_claim');
    }
  });

  test('formats claim URLs without duplicate separators', () => {
    expect(formatClaimUrl('https://town.example/claim/', 'town_claim_abc')).toBe(
      'https://town.example/claim/town_claim_abc',
    );
    expect(formatClaimUrl('https://town.example/claim', 'town_claim_abc')).toBe(
      'https://town.example/claim/town_claim_abc',
    );
  });
});
