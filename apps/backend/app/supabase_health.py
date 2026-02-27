from collections.abc import Mapping
from typing import Any

from supabase import create_client

from app.config import get_settings


def check_supabase_db_connection() -> Mapping[str, Any]:
    settings = get_settings()
    api_key = settings.supabase_service_role_key or settings.supabase_anon_key

    if not settings.supabase_url or not api_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required"
        )

    client = create_client(settings.supabase_url, api_key)
    response = client.table("users").select("id", count="exact").limit(1).execute()

    return {
        "checked_table": "users",
        "row_count": len(response.data or []),
        "total_count": response.count,
    }
