const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize common US formatting and validate international E.164 structure.
 * This validates and stores a consistent phone format. Successful reminder
 * delivery is the practical reachability check because SMS Auth is not used.
 */
export function normalizePhoneNumber(value: string, required = false): string {
  const input = value.trim();
  if (!input) {
    if (required) throw new Error('Phone number is required.');
    return '';
  }

  const hasLeadingPlus = input.startsWith('+');
  const digits = input.replace(/\D/g, '');
  let normalized = hasLeadingPlus ? `+${digits}` : '';

  if (!hasLeadingPlus && digits.length === 10) normalized = `+1${digits}`;
  if (!hasLeadingPlus && digits.length === 11 && digits.startsWith('1')) {
    normalized = `+${digits}`;
  }

  if (!E164_PATTERN.test(normalized)) {
    throw new Error('Enter a valid phone number, including country code for non-US numbers.');
  }

  return normalized;
}

export interface PhoneValidation {
  valid: boolean;
  normalized: string;
  message: string;
}

/** Non-throwing validation result for live form feedback. */
export function validatePhoneNumber(value: string, required = true): PhoneValidation {
  try {
    const normalized = normalizePhoneNumber(value, required);
    return {
      valid: Boolean(normalized) || !required,
      normalized,
      message: normalized ? `Valid phone format: ${normalized}` : '',
    };
  } catch (error) {
    return {
      valid: false,
      normalized: '',
      message: error instanceof Error ? error.message : 'Enter a valid phone number.',
    };
  }
}
