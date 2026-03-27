import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.lists.service import get_accessible_list
from app.schemas import ShareClaimOut, ShareCreate, ShareOut
from app.sharing.service import claim_share, create_share_link, get_shares, revoke_share

router = APIRouter(tags=["sharing"])


@router.post(
    "/lists/{list_id}/shares",
    response_model=ShareOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_share(
    list_id: str,
    body: ShareCreate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst or lst["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can create share links")
    share = await create_share_link(db, list_id, body.permission.value, body.invited_email)
    return ShareOut(**share)


@router.get("/lists/{list_id}/shares", response_model=list[ShareOut])
async def list_shares(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    shares = await get_shares(db, list_id)
    return [ShareOut(**s) for s in shares]


@router.delete("/lists/{list_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    list_id: str,
    share_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst or lst["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can revoke shares")
    if not await revoke_share(db, share_id, list_id):
        raise HTTPException(status_code=404, detail="Share not found")


@router.post("/shares/claim/{share_token}", response_model=ShareClaimOut)
async def claim(
    share_token: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    result = await claim_share(db, share_token, user["id"])
    if not result:
        raise HTTPException(status_code=404, detail="Invalid share link")
    return ShareClaimOut(list_id=result["list_id"], permission=result["permission"])
