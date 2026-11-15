import json
import os
import ssl
import time
import urllib.parse
import urllib.request

# Rango de simulación: 1 ciclo lunar completo (29.5+ días terrestres) en pasos de 1 hora
START_TIME = "2026-12-01 00:00"
STOP_TIME = "2026-12-31 00:00"
STEP_SIZE = "1h"
OUTPUT_FILE = os.path.join("data", "lunar_data.json")

SITES = [
    {
        "id": "shackleton-rim",
        "name": "Shackleton Crater Rim",
        "region": "South Pole - Artemis III Candidate",
        "lat": -89.78,
        "lon_360": 196.00,
        "lon_180": -164.00,
        "elevation_km": 1.34,
        # Elevación aproximada del horizonte cada 45° de acimut (0°=N, 45°=NE, ..., 315°=NO)
        "horizon_profile_deg": [4.12, -0.62, -0.82, -1.38, 2.82, 21.51, 29.48, 23.39],
        "notes": "Peak of near-eternal light bordering Shackleton PSR; extreme grazing solar angles."
    },
    {
        "id": "mons-mouton",
        "name": "Mons Mouton",
        "region": "South Pole - CLPS / VIPER Target",
        "lat": -84.60,
        "lon_360": 31.00,
        "lon_180": 31.00,
        "elevation_km": 5.04,
        "horizon_profile_deg": [2.82, 3.84, 6.00, 9.66, 9.03, 2.63, 1.25, 0.80],
        "notes": "Flat-topped massif rising ~6 km above surrounding terrain; wide DTE communication window."
    },
    {
        "id": "malapert-massif",
        "name": "Malapert Massif",
        "region": "South Pole - Artemis III Candidate",
        "lat": -86.00,
        "lon_360": 0.00,
        "lon_180": 0.00,
        "elevation_km": 4.8,
        "horizon_profile_deg": [7.24, 9.69, 5.37, -3.41, -9.10, -4.31, 1.33, 2.22],
        "notes": "Located on the 0 deg prime meridian; Earth remains persistently visible for DTE ops."
    },
    {
        "id": "haworth-rim",
        "name": "Haworth Crater Rim",
        "region": "South Pole - Artemis III Candidate",
        "lat": -87.45,
        "lon_360": 354.83,
        "lon_180": -5.17,
        "elevation_km": -3.31,
        "horizon_profile_deg": [9.80, 8.55, 4.42, 5.15, 8.92, 9.37, 8.62, 9.63],
        "notes": "Steep surrounding crater rims produce sharp shadow transitions and narrow DTE margins."
    },
    {
        "id": "nobile-rim-1",
        "name": "Nobile Rim 1",
        "region": "South Pole - Artemis III Candidate",
        "lat": -85.20,
        "lon_360": 55.00,
        "lon_180": 55.00,
        "elevation_km": 0.26,
        "horizon_profile_deg": [13.52, 6.37, 0.62, 1.28, 5.08, 8.55, 14.87, 16.16],
        "notes": "Favorable landing slopes (<10 deg) with balanced solar power and Earth visibility trade-offs."
    },
    {
        "id": "apollo-11",
        "name": "Apollo 11 (Statio Tranquillitatis)",
        "region": "Equatorial - Historical Baseline",
        "lat": 0.6741,
        "lon_360": 23.4730,
        "lon_180": 23.4730,
        "elevation_km": -1.93,
        "horizon_profile_deg": [2.69, 0.38, -0.25, 0.91, 2.65, 1.25, 1.46, 3.06],
        "notes": "Equatorial reference: ~14.8 Earth days of high-angle sunlight followed by ~14.8 days of night."
    }
]


def query_horizons(target_id: str, site: dict) -> dict:
    """Consulta la API de JPL Horizons para un cuerpo celeste ('10'=Sol, '399'=Tierra)."""
    base_url = "https://ssd.jpl.nasa.gov/api/horizons.api"
    site_coord = f"'{site['lon_360']},{site['lat']},{site['elevation_km']}'"

    params = {
        "format": "json",
        "COMMAND": f"'{target_id}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",       # Superficie lunar (cuerpo 301)
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": site_coord,
        "START_TIME": f"'{START_TIME}'",
        "STOP_TIME": f"'{STOP_TIME}'",
        "STEP_SIZE": f"'{STEP_SIZE}'",
        "QUANTITIES": "'4'",           # 4 = Acimut y Elevación aparentes
        "APPARENT": "'AIRLESS'",       # Sin refracción atmosférica (vacío lunar)
        "CSV_FORMAT": "'YES'"
    }

    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    ctx = ssl._create_unverified_context()

    with urllib.request.urlopen(url, context=ctx, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    raw_text = payload.get("result", "")
    if "$$SOE" not in raw_text or "$$EOE" not in raw_text:
        raise RuntimeError(f"Error en respuesta de Horizons para {site['name']}:\n{raw_text[:500]}")

    lines = raw_text.splitlines()
    soe_idx = lines.index("$$SOE")
    eoe_idx = lines.index("$$EOE")

    # Detectar dinámicamente las columnas de Acimut y Elevación en el encabezado
    header_line = ""
    for i in range(soe_idx - 1, max(0, soe_idx - 5), -1):
        if "Azi" in lines[i] and "Elev" in lines[i]:
            header_line = lines[i]
            break

    headers = [h.strip() for h in header_line.split(",")]
    az_col = next(i for i, h in enumerate(headers) if "Azi" in h)
    el_col = next(i for i, h in enumerate(headers) if "Elev" in h)

    records = {}
    for row in lines[soe_idx + 1 : eoe_idx]:
        if not row.strip():
            continue
        cols = [c.strip() for c in row.split(",")]
        timestamp = cols[0]
        records[timestamp] = {
            "az": round(float(cols[az_col]), 4),
            "el": round(float(cols[el_col]), 4)
        }

    return records


def main():
    os.makedirs("data", exist_ok=True)
    output_data = {
        "metadata": {
            "source": "NASA/JPL Horizons System API",
            "start_utc": START_TIME,
            "stop_utc": STOP_TIME,
            "step": STEP_SIZE,
            "refraction": "AIRLESS"
        },
        "sites": {}
    }

    for site in SITES:
        print(f"Descargando efemérides para {site['name']}...")
        sun_data = query_horizons("10", site)     # 10 = Sol
        time.sleep(0.4)
        earth_data = query_horizons("399", site)  # 399 = Tierra
        time.sleep(0.4)

        timeline = []
        for ts, sun_vals in sun_data.items():
            earth_vals = earth_data.get(ts, {"az": 0.0, "el": -90.0})
            timeline.append({
                "t": ts,
                "sun_az": sun_vals["az"],
                "sun_el": sun_vals["el"],
                "earth_az": earth_vals["az"],
                "earth_el": earth_vals["el"]
            })

        output_data["sites"][site["id"]] = {
            **site,
            "timeline": timeline
        }
        print(f"  -> {len(timeline)} registros horarios guardados.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)

    print(f"\nListo. Archivo generado en: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()