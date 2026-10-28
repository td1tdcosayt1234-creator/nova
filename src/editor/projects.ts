/* ============ Nova Engine — Projects store (localStorage-backed) ============ */

export interface NovaProject {
  id: string
  name: string
  mode: '2d' | '3d'
  updated: number
  scene: string   // serialized scene JSON
}

const KEY = 'nova.projects.v1'
const MAX_PROJECTS = 40

function uid(): string {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function listProjects(): NovaProject[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(p => p && typeof p.id === 'string')
  } catch {
    return []
  }
}

function writeAll(list: NovaProject[]) {
  // newest first, capped
  list.sort((a, b) => (b.updated || 0) - (a.updated || 0))
  if (list.length > MAX_PROJECTS) list.length = MAX_PROJECTS
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('[projects] storage full / failed:', err)
  }
}

export function getProject(id: string): NovaProject | null {
  return listProjects().find(p => p.id === id) || null
}

export function createProject(name: string, mode: '2d' | '3d', sceneJSON: string): NovaProject {
  const p: NovaProject = { id: uid(), name: name || 'Untitled', mode, updated: Date.now(), scene: sceneJSON }
  const all = listProjects()
  all.push(p)
  writeAll(all)
  return p
}

/** create or update by id */
export function saveProjectEntry(id: string, name: string, mode: '2d' | '3d', scene: string) {
  const all = listProjects()
  const found = all.find(p => p.id === id)
  if (found) {
    found.name = name
    found.mode = mode
    found.updated = Date.now()
    found.scene = scene
  } else {
    all.push({ id, name, mode, updated: Date.now(), scene })
  }
  writeAll(all)
}

export function renameProject(id: string, name: string) {
  const all = listProjects()
  const p = all.find(x => x.id === id)
  if (p) { p.name = name.trim() || p.name; p.updated = Date.now(); writeAll(all) }
}

export function duplicateProject(id: string): NovaProject | null {
  const src = getProject(id)
  if (!src) return null
  const copy: NovaProject = { ...src, id: uid(), name: src.name + ' copy', updated: Date.now() }
  const all = listProjects()
  all.push(copy)
  writeAll(all)
  return copy
}

export function deleteProject(id: string) {
  writeAll(listProjects().filter(p => p.id !== id))
}

export function entityCount(sceneJSON: string): number {
  try {
    const s = JSON.parse(sceneJSON)
    return Array.isArray(s?.entities) ? s.entities.length : 0
  } catch {
    return 0
  }
}
