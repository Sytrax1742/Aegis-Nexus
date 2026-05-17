"""
Zoho CRM OAuth2 Integration Service

Handles:
  - OAuth2 Authorization Code flow (redirect-based)
  - Token storage in SQLite settings table
  - Auto-refresh of expired tokens
  - CRM API calls (Leads, Deals, Contacts)

Flow:
  1. User clicks "Connect Zoho" in Settings
  2. Backend redirects to Zoho authorization URL
  3. Zoho redirects back with authorization code
  4. Backend exchanges code for access + refresh tokens
  5. Tokens stored in DB, auto-refreshed when expired
"""

import os
import json
import logging
import time
from typing import Optional
import httpx

log = logging.getLogger(__name__)


class ZohoService:
    """Async Zoho CRM integration client."""

    AUTH_URL = "https://accounts.zoho.com/oauth/v2/auth"
    TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token"
    API_BASE = "https://www.zohoapis.com/crm/v2"

    def __init__(self):
        self.client_id = os.getenv("ZOHO_CLIENT_ID", "")
        self.client_secret = os.getenv("ZOHO_CLIENT_SECRET", "")
        self.redirect_uri = os.getenv("ZOHO_REDIRECT_URI", "http://localhost:8001/api/zoho/callback")
        self.scope = os.getenv("ZOHO_SCOPE", "ZohoCRM.modules.ALL,ZohoCRM.settings.ALL")

        if not self.client_id or not self.client_secret:
            log.warning("Zoho CRM credentials not configured. CRM integration disabled.")
        else:
            log.info("ZohoService initialized with client credentials")

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def get_authorization_url(self) -> str:
        """Generate the Zoho OAuth2 authorization URL for user consent."""
        if not self.is_configured:
            raise ValueError("Zoho CRM credentials not configured")

        return (
            f"{self.AUTH_URL}"
            f"?scope={self.scope}"
            f"&client_id={self.client_id}"
            f"&response_type=code"
            f"&access_type=offline"
            f"&redirect_uri={self.redirect_uri}"
            f"&prompt=consent"
        )

    async def exchange_code_for_tokens(self, code: str) -> dict:
        """Exchange the authorization code for access and refresh tokens."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": self.redirect_uri,
                    "code": code,
                },
            )

            if response.status_code != 200:
                log.error(f"Zoho token exchange failed: {response.text}")
                raise Exception(f"Token exchange failed: {response.text}")

            data = response.json()
            if "error" in data:
                raise Exception(f"Zoho error: {data['error']}")

            return {
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token", ""),
                "expires_in": data.get("expires_in", 3600),
                "token_type": data.get("token_type", "Bearer"),
                "obtained_at": int(time.time()),
            }

    async def refresh_access_token(self, refresh_token: str) -> dict:
        """Refresh an expired access token using the refresh token."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": refresh_token,
                },
            )

            if response.status_code != 200:
                log.error(f"Zoho token refresh failed: {response.text}")
                raise Exception(f"Token refresh failed: {response.text}")

            data = response.json()
            return {
                "access_token": data["access_token"],
                "expires_in": data.get("expires_in", 3600),
                "obtained_at": int(time.time()),
            }

    async def _get_valid_token(self, db_session) -> Optional[str]:
        """Get a valid access token, refreshing if necessary."""
        from ..models.settings import Settings

        token_record = db_session.query(Settings).filter(Settings.key == "zoho_tokens").first()
        if not token_record or not token_record.value:
            return None

        try:
            tokens = json.loads(token_record.value)
        except json.JSONDecodeError:
            return None

        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        obtained_at = tokens.get("obtained_at", 0)
        expires_in = tokens.get("expires_in", 3600)

        # Check if token is expired (with 5min buffer)
        if time.time() > obtained_at + expires_in - 300:
            if not refresh_token:
                return None

            try:
                new_tokens = await self.refresh_access_token(refresh_token)
                tokens["access_token"] = new_tokens["access_token"]
                tokens["obtained_at"] = new_tokens["obtained_at"]
                tokens["expires_in"] = new_tokens["expires_in"]
                token_record.value = json.dumps(tokens)
                db_session.commit()
                return new_tokens["access_token"]
            except Exception as e:
                log.error(f"Token refresh failed: {e}")
                return None

        return access_token

    async def api_call(self, method: str, endpoint: str, db_session, data: dict = None) -> dict:
        """Make an authenticated API call to Zoho CRM."""
        token = await self._get_valid_token(db_session)
        if not token:
            raise Exception("No valid Zoho CRM token. Please reconnect via Settings.")

        url = f"{self.API_BASE}/{endpoint}"
        headers = {
            "Authorization": f"Zoho-oauthtoken {token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            if method.upper() == "GET":
                response = await client.get(url, headers=headers)
            elif method.upper() == "POST":
                response = await client.post(url, headers=headers, json=data)
            elif method.upper() == "PUT":
                response = await client.put(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            if response.status_code not in (200, 201, 202):
                log.error(f"Zoho API error: {response.status_code} — {response.text}")
                raise Exception(f"Zoho API error: {response.text}")

            return response.json()

    async def create_lead(self, db_session, lead_data: dict) -> dict:
        """Create a new lead in Zoho CRM."""
        payload = {"data": [lead_data]}
        return await self.api_call("POST", "Leads", db_session, payload)

    async def create_deal(self, db_session, deal_data: dict) -> dict:
        """Create a new deal in Zoho CRM."""
        payload = {"data": [deal_data]}
        return await self.api_call("POST", "Deals", db_session, payload)

    async def get_leads(self, db_session, page: int = 1, per_page: int = 20) -> dict:
        """Fetch leads from Zoho CRM."""
        return await self.api_call("GET", f"Leads?page={page}&per_page={per_page}", db_session)

    async def get_deals(self, db_session, page: int = 1, per_page: int = 20) -> dict:
        """Fetch deals from Zoho CRM."""
        return await self.api_call("GET", f"Deals?page={page}&per_page={per_page}", db_session)

    async def get_connection_status(self, db_session) -> dict:
        """Check if Zoho CRM is connected and the token is valid."""
        from ..models.settings import Settings

        if not self.is_configured:
            return {"connected": False, "reason": "Zoho credentials not configured"}

        token_record = db_session.query(Settings).filter(Settings.key == "zoho_tokens").first()
        if not token_record or not token_record.value:
            return {"connected": False, "reason": "No tokens stored. Please authorize via Settings."}

        token = await self._get_valid_token(db_session)
        if not token:
            return {"connected": False, "reason": "Token expired and refresh failed."}

        return {"connected": True, "reason": "Connected to Zoho CRM"}


# Global instance
zoho_service = ZohoService()
