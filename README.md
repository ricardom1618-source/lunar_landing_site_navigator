# Lunar Landing Site Navigator
**NASA Space Apps Challenge 2026 | Team: Soft Kitty, Warm Kitty**

An interactive mission-planning web application that evaluates **solar illumination (power generation)** and **Direct-to-Earth (DTE) line-of-sight communications** across candidate landing sites at the Lunar South Pole and an equatorial Apollo baseline.

---

## Overview & Operational Problem
Near the Lunar South Pole (-84° to -90° latitude), the Sun and Earth remain very close to the horizon (-6° to +6°) throughout the lunar cycle. Because the Moon has **no atmosphere** (0° atmospheric refraction), local topography—crater rims, ridges, and massifs—can abruptly block solar power or sever Earth communications for days at a time.

**Lunar Landing Site Navigator** combines official NASA/JPL ephemerides with local terrain horizon profiles to help mission planners:
- Visualize real-time Sun and Earth azimuth/elevation against a 360° local terrain mask.
- Quantify solar power availability (accounting for the Sun's 0.53° apparent angular diameter) and DTE link status.
- Forecast exact countdowns (`days / hours`) to the next Sunrise, Sunset, Earthrise, or Earthset.
- Compare two candidate sites side-by-side—or compare the same site across shifted launch dates.
- Scan a full lunar cycle (`720 hours`) to automatically detect the **longest continuous window** with simultaneous solar power and Earth DTE coverage.
- Evaluate arbitrary custom coordinates and elevations (`Lat`, `Lon`, `Elevation`) using spherical horizon-dip geometry.

---

## Data Sources & Scientific Grounding
1. **NASA/JPL Horizons System API (`ssd.jpl.nasa.gov/api/horizons.api`):**
   Topocentric apparent azimuth and elevation ephemerides for the Sun and Earth computed in `AIRLESS` mode (0° refraction) at 1-hour steps (`2026-12-01` to `2026-12-31 UTC`), capturing Earth's apparent libration wobble near the horizon.
2. **Lunar Orbiter Laser Altimeter (`LOLA 80S 20M ADJ DEM` & `SLDEM2015 + LOLA`) / LROC QuickMap & NASA Moon Trek:**
   High-resolution radial elevation transects (~50 km sampling radius across 8 azimuths per site) referenced to the 1,737.4 km mean lunar sphere. Directional terrain horizon masks (`horizon_profile_deg`) are derived using exact spherical curvature corrections and cross-validated against a 3D selenocentric-to-topocentric (`X, Y, Z → ENU`) geodetic transformation (< 0.001° variance). All raw LOLA profiles, GIS feature exports (`my-features.csv`), and calculation workbooks are documented in [`Horizon_profile_validation/`](./Horizon_profile_validation/README.md).
3. **NASA Artemis III / CLPS & Apollo Reference Regions:**
   Five candidate South Pole landing regions (*Mons Mouton*, *Shackleton Crater Rim*, *Malapert Massif*, *Haworth*, *Nobile Rim 1*) plus *Apollo 11 (Tranquility Base)* as an equatorial baseline control.

---

## Project Architecture
```text
lunar-landing-site-navigator/
├── index.html                        # Main dashboard structure & HTML5 Canvas viewports
├── css/
│   └── styles.css                    # Mission-control dark UI & responsive grid layout
├── js/
│   ├── horizonEngine.js              # Airless horizon interpolation, DTE & optimal window engine
│   └── app.js                        # Timeline controller, 360° panorama & polar map renderer
├── scripts/
│   └── fetch_horizons.py             # Python ETL pipeline querying NASA/JPL Horizons API
├── data/
│   └── lunar_data.json               # Pre-processed ephemeris & terrain dataset for offline use
├── Horizon_profile_validation/
│   ├── README.md                     # Topographic methodology & 2D/3D cross-validation summary
│   ├── Apollo 11/                    # 8-azimuth SLDEM2015 (+LOLA) workbooks (3D geodetic ENU)
│   ├── Haworth/                      # 8-azimuth LOLA DEM workbooks (0° to 315°, 2D spherical projection)
│   ├── Malapert Massif/              # 8-azimuth LOLA DEM workbooks (0° to 315°, 2D spherical projection)
│   ├── Mons Mouton/                  # 8-azimuth LOLA DEM workbooks (0° to 315°, 3D geodetic ENU)
│   ├── Nubile Rim 1/                 # 8-azimuth LOLA DEM workbooks (0° to 315°, 2D spherical projection)
│   ├── Shackleton Crater Rim/        # 8-azimuth LOLA DEM workbooks (0° to 315°, 3D geodetic ENU)
│   └── my-features.csv               # Exported LROC QuickMap transect geometries & coordinates
└── README.md                         # Project documentation


## AI Disclosure
In accordance with NASA Space Apps Challenge guidelines, generative AI tools were used as a collaborative coding and engineering assistant to structure the JavaScript horizon interpolation module, debug API query formatting for JPL Horizons, and refine UI layout. All astronomical ephemerides and topographic elevation profiles are sourced directly from NASA/JPL Horizons and NASA LRO/LOLA via LROC QuickMap.