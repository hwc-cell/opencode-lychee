import type { WeixinState } from "./state"

export function currentDirectory(state: WeixinState, key: string, defaultDir: string) {
  return state.conversations?.[key]?.directory ?? state.workDir ?? defaultDir
}

export function rememberSession(state: WeixinState, key: string, defaultDir: string, id: string, handoff = false) {
  const conversation = snapshot(state, key, defaultDir)
  const project = conversation.projects[conversation.directory]
  project.sessionID = id
  project.sessions = [id, ...project.sessions.filter((session) => session !== id)]
  if (handoff) project.handoffs = [...new Set([...(project.handoffs ?? []), id])]
  save(state, key, conversation)
}

export function isHandoffSession(state: WeixinState, key: string, defaultDir: string, id: string | undefined) {
  if (!id) return false
  const directory = currentDirectory(state, key, defaultDir)
  return state.conversations?.[key]?.projects[directory]?.handoffs?.includes(id) ?? false
}

export function clearCurrentSession(state: WeixinState, key: string, defaultDir: string) {
  const conversation = snapshot(state, key, defaultDir)
  const project = conversation.projects[conversation.directory]
  const previous = project.sessionID
  delete project.sessionID
  save(state, key, conversation)
  return previous
}

export function switchProject(state: WeixinState, key: string, defaultDir: string, directory: string) {
  const conversation = snapshot(state, key, defaultDir)
  const previousSessionID = conversation.projects[conversation.directory].sessionID
  const changed = directory !== conversation.directory
  conversation.directory = directory
  conversation.projects[directory] ??= { sessions: [] }
  save(state, key, conversation)
  return { changed, previousSessionID, sessionID: conversation.projects[directory].sessionID }
}

export function listProjects(state: WeixinState, key: string, defaultDir: string) {
  const conversation = snapshot(state, key, defaultDir)
  return Object.entries(conversation.projects).map(([directory, project]) => ({
    directory,
    active: directory === conversation.directory,
    sessionID: project.sessionID,
  }))
}

export function listSessions(state: WeixinState, key: string, defaultDir: string) {
  const conversation = snapshot(state, key, defaultDir)
  const project = conversation.projects[conversation.directory]
  return project.sessions.map((id) => ({ id, current: id === project.sessionID }))
}

export function switchSession(state: WeixinState, key: string, defaultDir: string, id: string) {
  const conversation = snapshot(state, key, defaultDir)
  const project = conversation.projects[conversation.directory]
  const previousSessionID = project.sessionID
  if (!project.sessions.includes(id)) return { ok: false, changed: false, previousSessionID }
  project.sessionID = id
  save(state, key, conversation)
  return { ok: true, changed: id !== previousSessionID, previousSessionID, sessionID: id }
}

// Lazily adopt the old global-directory/current-session shape without changing other chats.
function snapshot(state: WeixinState, key: string, defaultDir: string) {
  const directory = currentDirectory(state, key, defaultDir)
  const projects = { ...state.conversations?.[key]?.projects }
  const project = projects[directory]
  const sessionID = state.sessions?.[key] ?? project?.sessionID
  projects[directory] = {
    ...project,
    ...(sessionID ? { sessionID } : {}),
    sessions: [...new Set([...(sessionID ? [sessionID] : []), ...(project?.sessions ?? [])])],
  }
  return { directory, projects }
}

function save(state: WeixinState, key: string, conversation: NonNullable<WeixinState["conversations"]>[string]) {
  state.conversations ??= {}
  state.conversations[key] = conversation
  state.sessions ??= {}
  const id = conversation.projects[conversation.directory].sessionID
  if (id) state.sessions[key] = id
  if (!id) delete state.sessions[key]
}
