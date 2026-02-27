"""Supabase 接続ヘルスチェック用サービスと補助関数。"""

from collections.abc import Mapping
from typing import Any

from supabase import create_client

from app.config import get_settings


def check_supabase_db_connection() -> Mapping[str, Any]:
    """`users` テーブルの最小クエリを実行し、DB 疎通を確認する。"""

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


class SupabaseHealthService:
    """Supabase DB ヘルスチェック用のサービスオブジェクト。"""

    def check(self) -> Mapping[str, Any]:
        """DB 疎通確認を実行し、正規化した payload を返す。"""

        return check_supabase_db_connection()


def get_supabase_health_service() -> SupabaseHealthService:
    """FastAPI 依存性注入向けのヘルスサービスインスタンスを返す。"""

    return SupabaseHealthService()
