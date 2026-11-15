/** Refresh activity without overlapping requests; cancellation finishes before clearing it. */
export function keepTyping(send: (status: 1 | 2, signal?: AbortSignal) => Promise<void>, interval = 5000) {
  const abort = new AbortController()
  let pending: Promise<void> | undefined
  const refresh = () => {
    if (pending || abort.signal.aborted) return
    pending = send(1, abort.signal)
      .catch(() => {})
      .finally(() => {
        pending = undefined
      })
  }
  refresh()
  const timer = setInterval(refresh, interval)
  return async () => {
    clearInterval(timer)
    abort.abort()
    await pending
    await send(2).catch(() => {})
  }
}
