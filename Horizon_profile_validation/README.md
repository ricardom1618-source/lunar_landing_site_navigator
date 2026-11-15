# Topographic Validation & Lunar Horizon Profiles

This directory contains the spreadsheets, raw altimetric transects, exported GIS transect geometries (`my-features.csv`), and geometric cross-validation workbooks used to derive the topocentric terrain parameters (`elevation_km` and `horizon_profile_deg`) for all **6 modeled sites** (5 **Artemis III** South Pole candidates plus the **Apollo 11** equatorial baseline) in `data/lunar_data.json`.

Keeping these validation workbooks decoupled from the web application guarantees full **scientific traceability and reproducibility** without penalizing browser load times or real-time rendering performance.

---

## 1. Official Data Sources (NASA / LROC QuickMap)

All radial elevation profiles were extracted using the *Profile / Inspect* tool in **LROC QuickMap** from high-resolution Lunar Orbiter Laser Altimeter Digital Elevation Models (DEMs):

* **South Pole DEM Layer (≥ 80° S):** `LOLA 80S 20M ADJ DEM` (*Lunar Orbiter Laser Altimeter*, 20 m/pixel adjusted polar DEM) in *South Pole Stereographic* projection for *Haworth*, *Malapert Massif*, *Mons Mouton*, *Nobile Rim 1*, and *Shackleton Crater Rim*.
* **Equatorial Baseline DEM Layer (< 75°):** `SLDEM2015 (+ LOLA)` (~60 m/pixel combined SELENE/LOLA DEM) in *Equidistant Cylindrical (< 75 deg.)* projection for *Apollo 11 (Tranquility Base)*.
* **Altimetric Datum (`TerrainHeight`):** Absolute radial elevation in meters (m) referenced to the lunar mean sphere of radius `R = 1,737.4 km` (`1,737,400 m`).
* **Radial Sampling:** 8 radial transects per landing site traced clockwise from true North (`0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°`), spanning a sampling radius of **~50 km** at a spatial step of **~71–76 m** (~700 evaluated points per azimuth).

---

## 2. Mathematical Model & Lunar Curvature Correction

At the Lunar South Pole, where maximum solar elevation stays between 1.5° and 5°, flat-plane approximations introduce significant line-of-sight errors. Because the Moon's mean radius is only `R = 1,737.4 km` (~27% of Earth's radius), at a distance of **50 km** the lunar surface drops approximately **720 m** (~0.82°) below the lander's local tangent horizon.

To project each terrain sample `Pᵢ(dᵢ, hᵢ)` onto the **local horizontal tangent plane** of the lander `P₀(0, h₀)`, the visual elevation angle `αᵢ` is computed via exact spherical trigonometry:

```text
θᵢ = dᵢ / R

αᵢ = arctan( [ (R + hᵢ) · cos(θᵢ) - (R + h₀) ] / [ (R + hᵢ) · sin(θᵢ) ] ) × (180 / π)
```

Where:
* `R = 1,737,400 m`: Official IAU/NASA lunar mean radius.
* `h₀`: Topographic elevation at the landing site (m).
* `hᵢ`: Topographic elevation at sample point `i` (m).
* `dᵢ`: Cumulative surface arc distance from the landing site (m).

Across our 6 modeled sites, directional horizon profiles are computed using two complementary, curvature-aware formulations:
* **2D Spherical Trigonometry Projection:** Applied to *Haworth*, *Malapert Massif*, and *Nobile Rim 1*.
* **3D Selenocentric-to-Topocentric (`X, Y, Z → ENU`) Geodetic Transformation:** Applied to *Mons Mouton*, *Shackleton Crater Rim*, and *Apollo 11*.

The effective horizon obstruction angle for each azimuth is given by the global line-of-sight maximum (`α_horizon = max(αᵢ)`), as any ridge behind that peak with a lower elevation angle is physically occluded. *(Note: Local terrain slope `TerrainSlope` is evaluated separately at `d = 0` strictly to verify landing stability within the < 15° engineering threshold, not for horizon obstruction).*

### 2D Spreadsheet Implementation (`position` in km, `TerrainHeight` in m)
```excel
=IF(A3<=0, "", DEGREES(ATAN(((1737400+B3)*COS(A3/1737.4)-(1737400+$B$2))/((1737400+B3)*SIN(A3/1737.4)))))
```

