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
 * Hand a picture — and the caption that goes with it — to the share sheet.
 *
 * The caption carries the link, which is the one thing a picture cannot: an
 * image posted on its own is a dead end for anyone who wants to open the app.
 *
 * Sent as one payload where the platform allows it. Android does, and puts both
 * into WhatsApp together. iOS is known to drop `text` when files are attached —
 * which is survivable rather than silent, because the link is also drawn into
 * the image's footer, so nothing is lost that the picture does not already say.
 *
 * Payloads are tried widest-first and each is offered to canShare() before it
 * is used: some platforms accept files, and accept text, but reject the two
 * together, and calling share() with a payload canShare() rejects throws.
 *
 * @returns 'shared' | 'dismissed' | 'downloaded' | 'failed'
 */
export async function shareFile(file, { title, text } = {}) {
  if (!file) return 'failed';

  const nav = typeof navigator === 'undefined' ? null : navigator;
  // canShare({files}) is the only honest test. `navigator.share` existing says
  // nothing about whether this device will accept an attachment.
  if (nav?.share && nav.canShare) {
    const payloads = [];
    if (text) payloads.push({ files: [file], text, title });
    payloads.push({ files: [file], title });

    for (const payload of payloads) {
      if (!nav.canShare(payload)) continue;
      try {
        await nav.share(payload);
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'dismissed';
        // A real failure on a payload the platform said it could take. Trying a
        // narrower one is unlikely to help, so fall through to the download.
        break;
      }
    }
  }

  const outcome = download(file);
  // The picture is in the downloads folder and the caption would otherwise be
  // gone, so put it somewhere it can still be pasted.
  if (outcome === 'downloaded' && text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Not fatal — the image still saved, and the link is drawn on it.
    }
  }
  return outcome;
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
