"""Paths, seasons and settings shared by the backtest scripts.

Importing this module puts apps/api on the import path, so the scripts use the API's own
state builder, Jev request, pick function and scoring.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RESULTS = ROOT / "results"
API = ROOT.parent / "apps" / "api"

if str(API) not in sys.path:
    sys.path.insert(0, str(API))

URC_GRAPHQL_URL = "https://www.unitedrugby.com/graphql"
HISTORICAL_FORECAST_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
USER_AGENT = "Piele/0.1 backtest"

# The feed's season ids and their labels. 2021/22 tunes the baselines only.
SEASONS = {
    "202101": "2021/22",
    "202201": "2022/23",
    "202301": "2023/24",
    "202401": "2024/25",
    "202501": "2025/26",
}
TUNING_SEASON = "202101"
REPORTED_SEASONS = tuple(s for s in SEASONS if s != TUNING_SEASON)


def load_env(path: Path = ROOT / ".env") -> None:
    """KEY=value lines from backtest/.env into the environment, without overriding it."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
