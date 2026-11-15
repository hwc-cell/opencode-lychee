/** Split at paragraph/line/word boundaries without losing text or cutting emoji pairs. */
export function chunkText(text: string, limit = 2000): string[] {
  if (!Number.isInteger(limit) || limit < 2) throw new RangeError("Message limit must be an integer of at least 2")
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit)
    if (cut <= 0) cut = rest.lastIndexOf("\n", limit)
    if (cut <= 0) cut = rest.lastIndexOf(" ", limit)
    if (cut <= 0) cut = limit
    const before = rest.charCodeAt(cut - 1)
    const after = rest.charCodeAt(cut)
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) cut--
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  chunks.push(rest)
  return chunks
}

/** Apply the channel limit to every reply, including commands and permission notices. */
export async function sendChunked(text: string, send: (text: string) => Promise<void>, limit = 2000) {
  let reserve = 0
  for (;;) {
    const chunks = chunkText(text, limit - reserve)
    const required = chunks.length > 1 ? String(chunks.length).length * 2 + 4 : 0
    if (required > reserve) {
      reserve = required
      continue
    }
    for (const [index, chunk] of chunks.entries()) {
      await send(chunks.length > 1 ? `(${index + 1}/${chunks.length}) ${chunk}` : chunk)
    }
    return
  }
}