---

## 3. Independent Geometric Cross-Validation (2D Spherical vs. 3D ENU)

To verify the equivalence of both curvature-corrected formulations across our candidate sites, a `49.90 km` transect at **Mons Mouton** (`lat: -84.598°`, `lon: 31.008°`) was independently solved using both the 2D spherical projection and a full 3D geodetic transformation from selenocentric Cartesian coordinates `(X, Y, Z)` into a local topocentric `(East, North, Up)` frame anchored at the landing site:

| Geometric Method | Reference Workbook | Max Horizon Angle | Absolute Difference |
| :--- | :--- | :---: | :---: |
| **2D Spherical Projection** | `Mons Mouton/prueba.xlsx` | `2.872092°` | Baseline |
| **3D Geodetic `(X, Y, Z → ENU)`** | `Mons Mouton/Mons Mouton- (1).xlsx` | `2.872096°` | **`0.000004°`** (`< 0.001°`) |

Both methods converge to within four millionths of a degree, confirming the physical and numerical fidelity of both pipelines.
Note that the data used to this validation is different from the one used to perform the calculations. Just to verify that it work for all sets of data. 

---

## 4. Validated Benchmark Example: Haworth Crater

* **Analysis Coordinates:** `-87.45° S, -5.17° E`
* **Mean Origin Elevation (`elevation_km`):** `-3.31 km` (`-3,308.54 m` average across all 8 radial origins)

| Index | Azimuth | Source Workbook | Peak Distance | Peak Elevation | Horizon Angle (`α_max`) |
| :---: | :---: | :--- | :---: | :---: | :---: |
| `0` | **`0°` (N)** | `Haworth/Hamworth (0º).xlsx` | `26.28 km` | `+1,427.56 m` | **`9.80°`** |
| `1` | **`45°` (NE)** | `Haworth/Hamworth (45º).xlsx` | `24.74 km` | `+582.81 m` | **`8.55°`** |
| `2` | **`90°` (E)** | `Haworth/Hamworth (90º).xlsx` | `25.79 km` | `-1,107.17 m` | **`4.42°`** |
| `3` | **`135°` (SE)** | `Haworth/Hamworth (135º).xlsx` | `27.30 km` | `-632.64 m` | **`5.15°`** |
| `4` | **`180°` (S)** | `Haworth/Hamworth (180º).xlsx` | `0.07 km` *(local ridge)* | `-3,294.17 m` | **`8.92°`** |
| `5` | **`225°` (SW)** | `Haworth/Hamworth (225º).xlsx` | `0.07 km` *(local ridge)* | `-3,297.16 m` | **`9.37°`** |
| `6` | **`270°` (W)** | `Haworth/Hamworth (270º).xlsx` | `28.11 km` | `+1,177.89 m` | **`8.62°`** |
| `7` | **`315°` (NW)** | `Haworth/Hamworth (315º).xlsx` | `24.62 km` | `+1,035.60 m` | **`9.63°`** |

### Integrated Output in `data/lunar_data.json`
```json
"haworth": {
  "name": "Haworth Crater (PSR Rim/Floor)",
  "lat": -87.45,
  "lon": -5.17,
  "elevation_km": -3.31,
  "horizon_profile_deg": [9.80, 8.55, 4.42, 5.15, 8.92, 9.37, 8.62, 9.63]
}
```

---

## 5. Directory Structure

```text
Horizon_profile_validation/
├── README.md                  # Methodology, equations, and validated site summaries
├── Apollo 11/                 # 8-azimuth SLDEM2015 (+LOLA) workbooks (3D geodetic ENU)
├── Haworth/                   # 8-azimuth LOLA DEM workbooks (0° to 315°, 2D spherical projection)
├── Malapert Massif/           # 8-azimuth LOLA DEM workbooks (0° to 315°, 2D spherical projection)
├── Mons Mouton/               # 8-azimuth LOLA DEM workbooks (3D geodetic ENU & 2D cross-validation)
├── Nubile Rim 1/              # 8-azimuth LOLA DEM workbooks (0° to 315°, 2D spherical projection)
├── Shackleton Crater Rim/     # 8-azimuth LOLA DEM workbooks (0° to 315°, 3D geodetic ENU)
└── my-features.csv            # Exported LROC QuickMap transect geometries & coordinates
```