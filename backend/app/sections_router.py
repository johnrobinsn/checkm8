import aiosqlite
from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.nodes.service import resolve_section, search_sections
from app.schemas import SectionSearchResult

router = APIRouter(prefix="/sections", tags=["sections"])


@router.get("/search", response_model=list[SectionSearchResult])
async def search(
    q: str = "",
    list_id: str | None = None,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not q.strip():
        return []
    results = await search_sections(db, user["id"], q.strip(), current_list_id=list_id)
    return [SectionSearchResult(**r) for r in results]


@router.get("/resolve")
async def resolve(
    name: str,
    list: str | None = None,
    current_list_id: str | None = None,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    result = await resolve_section(db, user["id"], name, list_title=list, current_list_id=current_list_id)
    if not result:
        raise HTTPException(status_code=404, detail="Section not found")
    return result
