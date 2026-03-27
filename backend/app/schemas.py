from datetime import datetime
from enum import Enum

from pydantic import BaseModel


# --- Enums ---

class NodeType(str, Enum):
    item = "item"
    section = "section"


class Priority(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Permission(str, Enum):
    read = "read"
    write = "write"


# --- Users ---

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None = None
    created_at: str


# --- API Tokens ---

class TokenCreate(BaseModel):
    name: str


class TokenOut(BaseModel):
    id: str
    name: str
    created_at: str
    last_used_at: str | None = None


class TokenCreateOut(TokenOut):
    token: str  # only returned on creation


# --- Auth ---

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Lists ---

class ListCreate(BaseModel):
    title: str


class ListUpdate(BaseModel):
    title: str | None = None


class ListOut(BaseModel):
    id: str
    owner_id: str
    owner_email: str | None = None
    title: str
    archived: bool
    created_at: str
    updated_at: str


class MatchingNode(BaseModel):
    id: str
    type: str
    text: str
    notes: str | None = None


class ListSearchOut(ListOut):
    matching_nodes: list[MatchingNode] = []


class ListSettings(BaseModel):
    auto_archive_enabled: bool = False
    auto_archive_minutes: int = 60


class ListSettingsUpdate(BaseModel):
    auto_archive_enabled: bool | None = None
    auto_archive_minutes: int | None = None


class AutocompleteSuggestion(BaseModel):
    text: str
    frequency: int


# --- Nodes ---

class NodeCreate(BaseModel):
    type: NodeType
    text: str = ""
    parent_id: str | None = None
    after_id: str | None = None  # insert after this sibling; None = end
    at_beginning: bool = False  # insert as first child (before all siblings)
    checked: bool = False
    notes: str | None = None
    priority: Priority | None = None
    due_date: str | None = None


class NodeUpdate(BaseModel):
    text: str | None = None
    checked: bool | None = None
    notes: str | None = None
    priority: Priority | None = None
    due_date: str | None = None
    pinned: bool | None = None


class NodeMove(BaseModel):
    parent_id: str | None = None  # new parent (None = root)
    after_id: str | None = None   # insert after this sibling; None = end
    at_beginning: bool = False    # insert as first child (before all siblings)


class NodeOut(BaseModel):
    id: str
    list_id: str
    parent_id: str | None = None
    type: NodeType
    text: str
    checked: bool
    checked_at: str | None = None
    notes: str | None = None
    priority: Priority | None = None
    due_date: str | None = None
    position: float
    pinned: bool = False
    archived: bool = False
    created_at: str
    updated_at: str


# --- Sharing ---

class ShareCreate(BaseModel):
    permission: Permission = Permission.read
    invited_email: str | None = None


class ShareOut(BaseModel):
    id: str
    list_id: str
    user_id: str | None = None
    user_email: str | None = None
    invited_email: str | None = None
    share_token: str
    permission: Permission
    created_at: str


class ShareClaimOut(BaseModel):
    list_id: str
    permission: Permission


# --- Attachments ---

class AttachmentOut(BaseModel):
    id: str
    node_id: str
    list_id: str
    filename: str
    mime_type: str
    size: int
    created_at: str
    url: str


# --- Import ---

class SectionSearchResult(BaseModel):
    id: str
    text: str
    list_id: str
    list_title: str


# --- Import ---

class ImportNode(BaseModel):
    type: NodeType = NodeType.item
    text: str = ""
    checked: bool = False
    notes: str | None = None
    priority: Priority | None = None
    due_date: str | None = None
    children: list["ImportNode"] = []


ImportNode.model_rebuild()


class ImportRequest(BaseModel):
    nodes: list[ImportNode]
