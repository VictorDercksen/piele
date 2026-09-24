from fastapi import Request

from app.config import Settings


def settings_dependency(request: Request) -> Settings:
    return request.app.state.settings
