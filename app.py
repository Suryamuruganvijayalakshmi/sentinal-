"""
SENTINEL — Satellite Safety Analytics & Collision-Avoidance Simulator
Python Data Visualization Dashboard (Streamlit & Plotly)
"""

import math
import numpy as np
import pandas as pd
import streamlit as st
import visualizations as viz
from data_loader import load_dataset, get_simulation_encounter_data

# ── 1. STREAMLIT APP CONFIGURATION ──
st.set_page_config(
    page_title="SENTINEL | Satellite Safety & Collision-Avoidance",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ── 2. DATA INGESTION (CACHED) ──
@st.cache_data(show_spinner=False)
def get_cached_dataset(file_bytes=None, file_name=None):
    if file_bytes is not None:
        import io
        buf = io.BytesIO(file_bytes)
        buf.name = file_name
        return load_dataset(buf, include_reference_fleet=True)
    return load_dataset(None, include_reference_fleet=True)


# ── 3. SIDEBAR NAVIGATION & DATASET CONTROLS ──
with st.sidebar:
    st.markdown("## 🛰️ **SENTINEL**")
    st.caption("Satellite Safety Analytics & Collision-Avoidance Simulator")
    st.markdown("---")

    # A. Dataset File Ingestion
    st.markdown("### 📂 **Dataset Ingestion**")
    uploaded_file = st.file_uploader(
        "Upload Kaggle Satellite / Debris CSV",
        type=["csv"],
        help="Upload any Kaggle satellite or optical debris detection CSV. Column mapping & normalisation are applied automatically."
    )

    if uploaded_file is not None:
        file_bytes = uploaded_file.getvalue()
        df, report = get_cached_dataset(file_bytes, uploaded_file.name)
        st.success(f"Loaded: **{uploaded_file.name}** ({report['valid_rows']:,} records)")
    else:
        df, report = get_cached_dataset()
        st.info(f"Using Catalog: **{report['source_name']}** ({report['valid_rows']:,} objects)")

    # Data Quality & Mapping Report Expander
    with st.expander("🔍 Dataset Health & Schema Report", expanded=False):
        st.write(f"**Source:** `{report['source_name']}`")
        st.write(f"**Total Records:** `{report['valid_rows']:,}` (Deduplicated: `{report['duplicate_rows']}`)")
        st.write(f"**Satellites Present:** `{'Yes' if report['has_satellites'] else 'No'}`")
        st.write(f"**Debris Present:** `{'Yes' if report['has_debris'] else 'No'}`")
        st.write(f"**3D ECI State:** `{'Available' if report['has_3d_state'] else 'Derived from Keplerian Elements'}`")
        if report["derived_features"]:
            st.write(f"**Derived Parameters:** {', '.join(report['derived_features'])}")
        if report["warnings"]:
            for w in report["warnings"]:
                st.caption(f"ℹ️ {w}")

    st.markdown("---")

    # B. Global Filters
    st.markdown("### 🎛️ **Fleet Filters**")
    categories = ["ALL"] + sorted([c for c in df["orbital_category"].unique() if pd.notnull(c)])
    selected_cat = st.selectbox("Orbital Category:", categories, index=0)

    object_types = ["ALL"] + sorted([t for t in df["object_type"].unique() if pd.notnull(t)])
    selected_type = st.selectbox("Object Classification:", object_types, index=0)

    risk_tiers = ["ALL"] + sorted([r for r in df["risk_level"].unique() if pd.notnull(r)])
    selected_risk = st.selectbox("Risk Level:", risk_tiers, index=0)

    # Altitude Range Slider
    min_alt = float(df["altitude"].min()) if not df["altitude"].dropna().empty else 160.0
    max_alt = float(df["altitude"].max()) if not df["altitude"].dropna().empty else 36000.0
    alt_range = st.slider(
        "Altitude Range (km):",
        min_value=max(0.0, math.floor(min_alt)),
        max_value=min(45000.0, math.ceil(max_alt)),
        value=(max(0.0, math.floor(min_alt)), min(45000.0, math.ceil(max_alt))),
        step=50.0
    )

    st.markdown("---")
    st.markdown("### 🧭 **Navigation**")
    nav_mode = st.radio(
        "Select Subsystem View:",
        [
            "Mission Overview",
            "Orbital Analytics",
            "Statistical Visualizations",
            "Space Debris Analytics",
            "Conjunction Analysis",
            "Collision Avoidance Simulator"
        ]
    )

    st.markdown("---")
    st.caption("SENTINEL Autonomous Safety Engine • Python & Plotly Suite")


# ── 4. FILTER APPLICATION ──
df_filtered = df.copy()
if selected_cat != "ALL":
    df_filtered = df_filtered[df_filtered["orbital_category"] == selected_cat]
if selected_type != "ALL":
    df_filtered = df_filtered[df_filtered["object_type"] == selected_type]
if selected_risk != "ALL":
    df_filtered = df_filtered[df_filtered["risk_level"] == selected_risk]

df_filtered = df_filtered[
    (df_filtered["altitude"] >= alt_range[0]) &
    (df_filtered["altitude"] <= alt_range[1])
]

# Shared simulation physics data
sim_data = get_simulation_encounter_data()


# ── 5. DASHBOARD HEADER ──
col_header_1, col_header_2 = st.columns([8, 4])
with col_header_1:
    st.markdown(f"# **SENTINEL • {nav_mode.upper()}**")
    st.caption("Satellite Safety Analytics, Deterministic Trajectory Propagation & Autonomous Debris Avoidance")
with col_header_2:
    st.markdown(
        f"<div style='text-align:right;padding-top:10px;'>"
        f"<span style='background:#fee2e2;color:#b91c1c;padding:4px 10px;border-radius:12px;font-weight:bold;font-size:12px;font-family:monospace;'>"
        f"THREAT LEVEL: HIGH (d_CPA = 12.8m)"
        f"</span></div>",
        unsafe_allow_html=True
    )

st.markdown("---")


# ══════════════════════════════════════════════════════════════════════════════
# VIEW 1: MISSION OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
if nav_mode == "Mission Overview":
    # Key Metric Cards
    m1, m2, m3, m4, m5 = st.columns(5)
    with m1:
        st.metric("Protected Spacecraft", "SAT-01", "600 km LEO")
    with m2:
        st.metric("Total Catalog Objects", f"{len(df):,}", f"{len(df_filtered):,} in filter")
    with m3:
        st.metric("Active Satellites", f"{(df['object_type'] == 'SATELLITE').sum():,}", "98.5% Nominal")
    with m4:
        st.metric("Debris Cloud Fragments", f"{(df['object_type'] == 'DEBRIS').sum():,}", "Tracked Ephemeris")
    with m5:
        st.metric("Closest Approach d_CPA", "12.8 m", "-8.12 km/s Rel Speed", delta_color="inverse")

    st.markdown("<br>", unsafe_allow_html=True)

    # 3D Earth Orbit Viewport
    st.markdown("### 🌍 **3D Earth Orbital Situation Awareness (ECI Frame)**")
    st.caption("Interactive 3D representation showing Earth surface, operational satellites, orbital trajectories, and hypervelocity debris field.")

    df_sats = df[df["object_type"] == "SATELLITE"]
    df_deb = df[df["object_type"] == "DEBRIS"]

    fig_3d = viz.create_3d_earth_orbit(df_sats, df_deb, selected_id="SAT-01", show_debris=True)
    st.plotly_chart(fig_3d, use_container_width=True)

    # Secondary Overview Row: Population & Breakdown
    col_ov1, col_ov2 = st.columns(2)
    with col_ov1:
        fig_pop = viz.create_satellite_population_bar(df_filtered)
        st.plotly_chart(fig_pop, use_container_width=True)
    with col_ov2:
        fig_donut = viz.create_orbit_donut(df_filtered)
        st.plotly_chart(fig_donut, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# VIEW 2: ORBITAL ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════
elif nav_mode == "Orbital Analytics":
    st.markdown("### 📊 **Satellite Population & Orbital Classification Analytics**")
    st.caption("Examines satellite counts, altitude distributions, orbital inclination patterns, and fleet operational status.")

    # Controls Row
    c1, c2 = st.columns([8, 4])
    with c2:
        hist_bins = st.slider("Altitude Histogram Bins:", min_value=10, max_value=80, value=35, step=5)

    # Row 1: Population Bar & Altitude Histogram
    r1_col1, r1_col2 = st.columns(2)
    with r1_col1:
        fig_bar = viz.create_satellite_population_bar(df_filtered, category_filter=selected_cat)
        st.plotly_chart(fig_bar, use_container_width=True)
    with r1_col2:
        fig_hist = viz.create_altitude_histogram(df_filtered, n_bins=hist_bins, category_filter=selected_cat)
        st.plotly_chart(fig_hist, use_container_width=True)

    # Row 2: Orbit Donut, Inclination Distribution & Satellite Status
    r2_col1, r2_col2, r2_col3 = st.columns(3)
    with r2_col1:
        fig_donut = viz.create_orbit_donut(df_filtered, category_filter=selected_cat)
        st.plotly_chart(fig_donut, use_container_width=True)
    with r2_col2:
        fig_inc = viz.create_inclination_distribution(df_filtered, n_bins=25)
        st.plotly_chart(fig_inc, use_container_width=True)
    with r2_col3:
        fig_status = viz.create_satellite_status_chart(df_filtered)
        st.plotly_chart(fig_status, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# VIEW 3: STATISTICAL VISUALIZATIONS
# ══════════════════════════════════════════════════════════════════════════════
elif nav_mode == "Statistical Visualizations":
    st.markdown("### 📈 **Aerospace Statistical Diagnostics & Phase Space Analysis**")
    st.caption("Pearson orbital correlation matrix, altitude-inclination phase space scatter, regime box plots, and cumulative tracked population.")

    s_col1, s_col2 = st.columns(2)
    with s_col1:
        fig_corr = viz.create_correlation_heatmap(df_filtered)
        st.plotly_chart(fig_corr, use_container_width=True)
        st.info("💡 **Aerospace Physics Insight:** Strong positive correlation between Altitude and Orbital Period ($r \\approx +1.0$) illustrates Kepler's Third Law ($T = 2\\pi\\sqrt{a^3/\\mu}$). Velocity magnitude exhibits negative correlation with altitude ($v = \\sqrt{\\mu/r}$).")
    with s_col2:
        fig_scatter = viz.create_altitude_inclination_scatter(df_filtered, color_by="orbital_category")
        st.plotly_chart(fig_scatter, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    s_col3, s_col4 = st.columns(2)
    with s_col3:
        fig_box = viz.create_altitude_boxplot(df_filtered)
        st.plotly_chart(fig_box, use_container_width=True)
    with s_col4:
        fig_area = viz.create_population_area_chart(df_filtered)
        st.plotly_chart(fig_area, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# VIEW 4: SPACE DEBRIS ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════
elif nav_mode == "Space Debris Analytics":
    st.markdown("### ⚠️ **Space Debris Field & Collision Congestion Analytics**")
    st.caption("Analyzes hypervelocity debris distribution, Cosmos-1408 / Fengyun-1C fragmentation clouds, and 2D spatial collision density.")

    d_col1, d_col2 = st.columns(2)
    with d_col1:
        fig_deb_bar = viz.create_debris_population_bar(df_filtered)
        st.plotly_chart(fig_deb_bar, use_container_width=True)
    with d_col2:
        fig_deb_hist = viz.create_debris_altitude_histogram(df_filtered, n_bins=35)
        st.plotly_chart(fig_deb_hist, use_container_width=True)

    d_col3, d_col4 = st.columns(2)
    with d_col3:
        fig_deb_donut = viz.create_debris_donut(df_filtered)
        st.plotly_chart(fig_deb_donut, use_container_width=True)
    with d_col4:
        fig_compare = viz.create_satellite_vs_debris_comparison(df_filtered)
        st.plotly_chart(fig_compare, use_container_width=True)

    d_col5, d_col6 = st.columns(2)
    with d_col5:
        fig_deb_scat = viz.create_debris_scatter(df_filtered)
        st.plotly_chart(fig_deb_scat, use_container_width=True)
    with d_col6:
        fig_density = viz.create_orbital_density_heatmap(df_filtered, n_bins=30)
        st.plotly_chart(fig_density, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# VIEW 5: CONJUNCTION ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
elif nav_mode == "Conjunction Analysis":
    st.markdown("### 🎯 **Conjunction Geometry & 3D Proximity Assessment**")
    st.caption("Deterministic two-body orbital encounter between SAT-A34 'SENTINEL' (Asset) and DEBRIS #8871 Cosmos-1408 Fragment (Hazard).")

    conj_col1, conj_col2 = st.columns([7, 5])
    with conj_col1:
        fig_traj = viz.create_orbital_trajectory_comparison(df)
        st.plotly_chart(fig_traj, use_container_width=True)
    with conj_col2:
        fig_ric = viz.create_satellite_proximity_ric()
        st.plotly_chart(fig_ric, use_container_width=True)

    # Encounter Metric Cards
    c_m1, c_m2, c_m3, c_m4 = st.columns(4)
    with c_m1:
        st.metric("Predicted d_CPA", "12.8 meters", "CRITICAL RISK", delta_color="inverse")
    with c_m2:
        st.metric("Time to CPA (t_CPA)", "T+20.0s", "Countdown Active")
    with c_m3:
        st.metric("Relative Closing Speed", "8.12 km/s", "Mach 24.3")
    with c_m4:
        st.metric("Screening Gate Violation", "24.987 km Depth", "Requires RCS Burn", delta_color="inverse")


# ══════════════════════════════════════════════════════════════════════════════
# VIEW 6: COLLISION AVOIDANCE SIMULATOR
# ══════════════════════════════════════════════════════════════════════════════
elif nav_mode == "Collision Avoidance Simulator":
    st.markdown("### 🚀 **Collision Avoidance Maneuver Planning & Verification**")
    st.caption("Simulates impulsive thruster burns to clear the 25.0 km screening boundary, evaluate candidate options, and verify post-burn clearance.")

    # Threshold & Interactive Slider
    th_col1, th_col2 = st.columns([8, 4])
    with th_col2:
        threshold_input = st.slider("Configurable Safety Screening Threshold (km):", min_value=10.0, max_value=50.0, value=25.0, step=1.0)

    # Row 1: Separation vs Time & Risk Gauge
    sim_r1_1, sim_r1_2 = st.columns([7, 5])
    with sim_r1_1:
        fig_dist_time = viz.create_distance_vs_time_chart(sim_data)
        st.plotly_chart(fig_dist_time, use_container_width=True)
    with sim_r1_2:
        fig_gauge = viz.create_risk_indicator_gauge(cpa_km=0.0128, threshold_km=threshold_input)
        st.plotly_chart(fig_gauge, use_container_width=True)
        st.warning("⚠️ **Proximity Assessment Status:** *CRITICAL HAZARD DETECTED* (Predicted minimum separation distance is 12.8 metres, severely violating the 25.0 km safety threshold).")

    # Row 2: Relative Velocity & Maneuver Trade Study
    sim_r2_1, sim_r2_2 = st.columns([5, 7])
    with sim_r2_1:
        fig_vel = viz.create_relative_velocity_chart(sim_data)
        st.plotly_chart(fig_vel, use_container_width=True)
    with sim_r2_2:
        fig_opts = viz.create_maneuver_comparison_chart(sim_data)
        st.plotly_chart(fig_opts, use_container_width=True)

    # Maneuver Candidate Table
    st.markdown("#### **Autonomous Avoidance Burn Options Table**")
    opts_df = pd.DataFrame(sim_data["maneuver_options"])[
        ["id", "name", "direction", "delta_v_ms", "resulting_d_cpa_km", "propellant_kg", "burn_lead_time_min", "status"]
    ]
    opts_df.columns = ["ID", "Maneuver Candidate", "Burn Direction", "ΔV (m/s)", "Resulting d_CPA (km)", "Propellant (kg)", "Lead Time (min)", "Gate Status"]
    st.dataframe(opts_df, use_container_width=True, hide_index=True)


# ── FOOTER ──
st.markdown("---")
st.markdown(
    "<div style='text-align:center;color:#64748b;font-size:11px;'>"
    "SENTINEL — Autonomous Satellite Safety & Orbital Collision-Avoidance System • Python & Streamlit Data Visualization Suite"
    "</div>",
    unsafe_allow_html=True
)
