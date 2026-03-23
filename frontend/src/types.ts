export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface TodoList {
  id: string
  owner_id: string
  title: string
  archived: boolean
  created_at: string
  updated_at: string
  matching_nodes?: { id: string; type: string; text: string; notes: string | null }[]
}

export type NodeType = 'item' | 'section'
export type Priority = 'high' | 'medium' | 'low'
export type Permission = 'read' | 'write'

export interface NodeOut {
  id: string
  list_id: string
  parent_id: string | null
  type: NodeType
  text: string
  checked: boolean
  checked_at: string | null
  notes: string | null
  priority: Priority | null
  due_date: string | null
  position: number
  pinned: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export interface NodeCreate {
  type: NodeType
  text?: string
  parent_id?: string | null
  after_id?: string | null
  at_beginning?: boolean
  checked?: boolean
  notes?: string | null
  priority?: Priority | null
  due_date?: string | null
}

export interface NodeUpdate {
  text?: string
  checked?: boolean
  notes?: string | null
  priority?: Priority | null
  due_date?: string | null
  pinned?: boolean
}

export interface NodeMove {
  parent_id?: string | null
  after_id?: string | null
  at_beginning?: boolean
}

export interface Share {
  id: string
  list_id: string
  user_id: string | null
  share_token: string
  permission: Permission
  created_at: string
}

export interface SectionSearchResult {
  id: string
  text: string
  list_id: string
  list_title: string
}

export interface SectionResolveResult {
  section_id: string
  list_id: string
}

export interface Attachment {
  id: string
  node_id: string
  list_id: string
  filename: string
  mime_type: string
  size: number
  created_at: string
  url: string
}

export interface TreeNode extends NodeOut {
  children: TreeNode[]
  depth: number
}

export interface ListSettings {
  auto_archive_enabled: boolean
  auto_archive_minutes: number
}

export interface AutocompleteSuggestion {
  text: string
  frequency: number
}

// WebSocket message types
export type WsMessage =
  | { type: 'node_created'; node: NodeOut }
  | { type: 'node_updated'; node: NodeOut }
  | { type: 'node_moved'; node: NodeOut }
  | { type: 'node_deleted'; node_id: string }
  | { type: 'nodes_archived'; node_ids: string[] }
  | { type: 'presence'; users: PresenceUser[] }

export interface PresenceUser {
  id: string
  name: string
  avatar_url?: string | null
}
