"""Supabase Storage grants for private evidence videos (plan section 7).

The service key stays server-side. The API issues a narrowly scoped upload grant for a
path it reserved, the browser uploads directly, and the API checks the stored object
before a submission is published. Playback uses short-lived signed URLs.

The Storage REST shapes below follow the public API reference and are not yet verified
against a live bucket; see the handoff.
"""

from dataclasses import dataclass
from typing import Any, Protocol

import httpx


class StorageError(Exception):
    """Storage refused or is unreachable. The message is safe to show."""


@dataclass(frozen=True)
class SignedUpload:
    token: str


@dataclass(frozen=True)
class StoredObject:
    size_bytes: int | None
    content_type: str | None


class Storage(Protocol):
    bucket: str

    def create_signed_upload(self, path: str) -> SignedUpload: ...

    def stored_object(self, path: str) -> StoredObject | None: ...

    def signed_url(self, path: str, expires_in_seconds: int) -> str: ...


class SupabaseStorage:
    def __init__(self, supabase_url: str, service_key: str, bucket: str, timeout: float) -> None:
        self.bucket = bucket
        self._base = f"{supabase_url.rstrip('/')}/storage/v1"
        self._headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
        self._timeout = timeout

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            return httpx.request(
                method, f"{self._base}{path}", headers=self._headers, timeout=self._timeout, **kwargs
            )
        except httpx.HTTPError as exc:
            raise StorageError("Evidence storage is unavailable.") from exc

    def create_signed_upload(self, path: str) -> SignedUpload:
        response = self._request("POST", f"/object/upload/sign/{self.bucket}/{path}")
        if response.status_code != 200:
            raise StorageError("Evidence storage refused the upload grant.")
        token = response.json().get("token")
        if not isinstance(token, str) or not token:
            raise StorageError("Evidence storage returned no upload token.")
        return SignedUpload(token)

    def stored_object(self, path: str) -> StoredObject | None:
        response = self._request("GET", f"/object/info/{self.bucket}/{path}")
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise StorageError("Evidence storage could not describe the upload.")
        body = response.json()
        metadata = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
        size = body.get("size", metadata.get("size"))
        content_type = body.get("contentType") or body.get("content_type") or metadata.get("mimetype")
        return StoredObject(
            size_bytes=int(size) if isinstance(size, (int, float, str)) and str(size).isdigit() else None,
            content_type=content_type if isinstance(content_type, str) else None,
        )

    def signed_url(self, path: str, expires_in_seconds: int) -> str:
        response = self._request(
            "POST", f"/object/sign/{self.bucket}/{path}", json={"expiresIn": expires_in_seconds}
        )
        if response.status_code != 200:
            raise StorageError("Evidence storage could not sign the video.")
        signed = response.json().get("signedURL")
        if not isinstance(signed, str) or not signed:
            raise StorageError("Evidence storage returned no playback URL.")
        return f"{self._base}{signed}" if signed.startswith("/") else signed


class UnconfiguredStorage:
    bucket = ""

    def create_signed_upload(self, path: str) -> SignedUpload:
        raise StorageError("Evidence storage is not configured.")

    def stored_object(self, path: str) -> StoredObject | None:
        raise StorageError("Evidence storage is not configured.")

    def signed_url(self, path: str, expires_in_seconds: int) -> str:
        raise StorageError("Evidence storage is not configured.")
