"""Kickoff-hour forecast from Open-Meteo (no key, non-commercial use).

Forecasts are requested only inside the week before kickoff. Earlier requests return
`too_early` without calling the provider, and past matches return `past`.
"""

from datetime import datetime, timedelta
from typing import Any

import httpx

from app.matchcentre.cache import Fetched
from app.competitions.base import Stadium

FORECAST_WINDOW = timedelta(days=7)
MATCH_LENGTH = timedelta(hours=2)
TTL = timedelta(hours=3)
HOURLY = (
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "wind_speed_10m",
    "wind_gusts_10m",
    "weather_code",
    "is_day",
)

# WMO weather interpretation codes used by Open-Meteo.
CONDITIONS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
}


def condition(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return CONDITIONS.get(code, "Unsettled")


def timing_status(kickoff: datetime, now: datetime) -> str | None:
    """`too_early` or `past` when no forecast applies, else None."""
    if now < kickoff - FORECAST_WINDOW:
        return "too_early"
    if now > kickoff + MATCH_LENGTH:
        return "past"
    return None


def fetch_forecast(
    client: httpx.Client, url: str, stadium: Stadium, kickoff: datetime
) -> Fetched:
    start = kickoff.date()
    end = (kickoff + MATCH_LENGTH).date()
    response = client.get(
        url,
        params={
            "latitude": stadium.latitude,
            "longitude": stadium.longitude,
            "hourly": ",".join(HOURLY),
            "timezone": "UTC",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "wind_speed_unit": "kmh",
        },
    )
    response.raise_for_status()
    hourly = response.json().get("hourly") or {}
    times: list[str] = hourly.get("time") or []
    index = _nearest_index(times, kickoff)
    if index is None:
        return Fetched("unavailable", {"reason": "no hourly data"}, timedelta(minutes=30))

    def value(name: str) -> Any:
        series = hourly.get(name) or []
        return series[index] if index < len(series) else None

    code = value("weather_code")
    is_day = value("is_day")
    payload = {
        "forecastHourUtc": times[index] + "Z",
        "stadium": stadium.name,
        "city": stadium.city,
        "temperatureC": value("temperature_2m"),
        "feelsLikeC": value("apparent_temperature"),
        "rainChancePercent": value("precipitation_probability"),
        "precipitationMm": value("precipitation"),
        "windKmh": value("wind_speed_10m"),
        "gustKmh": value("wind_gusts_10m"),
        "weatherCode": code,
        "condition": condition(int(code) if code is not None else None),
        "isDay": bool(is_day) if is_day is not None else None,
    }
    return Fetched("ok", payload, TTL)


def _nearest_index(times: list[str], target: datetime) -> int | None:
    best: tuple[float, int] | None = None
    for index, raw in enumerate(times):
        try:
            moment = datetime.fromisoformat(raw).replace(tzinfo=target.tzinfo)
        except ValueError:
            continue
        distance = abs((moment - target).total_seconds())
        if best is None or distance < best[0]:
            best = (distance, index)
    return best[1] if best else None
