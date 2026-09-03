// Handing a block of text to whatever the device uses for sharing.
//
// Extracted because there were three near-identical copies of this (the invite,
// the session announcement, and now the results) and the differences between
// them were accidental rather than meaningful.
//
// Two paths, deliberately:
//   - navigator.share opens the OS share sheet. This is the one that matters —
//     it puts the message straight into WhatsApp with no copy-paste step, which
//     is how these actually reach the group.
//   - Everywhere else (most desktops, and any non-secure context) falls back to
//     the clipboard.
//
// A dismissed share sheet is not an error. The user tapped share, saw the sheet,
// and changed their mind; telling them "sharing failed" would be a lie.

/**
 * @returns 'shared' | 'copied' | 'dismissed' | 'failed'
 */
export async function shareText(text) {
  if (!text) return 'failed';

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      // AbortError is the user closing the sheet. Anything else — no permission,
      // an unsupported payload — is worth falling back to the clipboard for
      // rather than leaving them with nothing.
      if (err?.name === 'AbortError') return 'dismissed';
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
