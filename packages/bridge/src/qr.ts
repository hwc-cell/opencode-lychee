export async function qrTerminal(input: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qr = (await import("qrcode")) as unknown as { default: { toString(input: string, opts: unknown): Promise<string> } }
  return qr.default.toString(input, { type: "terminal", small: true })
}
