"""Centralized sensitive data sanitization and redaction utility.

Protects against accidental exposure of secrets, API keys, bearer tokens,
passwords, and authorization headers in traces, failure evidence, SSE events,
and logs without destroying useful agent testing evidence.
"""
from __future__ import annotations

import re
from typing import Any

# Sensitive key names in arguments, configuration, headers, and metadata
SENSITIVE_KEY_PATTERNS = {
    "api_key",
    "apikey",
    "authorization",
    "auth_token",
    "access_token",
    "bearer",
    "password",
    "passwd",
    "secret",
    "private_key",
    "client_secret",
    "token",
}

# Regex patterns matching common credential formats
CREDENTIAL_REGEXES = [
    # Bearer tokens: "Bearer <token>"
    (re.compile(r"(bearer\s+)[A-Za-z0-9_\-\.]{8,}", re.IGNORECASE), r"\1[REDACTED_TOKEN]"),
    # Basic auth: "Basic <base64>"
    (re.compile(r"(basic\s+)[A-Za-z0-9+/=]{8,}", re.IGNORECASE), r"\1[REDACTED_AUTH]"),
    # Common API key formats: sk-..., AIza..., etc.
    (re.compile(r"\b(?:sk|AIza)[A-Za-z0-9_\-]{16,}\b", re.IGNORECASE), "[REDACTED_API_KEY]"),
    # Standard password/secret assignment patterns in text: password=..., api_key=...
    (
        re.compile(r"(password|api_key|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-\.!@#$%^&*]{6,}['\"]?", re.IGNORECASE),
        r"\1=[REDACTED]",
    ),
]


def sanitize_text(text: str | None) -> str:
    """Redact embedded credentials and tokens from a string while preserving message content."""
    if not text:
        return text or ""
    sanitized = text
    for pattern, replacement in CREDENTIAL_REGEXES:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def is_sensitive_key(key: str) -> bool:
    """Check if a dictionary key name represents sensitive credentials."""
    lowered = key.lower().replace("-", "_").replace(" ", "_")
    return any(sens in lowered for sens in SENSITIVE_KEY_PATTERNS)


def sanitize_value(val: Any) -> Any:
    """Recursively sanitize any arbitrary value (dict, list, str, etc.)."""
    if isinstance(val, str):
        return sanitize_text(val)
    if isinstance(val, dict):
        return sanitize_dict(val)
    if isinstance(val, list):
        return [sanitize_value(item) for item in val]
    if isinstance(val, tuple):
        return tuple(sanitize_value(item) for item in val)
    return val


def sanitize_dict(d: dict[str, Any] | None) -> dict[str, Any]:
    """Sanitize a dictionary by redacting sensitive keys and sanitizing nested strings/dicts."""
    if not d:
        return {}
    clean: dict[str, Any] = {}
    for k, v in d.items():
        if is_sensitive_key(k):
            clean[k] = "[REDACTED]"
        else:
            clean[k] = sanitize_value(v)
    return clean


def sanitize_headers(headers: dict[str, str] | None) -> dict[str, str]:
    """Sanitize HTTP request/response headers."""
    if not headers:
        return {}
    clean: dict[str, str] = {}
    for k, v in headers.items():
        if is_sensitive_key(k):
            clean[k] = "[REDACTED]"
        else:
            clean[k] = sanitize_text(v)
    return clean
