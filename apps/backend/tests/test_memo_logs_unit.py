"""memo_logs の純粋ロジックを検証する単体テスト。"""

from datetime import UTC, datetime

from app import memo_logs


def test_normalize_tags_removes_blank_and_duplicate_values() -> None:
    """タグ正規化は空文字と重複を除外し入力順を保持する。"""

    assert memo_logs._normalize_tags([" work ", "", "idea", "work", " deep "]) == [
        "work",
        "idea",
        "deep",
    ]


def test_parse_datetime_accepts_iso_zulu_timestamp() -> None:
    """Z付きUTCタイムスタンプを datetime へ変換できる。"""

    parsed = memo_logs._parse_datetime("2026-03-01T10:00:00Z")

    assert parsed == datetime(2026, 3, 1, 10, 0, tzinfo=UTC)


def test_parse_datetime_returns_current_utc_when_value_is_none(monkeypatch) -> None:
    """未指定時は現在UTCを採用する。"""

    frozen_now = datetime(2026, 3, 1, 9, 30, tzinfo=UTC)

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return frozen_now.replace(tzinfo=None)
            return frozen_now

    monkeypatch.setattr(memo_logs, "datetime", FrozenDatetime)

    assert memo_logs._parse_datetime(None) == frozen_now


def test_memo_to_out_maps_row_fields_and_tags() -> None:
    """DB行データを API 応答モデルへ正しく変換する。"""

    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "00000000-0000-0000-0000-000000000001",
        "title": "メモ",
        "body_md": "本文",
        "log_date": "2026-03-01",
        "related_session_id": None,
        "created_at": "2026-03-01T09:00:00Z",
        "updated_at": "2026-03-01T09:10:00Z",
    }

    out = memo_logs._memo_to_out(row=row, tags=["work", "idea"])

    assert str(out.id) == "11111111-1111-1111-1111-111111111111"
    assert out.tags == ["work", "idea"]
    assert out.created_at == datetime(2026, 3, 1, 9, 0, tzinfo=UTC)
    assert out.updated_at == datetime(2026, 3, 1, 9, 10, tzinfo=UTC)
