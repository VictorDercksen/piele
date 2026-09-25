"""Bearer token check for the preview agent's /v1/agent routes.

The agent is a separate Vercel project with no database credentials and no league
membership. It presents one rotatable token (PIELE_AGENT_TOKEN), compared in constant
time. This is separate from Supabase member auth and grants no league context.
"""

import hmac

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


def agent_dependency(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    configured = request.app.state.settings.piele_agent_token
    expected = configured.get_secret_value() if configured else ""
    if not expected:
        raise HTTPException(
            status_code=503, detail={"code": "agent_unconfigured", "message": "Agent access is not configured."}
        )
    presented = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else ""
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail={"code": "invalid_agent_token", "message": "Invalid agent token."})
