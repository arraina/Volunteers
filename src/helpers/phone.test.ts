import { normalizePhoneNumber, validatePhoneNumber } from './phone';

describe('phone number validation', () => {
  test('normalizes common US numbers to E.164', () => {
    expect(normalizePhoneNumber('(973) 555-1212', true)).toBe('+19735551212');
  });

  test('accepts an international E.164 number', () => {
    expect(normalizePhoneNumber('+44 20 7946 0958', true)).toBe('+442079460958');
  });

  test('rejects missing required and malformed numbers', () => {
    expect(() => normalizePhoneNumber('', true)).toThrow('Phone number is required');
    expect(validatePhoneNumber('123').valid).toBe(false);
  });
});
