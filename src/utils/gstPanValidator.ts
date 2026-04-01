// utils/gstPanValidator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Validates Indian GST numbers and PAN numbers by FORMAT only.
// No external API call — if the format matches, it is valid and will be saved.
//
// GST Format (15 chars): 22AAAAA0000A1Z5
//  Pos 1–2   : State Code            e.g. "22"
//  Pos 3–7   : First 5 letters of PAN e.g. "AAAAA"
//  Pos 8–11  : Next 4 digits of PAN   e.g. "0000"
//  Pos 12    : Last letter of PAN     e.g. "A"
//  Pos 13    : Entity number (0–9/A–Z) e.g. "1"
//  Pos 14    : Always 'Z'
//  Pos 15    : Check digit (0–9/A–Z)  e.g. "5"
//
// PAN Format (10 chars): AAAAA0000A
//  Pos 1–5   : 5 uppercase letters
//  Pos 6–9   : 4 digits
//  Pos 10    : 1 uppercase letter
// ─────────────────────────────────────────────────────────────────────────────

export const validateGST = (gst: string): boolean => {
  if (!gst || !gst.trim()) return false;

  // Sanitize: trim spaces + force uppercase so "22aaaaa0000a1z5" also passes
  const cleaned = gst.trim().toUpperCase();

  // Must be exactly 15 characters
  if (cleaned.length !== 15) return false;

  // Official GST regex
  const gstRegex =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

  return gstRegex.test(cleaned);
};

export const validatePAN = (pan: string): boolean => {
  if (!pan || !pan.trim()) return false;

  // Sanitize: trim spaces + force uppercase
  const cleaned = pan.trim().toUpperCase();

  // Must be exactly 10 characters
  if (cleaned.length !== 10) return false;

  // Official PAN regex
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

  return panRegex.test(cleaned);
};
