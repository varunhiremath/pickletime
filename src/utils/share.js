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

/**
 * Hand a file — in practice a PNG of the bracket — to the share sheet.
 *
 * Kept separate from shareText() rather than folded into it, because iOS
 * quietly drops the `text` field when files are attached. Sharing both at once
 * would silently lose the results message on half the club's phones, so the app
 * offers the two as two buttons and each one does exactly what it says.
 *
 * @returns 'shared' | 'dismissed' | 'downloaded' | 'failed'
 */
export async function shareFile(file, { title } = {}) {
  if (!file) return 'failed';

  const nav = typeof navigator === 'undefined' ? null : navigator;
  // canShare({files}) is the only honest test. `navigator.share` existing says
  // nothing about whether this device will accept an attachment.
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'dismissed';
    }
  }

  return download(file);
}

/** Desktop's answer to a share sheet: put it in the downloads folder. */
function download(file) {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'bracket.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on a timeout rather than immediately: Safari has not necessarily
    // started reading the blob by the time click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
