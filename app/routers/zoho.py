"""
Zoho CRM Router — OAuth2 callback + CRM API proxy

Endpoints:
  GET  /connect    → Redirect user to Zoho OAuth2 consent page
  GET  /callback   → Handle Zoho OAuth2 callback with authorization code
  GET  /status     → Check Zoho CRM connection status
  GET  /leads      → Fetch leads from Zoho CRM
  GET  /deals      → Fetch deals from Zoho CRM
"""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.settings import Settings
from ..security import get_current_user
from ..services.zoho import zoho_service

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/connect")
async def zoho_connect(current_user: dict = Depends(get_current_user)):
    """Redirect the user to Zoho OAuth2 authorization page."""
    if not zoho_service.is_configured:
        raise HTTPException(status_code=400, detail="Zoho CRM credentials not configured in .env")

    auth_url = zoho_service.get_authorization_url()
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def zoho_callback(
    code: str = Query(None),
    error: str = Query(None),
    db: Session = Depends(get_db),
):
    """Handle Zoho OAuth2 callback — exchange code for tokens."""
    if error:
        log.error(f"Zoho OAuth2 error: {error}")
        # Redirect to settings page with error
        return RedirectResponse(url="/settings?zoho_error=" + error)

    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")

    try:
        tokens = await zoho_service.exchange_code_for_tokens(code)

        # Save tokens to DB
        existing = db.query(Settings).filter(Settings.key == "zoho_tokens").first()
        if existing:
            existing.value = json.dumps(tokens)
        else:
            new_setting = Settings(key="zoho_tokens", value=json.dumps(tokens))
            db.add(new_setting)

        db.commit()
        log.info("Zoho CRM tokens saved successfully")

        # Redirect to settings page with success
        return RedirectResponse(url="/settings?zoho_connected=true")

    except Exception as e:
        log.error(f"Zoho token exchange failed: {e}")
        return RedirectResponse(url="/settings?zoho_error=" + str(e))


@router.get("/status")
async def zoho_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Check Zoho CRM connection status."""
    return await zoho_service.get_connection_status(db)


@router.get("/leads")
async def zoho_leads(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Fetch leads from Zoho CRM."""
    try:
        return await zoho_service.get_leads(db, page, per_page)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/deals")
async def zoho_deals(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Fetch deals from Zoho CRM."""
    try:
        return await zoho_service.get_deals(db, page, per_page)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
