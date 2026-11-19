# SENTINEL — Python Data Visualization Suite

Interactive aerospace scientific visualization dashboard for **SENTINEL (Satellite Safety Analytics & Collision-Avoidance Simulator)** built strictly with **Python**, **Streamlit**, and **Plotly**.

---

## 🚀 Quickstart

Ensure you are in the project root directory and run:

```bash
streamlit run app.py
```

The dashboard will open automatically in your browser at `http://localhost:8501`.

---

## 🛠️ Technology Stack & Strict Constraints

* **Frontend & Dashboard Engine:** [Streamlit](https://streamlit.io/) (Native Python components only)
* **Scientific Visualizations:** [Plotly Graph Objects (`go`) & Plotly Express (`px`)](https://plotly.com/python/)
* **Numerical & Data Processing:** [Pandas](https://pandas.pydata.org/) & [NumPy](https://numpy.org/)
* **Astrodynamics Mechanics:** Deterministic Two-Body Keplerian Mechanics & Runge-Kutta 4th Order (RK4)
* **Zero External Web Frameworks:** Pure Python only (No React, Next.js, JS/TS, CSS/HTML frameworks used for visualization).

---

## 📁 Architecture & File Layout

| File | Purpose |
| :--- | :--- |
| **`app.py`** | Main Streamlit dashboard application organizing tabs, filters, KPI metrics, and user interactions. |
| **`visualizations.py`** | Modular library containing all 22 reusable Plotly chart generator functions. |
| **`data_loader.py`** | Ingests, normalizes, and validates Kaggle satellite/debris CSVs; computes derived Keplerian elements and provides realistic collision scenario encounter physics. |
| **`.streamlit/config.toml`** | Light aerospace theme configuration (white background, navy typography, sky-blue accents). |
| **`requirements.txt`** | Dependency manifest (`streamlit`, `pandas`, `numpy`, `plotly`, `scipy`). |

---

## 📊 Complete Chart & Visualization Catalog

### 1. Satellite Analytics Charts
* **1A. Satellite Population Bar Chart (`create_satellite_population_bar`):** Groups fleet by orbital regime (LEO, MEO, GEO, HEO) with counts, fleet share percentages, and mean altitude hover data.
* **1B. Orbital Altitude Histogram (`create_altitude_histogram`):** Interactive bin count slider showing altitude distribution (km) with annotations for ISS (420 km), Starlink (550 km), and Iridium (780 km).
* **1C. Satellite Distribution Donut Chart (`create_orbit_donut`):** Proportions across LEO, MEO, GEO, and HEO with center fleet total count.
* **1D. Inclination Distribution Chart (`create_inclination_distribution`):** Histogram of inclination angles ($0^\circ - 180^\circ$) highlighting launch latitudes ($28.5^\circ$, $51.6^\circ$, $53^\circ$, $98.2^\circ$ SSO).
* **1E. Satellite Status Chart (`create_satellite_status_chart`):** Active vs Defunct vs Unknown satellite operational status.

### 2. Statistical Visualizations
* **2A. Correlation Heatmap (`create_correlation_heatmap`):** Pearson correlation $r$ across physical orbital variables (altitude, inclination, eccentricity, period, velocity, mass). Excludes identifiers.
* **2B. Phase Space Scatter Plot (`create_altitude_inclination_scatter`):** Orbital altitude vs inclination colored by classification with object selection highlighting.
* **2C. Altitude Spread Box Plot (`create_altitude_boxplot`):** Median, quartiles (Q1, Q3), whiskers, and high-altitude outliers across orbital categories.
* **2D. Population Growth Area Chart (`create_population_area_chart`):** Cumulative tracked population across actual surveillance observation timestamps.

### 3. Space Debris Visualizations
* **3A. Debris Population Bar Chart (`create_debris_population_bar`):** Debris fragments classified by collision risk tiers (CRITICAL, HIGH, MEDIUM, LOW).
* **3B. Debris Altitude Histogram (`create_debris_altitude_histogram`):** Highlights congested debris fragmentation shells (550 km Starlink, 780 km Cosmos-2251, 850 km Fengyun-1C).
* **3C. Debris Risk Donut Chart (`create_debris_donut`):** Proportion of debris fragments by severity.
* **3D. Satellites vs Debris Comparative Chart (`create_satellite_vs_debris_comparison`):** Grouped bar comparison across population, altitude, velocity, and orbital dispersion.
* **3E. Debris Phase Space Scatter (`create_debris_scatter`):** Debris altitude vs inclination colored by hazard level.
* **3F. Orbital Density Heatmap (`create_orbital_density_heatmap`):** 2D density contour map revealing spatial congestion hotspots.

### 4. Advanced Orbital Visualizations (3D)
* **4A. 3D Earth Orbit Visualization (`create_3d_earth_orbit`):** 3D Earth sphere with surface texture, nominal Sentinel 600 km orbit line, active satellite positions, debris cloud particles, and incoming hazard vector.
* **4B. Trajectory Plane Intersection (`create_orbital_trajectory_comparison`):** 3D comparison between protected asset orbit and intersecting hazard orbit.
* **4C. Asset-Centered Proximity Encounter (`create_satellite_proximity_ric`):** Local Vertical Local Horizontal (RIC) proximity encounter with 25 km safety boundary and closest approach marker.

### 5. Collision Avoidance Simulator
* **5A. Distance vs Time Graph (`create_distance_vs_time_chart`):** Contrasts unmitigated collision trajectory ($d_{\text{CPA}} = 12.8\text{ m}$) with post-maneuver proactive clearance ($d_{\text{CPA}} = 30.57\text{ km}$).
* **5B. Relative Velocity Chart (`create_relative_velocity_chart`):** Closing speed profile ($8.12\text{ km/s}$) throughout the encounter window.
* **5C. Maneuver Candidate Trade Study (`create_maneuver_comparison_chart`):** Compares Option A (Prograde $+5.0\text{ m/s}$), Option B (Retrograde $-4.5\text{ m/s}$), and Option C (Radial-out $+8.2\text{ m/s}$) against the 25 km safety threshold.
* **5D. Risk Indicator Gauge (`create_risk_indicator_gauge`):** Visual clearance gauge with configurable threshold slider and prototype assessment disclaimer.

---

## 📥 Data Ingestion & Kaggle Compatibility

* Click **"Browse files"** in the sidebar to upload any Kaggle satellite or debris CSV.
* Automatic column normalization recognizes alternative column names (`alt`, `perigee`, `inc`, `e`, `semi_major_axis`, etc.).
* Missing orbital elements are derived using standard astrodynamics formulas ($\mu = 398,600.44\text{ km}^3/\text{s}^2$, $R_{\text{Earth}} = 6378.137\text{ km}$).
* When datasets lack operational satellites (such as debris-only catalogs), reference operational satellites are seamlessly integrated for comparative analysis.
