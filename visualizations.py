"""
SENTINEL - Reusable Plotly Visualization Engine
Generates interactive, publication-quality Plotly figures for Streamlit aerospace analytics.
Strict adherence to Python + Plotly Graph Objects & Express only.
"""

import math
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from typing import Dict, Any, List, Optional

R_EARTH = 6378.137  # km

# Professional Light Aerospace Theme Colors
NAVY = "#0f172a"
SLATE_MUTED = "#64748b"
BG_CARD = "#ffffff"
BG_PLOT = "#f8fafc"
GRID_COLOR = "#e2e8f0"
BORDER_COLOR = "#cbd5e1"

COLOR_LEO = "#2563eb"     # Royal Blue
COLOR_MEO = "#0284c7"     # Sky Blue
COLOR_GEO = "#059669"     # Emerald Green
COLOR_HEO = "#d97706"     # Amber / Gold
COLOR_DEBRIS = "#ea580c"  # Orange
COLOR_CRITICAL = "#ef4444"# Rose Red
COLOR_WARNING = "#f59e0b" # Amber
COLOR_SAFE = "#10b981"    # Green

CATEGORY_COLORS = {
    "LEO": COLOR_LEO,
    "MEO": COLOR_MEO,
    "GEO": COLOR_GEO,
    "HEO": COLOR_HEO,
    "UNKNOWN": "#94a3b8"
}

RISK_COLORS = {
    "CRITICAL": COLOR_CRITICAL,
    "HIGH": "#f97316",
    "MEDIUM": COLOR_WARNING,
    "LOW": COLOR_SAFE,
    "SAFE": COLOR_SAFE,
    "MONITORED": COLOR_MEO
}


def apply_aerospace_layout(
    fig: go.Figure,
    title: str,
    subtitle: Optional[str] = None,
    height: int = 420,
    show_legend: bool = True
) -> go.Figure:
    """Applies a consistent, clean light aerospace analytics theme to any Plotly figure."""
    full_title = f"<b>{title}</b>"
    if subtitle:
        full_title += f"<br><span style='font-size:11px;color:{SLATE_MUTED};font-weight:normal;'>{subtitle}</span>"

    fig.update_layout(
        title={
            "text": full_title,
            "font": {"size": 15, "color": NAVY, "family": "Inter, sans-serif"},
            "x": 0.01,
            "y": 0.96,
            "xanchor": "left",
            "yanchor": "top"
        },
        paper_bgcolor=BG_CARD,
        plot_bgcolor=BG_PLOT,
        font={"family": "Inter, sans-serif", "color": NAVY, "size": 11},
        height=height,
        margin={"l": 45, "r": 25, "t": 60, "b": 45},
        showlegend=show_legend,
        legend={
            "bgcolor": "rgba(255,255,255,0.85)",
            "bordercolor": GRID_COLOR,
            "borderwidth": 1,
            "font": {"size": 10}
        },
        hoverlabel={
            "bgcolor": "#ffffff",
            "bordercolor": BORDER_COLOR,
            "font": {"size": 11, "family": "Inter, monospace"}
        }
    )

    fig.update_xaxes(
        gridcolor=GRID_COLOR,
        zerolinecolor=GRID_COLOR,
        tickfont={"size": 10, "color": SLATE_MUTED},
        title_font={"size": 11, "color": NAVY}
    )
    fig.update_yaxes(
        gridcolor=GRID_COLOR,
        zerolinecolor=GRID_COLOR,
        tickfont={"size": 10, "color": SLATE_MUTED},
        title_font={"size": 11, "color": NAVY}
    )
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# 1. SATELLITE ANALYTICS CHARTS
# ══════════════════════════════════════════════════════════════════════════════

def create_satellite_population_bar(df: pd.DataFrame, category_filter: Optional[str] = None) -> go.Figure:
    """
    1A. Satellite Population Bar Chart
    Displays satellite counts by orbital category (LEO, MEO, GEO, HEO).
    """
    df_sats = df[df["object_type"] == "SATELLITE"].copy()
    if df_sats.empty:
        df_sats = df.copy()

    if category_filter and category_filter != "ALL":
        df_sats = df_sats[df_sats["orbital_category"] == category_filter]

    cat_counts = df_sats.groupby("orbital_category").agg(
        Count=("id", "count"),
        AvgAlt=("altitude", "mean"),
        MinAlt=("altitude", "min"),
        MaxAlt=("altitude", "max")
    ).reset_index()

    order = ["LEO", "MEO", "GEO", "HEO"]
    cat_counts["sort_order"] = cat_counts["orbital_category"].apply(lambda c: order.index(c) if c in order else 99)
    cat_counts = cat_counts.sort_values("sort_order")

    total = max(1, cat_counts["Count"].sum())
    cat_counts["Percentage"] = (cat_counts["Count"] / total * 100.0).round(1)

    colors = [CATEGORY_COLORS.get(cat, "#3b82f6") for cat in cat_counts["orbital_category"]]

    fig = go.Figure(
        data=[
            go.Bar(
                x=cat_counts["orbital_category"],
                y=cat_counts["Count"],
                text=[f"<b>{c:,}</b> ({p}%)" for c, p in zip(cat_counts["Count"], cat_counts["Percentage"])],
                textposition="outside",
                marker_color=colors,
                marker_line_color=BORDER_COLOR,
                marker_line_width=1,
                hovertemplate=(
                    "<b>Orbital Category:</b> %{x}<br>"
                    "<b>Count:</b> %{y:,} satellites<br>"
                    "<b>Share of Fleet:</b> %{customdata[0]}%<br>"
                    "<b>Mean Altitude:</b> %{customdata[1]:.1f} km<br>"
                    "<b>Altitude Range:</b> %{customdata[2]:.1f} – %{customdata[3]:.1f} km"
                    "<extra></extra>"
                ),
                customdata=cat_counts[["Percentage", "AvgAlt", "MinAlt", "MaxAlt"]].values
            )
        ]
    )

    apply_aerospace_layout(
        fig,
        title="Satellite Population by Orbital Category",
        subtitle=f"Total Satellites Filtered: {total:,} • LEO, MEO, GEO & HEO Regimes",
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title="Orbital Classification Regime")
    fig.update_yaxes(title="Number of Tracked Satellites", rangemode="tozero")
    return fig


def create_altitude_histogram(
    df: pd.DataFrame,
    n_bins: int = 30,
    category_filter: Optional[str] = None
) -> go.Figure:
    """
    1B. Orbital Altitude Histogram
    Displays satellite altitude distribution in kilometres with configurable bins.
    """
    df_sats = df[df["object_type"] == "SATELLITE"].copy()
    if df_sats.empty:
        df_sats = df.copy()

    if category_filter and category_filter != "ALL":
        df_sats = df_sats[df_sats["orbital_category"] == category_filter]

    alts = df_sats["altitude"].dropna()

    fig = go.Figure(
        data=[
            go.Histogram(
                x=alts,
                nbinsx=n_bins,
                marker_color="#2563eb",
                marker_line_color="#ffffff",
                marker_line_width=1,
                opacity=0.85,
                hovertemplate=(
                    "<b>Altitude Interval:</b> %{x} km<br>"
                    "<b>Satellite Frequency:</b> %{y:,} objects"
                    "<extra></extra>"
                )
            )
        ]
    )

    # Key aerospace altitude benchmarks
    benchmarks = [
        (420, "ISS (420 km)", "#10b981"),
        (550, "Starlink Shell (550 km)", "#6366f1"),
        (780, "Iridium Shell (780 km)", "#f59e0b"),
    ]
    max_alt = alts.max() if not alts.empty else 1000.0
    for b_alt, b_label, b_color in benchmarks:
        if b_alt <= max_alt:
            fig.add_vline(
                x=b_alt,
                line_dash="dot",
                line_color=b_color,
                line_width=1.5,
                annotation_text=b_label,
                annotation_position="top right",
                annotation_font={"size": 9, "color": b_color}
            )

    apply_aerospace_layout(
        fig,
        title="Orbital Altitude Frequency Distribution",
        subtitle=f"Bin Count: {n_bins} • Unit: Kilometres (km) MSL • Sample Size: {len(alts):,}",
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title="Orbital Altitude (km)")
    fig.update_yaxes(title="Frequency (Object Count)")
    return fig


def create_orbit_donut(df: pd.DataFrame, category_filter: Optional[str] = None) -> go.Figure:
    """
    1C. Satellite Distribution Donut Chart
    Shows proportions, total count, percentages, and interactive legend.
    """
    df_sats = df[df["object_type"] == "SATELLITE"].copy()
    if df_sats.empty:
        df_sats = df.copy()

    counts = df_sats["orbital_category"].value_counts().reset_index()
    counts.columns = ["Category", "Count"]

    colors = [CATEGORY_COLORS.get(cat, "#3b82f6") for cat in counts["Category"]]

    fig = go.Figure(
        data=[
            go.Pie(
                labels=counts["Category"],
                values=counts["Count"],
                hole=0.55,
                marker_colors=colors,
                marker_line=dict(color="#ffffff", width=2),
                textinfo="label+percent",
                textposition="inside",
                insidetextorientation="radial",
                hovertemplate="<b>%{label}</b><br>Count: %{value:,}<br>Proportion: %{percent}<extra></extra>"
            )
        ]
    )

    total = counts["Count"].sum()
    fig.add_annotation(
        text=f"<b>{total:,}</b><br><span style='font-size:10px;color:{SLATE_MUTED};'>TOTAL</span>",
        x=0.5, y=0.5,
        font=dict(size=14, color=NAVY),
        showarrow=False
    )

    apply_aerospace_layout(
        fig,
        title="Orbital Regime Fleet Share",
        subtitle="Distribution across LEO, MEO, GEO & HEO Shells",
        height=380
    )
    return fig


def create_inclination_distribution(df: pd.DataFrame, n_bins: int = 25) -> go.Figure:
    """
    1D. Inclination Distribution Chart
    Visualizes inclination angles (0° to 180°) and highlights operational orbits.
    """
    incs = df["inclination"].dropna()

    fig = go.Figure(
        data=[
            go.Histogram(
                x=incs,
                nbinsx=n_bins,
                marker_color="#0284c7",
                marker_line_color="#ffffff",
                marker_line_width=1,
                opacity=0.85,
                hovertemplate="<b>Inclination:</b> %{x:.1f}°<br><b>Count:</b> %{y:,}<extra></extra>"
            )
        ]
    )

    bands = [
        (28.5, "Cape Canaveral (28.5°)", "#059669"),
        (51.6, "ISS / Baikonur (51.6°)", "#2563eb"),
        (53.0, "Starlink (53.0°)", "#6366f1"),
        (98.2, "SSO Polar (98.2°)", "#d97706"),
    ]
    for b_inc, b_lbl, b_col in bands:
        if incs.min() <= b_inc <= incs.max():
            fig.add_vline(
                x=b_inc,
                line_dash="dash",
                line_color=b_col,
                line_width=1.5,
                annotation_text=b_lbl,
                annotation_position="top right",
                annotation_font={"size": 9, "color": b_col}
            )

    apply_aerospace_layout(
        fig,
        title="Orbital Inclination Angle Distribution",
        subtitle="Identifies Key Launch Latitudes, SSO Polar & Starlink Mega-Constellation Planes",
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title="Orbital Inclination (° deg)", range=[0, 180])
    fig.update_yaxes(title="Object Count")
    return fig


def create_satellite_status_chart(df: pd.DataFrame) -> go.Figure:
    """
    1E. Satellite Status Chart
    Active, Inactive, Unknown counts only when supported by source data.
    """
    df_sats = df[df["object_type"] == "SATELLITE"].copy()
    if df_sats.empty:
        df_sats = df.copy()

    status_counts = df_sats["status"].value_counts().reset_index()
    status_counts.columns = ["Status", "Count"]

    color_map = {
        "ACTIVE": COLOR_SAFE,
        "HEALTHY": COLOR_SAFE,
        "INACTIVE": "#64748b",
        "DRIFTING": "#f59e0b",
        "DEBRIS": "#ea580c",
        "UNKNOWN": "#94a3b8",
        "CRITICAL": COLOR_CRITICAL
    }
    bar_colors = [color_map.get(s, "#3b82f6") for s in status_counts["Status"]]

    fig = go.Figure(
        data=[
            go.Bar(
                x=status_counts["Status"],
                y=status_counts["Count"],
                text=[f"<b>{c:,}</b>" for c in status_counts["Count"]],
                textposition="outside",
                marker_color=bar_colors,
                marker_line_color=BORDER_COLOR,
                marker_line_width=1,
                hovertemplate="<b>Status:</b> %{x}<br><b>Count:</b> %{y:,}<extra></extra>"
            )
        ]
    )

    apply_aerospace_layout(
        fig,
        title="Satellite Operational Status Classification",
        subtitle="Active Fleet vs. Defunct Derelicts & Unclassified Objects",
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title="Operational Status")
    fig.update_yaxes(title="Satellite Count", rangemode="tozero")
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# 2. STATISTICAL VISUALIZATIONS
# ══════════════════════════════════════════════════════════════════════════════

def create_correlation_heatmap(df: pd.DataFrame) -> go.Figure:
    """
    2A. Correlation Heatmap
    Computes Pearson correlation across valid physical numerical columns.
    Identifiers (id, ImageID, etc.) are strictly excluded.
    """
    valid_cols = ["altitude", "inclination", "eccentricity", "orbital_period", "velocity_mag", "mass"]
    cols_present = [c for c in valid_cols if c in df.columns and pd.to_numeric(df[c], errors="coerce").notnull().sum() > 2]

    if len(cols_present) < 2:
        fig = go.Figure()
        fig.add_annotation(text="Insufficient numerical orbital variables for correlation matrix", showarrow=False)
        return apply_aerospace_layout(fig, "Orbital Element Correlation Matrix")

    corr_df = df[cols_present].apply(pd.to_numeric, errors="coerce").corr().round(2)

    labels = {
        "altitude": "Altitude (km)",
        "inclination": "Inclination (°)",
        "eccentricity": "Eccentricity",
        "orbital_period": "Period (s)",
        "velocity_mag": "Velocity (km/s)",
        "mass": "Mass (kg)"
    }
    x_labels = [labels.get(c, c) for c in corr_df.columns]
    y_labels = [labels.get(c, c) for c in corr_df.index]

    text_vals = [[f"{val:.2f}" for val in row] for row in corr_df.values]

    fig = go.Figure(
        data=[
            go.Heatmap(
                z=corr_df.values,
                x=x_labels,
                y=y_labels,
                zmin=-1.0,
                zmax=1.0,
                colorscale="RdBu_r",
                text=text_vals,
                texttemplate="%{text}",
                textfont={"size": 11, "family": "Inter, sans-serif"},
                hoverongaps=False,
                hovertemplate="<b>%{y} vs %{x}</b><br>Correlation r: %{z:.2f}<extra></extra>"
            )
        ]
    )

    apply_aerospace_layout(
        fig,
        title="Orbital Mechanics Parameter Correlation Matrix",
        subtitle="Pearson r • Highlights Keplerian Constraints (e.g. Altitude vs Period r = +1.0)",
        height=420
    )
    return fig


def create_altitude_inclination_scatter(
    df: pd.DataFrame,
    color_by: str = "orbital_category",
    selected_id: Optional[str] = None
) -> go.Figure:
    """
    2B. Scatter Plot: Altitude vs Inclination
    X-axis: Altitude (km), Y-axis: Inclination (°), Color: Category.
    """
    df_plot = df.dropna(subset=["altitude", "inclination"]).copy()
    if df_plot.empty:
        fig = go.Figure()
        fig.add_annotation(text="No valid altitude/inclination records available", showarrow=False)
        return apply_aerospace_layout(fig, "Altitude vs Inclination Distribution")

    color_col = color_by if color_by in df_plot.columns else "orbital_category"

    fig = px.scatter(
        df_plot,
        x="altitude",
        y="inclination",
        color=color_col,
        color_discrete_map=CATEGORY_COLORS,
        hover_name="name",
        hover_data={"id": True, "altitude": ":.1f", "inclination": ":.2f", "object_type": True},
        opacity=0.75
    )

    # Highlight selected object
    if selected_id and (df_plot["id"] == selected_id).any():
        sel_row = df_plot[df_plot["id"] == selected_id].iloc[0]
        fig.add_trace(
            go.Scatter(
                x=[sel_row["altitude"]],
                y=[sel_row["inclination"]],
                mode="markers+text",
                marker=dict(size=14, color="#ef4444", symbol="star", line=dict(color="#ffffff", width=2)),
                text=[f"<b>{sel_row['name']}</b>"],
                textposition="top center",
                name="Selected Object",
                showlegend=True
            )
        )

    apply_aerospace_layout(
        fig,
        title="Orbital Altitude vs. Inclination Phase Space",
        subtitle="Clusters Reveal Launch Geometries & Mega-Constellation Orbital Shells",
        height=420
    )
    fig.update_xaxes(title="Orbital Altitude (km)")
    fig.update_yaxes(title="Orbital Inclination (° deg)")
    return fig


def create_altitude_boxplot(df: pd.DataFrame, category_filter: Optional[str] = None) -> go.Figure:
    """
    2C. Box Plot
    Compares altitude distributions between orbital categories with median, quartiles & outliers.
    """
    df_plot = df.dropna(subset=["altitude", "orbital_category"]).copy()
    if category_filter and category_filter != "ALL":
        df_plot = df_plot[df_plot["orbital_category"] == category_filter]

    fig = go.Figure()
    categories = [cat for cat in ["LEO", "MEO", "GEO", "HEO"] if cat in df_plot["orbital_category"].values]

    for cat in categories:
        sub = df_plot[df_plot["orbital_category"] == cat]
        fig.add_trace(
            go.Box(
                y=sub["altitude"],
                name=cat,
                boxpoints="outliers",
                marker_color=CATEGORY_COLORS.get(cat, "#3b82f6"),
                line_width=1.5,
                hovertemplate="<b>Category:</b> %{x}<br><b>Altitude:</b> %{y:.1f} km<extra></extra>"
            )
        )

    apply_aerospace_layout(
        fig,
        title="Orbital Altitude Spread & Outliers by Category",
        subtitle="Displays Median, Quartiles, Whisker Bounds, and High-Altitude Outliers",
        height=400
    )
    fig.update_xaxes(title="Orbital Classification")
    fig.update_yaxes(title="Altitude (km)")
    return fig


def create_population_area_chart(df: pd.DataFrame) -> go.Figure:
    """
    2D. Area Chart: Satellite & Object Population Over Time
    Uses actual timestamps if present; does NOT fabricate trends.
    """
    if "timestamp" in df.columns and df["timestamp"].notnull().sum() > 2:
        df_time = df.dropna(subset=["timestamp"]).sort_values("timestamp").copy()
        df_time["CumulativeCount"] = np.arange(1, len(df_time) + 1)

        fig = go.Figure(
            data=[
                go.Scatter(
                    x=df_time["timestamp"],
                    y=df_time["CumulativeCount"],
                    mode="lines",
                    line=dict(color="#2563eb", width=2),
                    fill="tozeroy",
                    fillcolor="rgba(37, 99, 235, 0.15)",
                    hovertemplate="<b>Epoch:</b> %{x}s<br><b>Tracked Objects:</b> %{y:,}<extra></extra>"
                )
            ]
        )
        subtitle_text = "Cumulative Catalog Growth across Surveillance Observation Epochs (Actual Timestamps)"
        x_title = "Surveillance Epoch Timestamp (seconds)"
    else:
        # Transparently explain when historical dates are not in snapshot
        fig = go.Figure()
        fig.add_annotation(
            text="No multi-year historical timestamp column found in this catalogue snapshot.<br>"
                 "<span style='font-size:11px;color:#64748b;'>Per system requirements, historical growth trends are not fabricated without true time-series records.</span>",
            showarrow=False,
            font=dict(size=12, color=NAVY)
        )
        subtitle_text = "Historical Multi-Year Trends Require Time-Series Database"
        x_title = "Timeline"

    apply_aerospace_layout(
        fig,
        title="Cumulative Tracked Population Growth",
        subtitle=subtitle_text,
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title=x_title)
    fig.update_yaxes(title="Cumulative Tracked Catalog Count")
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# 3. SPACE DEBRIS VISUALIZATIONS
# ══════════════════════════════════════════════════════════════════════════════

def create_debris_population_bar(df: pd.DataFrame) -> go.Figure:
    """
    3A. Debris Population Bar Chart
    Grouped by risk severity (CRITICAL, HIGH, MEDIUM, LOW).
    """
    df_deb = df[df["object_type"] == "DEBRIS"].copy()
    if df_deb.empty:
        df_deb = df.copy()

    counts = df_deb["risk_level"].value_counts().reset_index()
    counts.columns = ["Risk", "Count"]

    order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    counts["sort"] = counts["Risk"].apply(lambda r: order.index(r) if r in order else 9)
    counts = counts.sort_values("sort")

    colors = [RISK_COLORS.get(r, "#ea580c") for r in counts["Risk"]]

    fig = go.Figure(
        data=[
            go.Bar(
                x=counts["Risk"],
                y=counts["Count"],
                text=[f"<b>{c:,}</b>" for c in counts["Count"]],
                textposition="outside",
                marker_color=colors,
                marker_line_color=BORDER_COLOR,
                marker_line_width=1,
                hovertemplate="<b>Risk Tier:</b> %{x}<br><b>Fragments:</b> %{y:,}<extra></extra>"
            )
        ]
    )

    apply_aerospace_layout(
        fig,
        title="Space Debris Fragments by Risk Severity",
        subtitle=f"Total Tracked Fragments: {len(df_deb):,} • Critical Collision Hazards Screened",
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title="Collision Risk Tier")
    fig.update_yaxes(title="Debris Fragment Count", rangemode="tozero")
    return fig


def create_debris_altitude_histogram(df: pd.DataFrame, n_bins: int = 30) -> go.Figure:
    """
    3B. Debris Altitude Histogram
    Reveals dense debris shells (e.g. 550 km, 780-850 km Cosmos-1408 / 2251 clouds).
    """
    df_deb = df[df["object_type"] == "DEBRIS"].copy()
    if df_deb.empty:
        df_deb = df.copy()

    alts = df_deb["altitude"].dropna()

    fig = go.Figure(
        data=[
            go.Histogram(
                x=alts,
                nbinsx=n_bins,
                marker_color="#ea580c",
                marker_line_color="#ffffff",
                marker_line_width=1,
                opacity=0.85,
                hovertemplate="<b>Altitude Band:</b> %{x} km<br><b>Debris Density:</b> %{y:,} pieces<extra></extra>"
            )
        ]
    )

    # Mark major historical debris events
    peaks = [
        (550, "550 km Starlink Regime", "#6366f1"),
        (780, "Cosmos-2251 / Iridium (780 km)", "#dc2626"),
        (850, "Fengyun-1C Cloud (850 km)", "#d97706"),
    ]
    for p_alt, p_lbl, p_col in peaks:
        if alts.min() <= p_alt <= alts.max():
            fig.add_vline(
                x=p_alt,
                line_dash="dot",
                line_color=p_col,
                line_width=1.5,
                annotation_text=p_lbl,
                annotation_position="top right",
                annotation_font={"size": 9, "color": p_col}
            )

    apply_aerospace_layout(
        fig,
        title="Space Debris Altitude Distribution",
        subtitle=f"Identifies Congested Low Earth Orbit Altitude Shells ({len(alts):,} Catalogued Fragments)",
        height=380,
        show_legend=False
    )
    fig.update_xaxes(title="Altitude (km)")
    fig.update_yaxes(title="Fragment Frequency")
    return fig


def create_debris_donut(df: pd.DataFrame) -> go.Figure:
    """
    3C. Debris Distribution Donut Chart
    Categorized by risk level or apparent pixel size.
    """
    df_deb = df[df["object_type"] == "DEBRIS"].copy()
    if df_deb.empty:
        df_deb = df.copy()

    counts = df_deb["risk_level"].value_counts().reset_index()
    counts.columns = ["Risk", "Count"]

    colors = [RISK_COLORS.get(r, "#ea580c") for r in counts["Risk"]]

    fig = go.Figure(
        data=[
            go.Pie(
                labels=counts["Risk"],
                values=counts["Count"],
                hole=0.55,
                marker_colors=colors,
                marker_line=dict(color="#ffffff", width=2),
                textinfo="label+percent",
                textposition="inside",
                hovertemplate="<b>%{label} Risk</b><br>Fragments: %{value:,}<br>Share: %{percent}<extra></extra>"
            )
        ]
    )

    total = counts["Count"].sum()
    fig.add_annotation(
        text=f"<b>{total:,}</b><br><span style='font-size:10px;color:{SLATE_MUTED};'>DEBRIS</span>",
        x=0.5, y=0.5,
        font=dict(size=14, color=NAVY),
        showarrow=False
    )

    apply_aerospace_layout(
        fig,
        title="Debris Risk Classification Proportion",
        subtitle="Distribution of Critical, High, Medium & Low Hazard Fragments",
        height=380
    )
    return fig


def create_satellite_vs_debris_comparison(df: pd.DataFrame) -> go.Figure:
    """
    3D. Satellite vs Debris Comparison Chart
    Side-by-side grouped metrics comparing Satellites vs Debris.
    """
    sats = df[df["object_type"] == "SATELLITE"]
    debris = df[df["object_type"] == "DEBRIS"]

    categories = ["Total Population", "Mean Altitude (km)", "Mean Velocity (km/s)", "Inclination Spread (σ°)"]
    sat_vals = [
        len(sats),
        round(sats["altitude"].mean(), 1) if not sats.empty else 0.0,
        round(sats["velocity_mag"].mean(), 2) if "velocity_mag" in sats else 7.5,
        round(sats["inclination"].std(), 1) if not sats.empty else 0.0
    ]
    deb_vals = [
        len(debris),
        round(debris["altitude"].mean(), 1) if not debris.empty else 0.0,
        round(debris["velocity_mag"].mean(), 2) if "velocity_mag" in debris else 7.5,
        round(debris["inclination"].std(), 1) if not debris.empty else 0.0
    ]

    fig = go.Figure(
        data=[
            go.Bar(
                name="Operational Satellites",
                x=categories,
                y=sat_vals,
                text=[f"{v:,}" for v in sat_vals],
                textposition="outside",
                marker_color="#2563eb"
            ),
            go.Bar(
                name="Space Debris",
                x=categories,
                y=deb_vals,
                text=[f"{v:,}" for v in deb_vals],
                textposition="outside",
                marker_color="#ea580c"
            )
        ]
    )

    apply_aerospace_layout(
        fig,
        title="Comparative Analysis: Satellites vs Space Debris",
        subtitle="Direct Metric Comparison across Population, Mean Orbit, and Orbital Dispersion",
        height=400
    )
    fig.update_layout(barmode="group")
    fig.update_yaxes(title="Value (Metric-Dependent)", type="log")
    return fig


def create_debris_scatter(df: pd.DataFrame) -> go.Figure:
    """
    3E. Debris Altitude vs Inclination Scatter Plot
    Isolates debris fragments colored by risk severity.
    """
    df_deb = df[df["object_type"] == "DEBRIS"].dropna(subset=["altitude", "inclination"]).copy()
    if df_deb.empty:
        df_deb = df.copy()

    fig = px.scatter(
        df_deb,
        x="altitude",
        y="inclination",
        color="risk_level",
        color_discrete_map=RISK_COLORS,
        hover_name="name",
        hover_data={"id": True, "altitude": ":.1f", "inclination": ":.2f", "mass": ":.2f"},
        opacity=0.75
    )

    apply_aerospace_layout(
        fig,
        title="Debris Field Phase Space (Altitude vs. Inclination)",
        subtitle="Points Represent Detected Hypervelocity Fragments Colored by Collision Risk",
        height=420
    )
    fig.update_xaxes(title="Altitude (km)")
    fig.update_yaxes(title="Inclination (° deg)")
    return fig


def create_orbital_density_heatmap(df: pd.DataFrame, n_bins: int = 25) -> go.Figure:
    """
    3F. Orbital Region Density Visualization
    2D density distribution of Altitude vs. Inclination.
    """
    df_valid = df.dropna(subset=["altitude", "inclination"]).copy()

    fig = go.Figure(
        data=[
            go.Histogram2dContour(
                x=df_valid["altitude"],
                y=df_valid["inclination"],
                colorscale="Viridis",
                reversescale=False,
                nbinsx=n_bins,
                nbinsy=n_bins,
                contours=dict(coloring="heatmap", showlabels=True),
                hovertemplate="<b>Alt:</b> %{x:.0f} km<br><b>Inc:</b> %{y:.1f}°<br><b>Density:</b> %{z} objects<extra></extra>"
            )
        ]
    )

    apply_aerospace_layout(
        fig,
        title="Orbital Congestion Heatmap (2D Density Contour)",
        subtitle="Identifies High-Risk Spatial Intersections across Altitude and Orbital Inclination",
        height=420
    )
    fig.update_xaxes(title="Altitude (km)")
    fig.update_yaxes(title="Inclination (° deg)")
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# 4. ADVANCED ORBITAL VISUALIZATIONS (3D)
# ══════════════════════════════════════════════════════════════════════════════

def create_3d_earth_orbit(
    df_sats: pd.DataFrame,
    df_debris: pd.DataFrame,
    selected_id: Optional[str] = None,
    show_debris: bool = True,
    max_debris_points: int = 150
) -> go.Figure:
    """
    4A. 3D Earth Orbit Visualization using Plotly Graph Objects.
    Renders 3D Earth sphere, satellite markers, orbital trajectories, and debris cloud.
    """
    fig = go.Figure()

    # 1. 3D Earth Sphere
    u = np.linspace(0, 2 * np.pi, 45)
    v = np.linspace(0, np.pi, 25)
    x_earth = R_EARTH * np.outer(np.cos(u), np.sin(v))
    y_earth = R_EARTH * np.outer(np.sin(u), np.sin(v))
    z_earth = R_EARTH * np.outer(np.ones(np.size(u)), np.cos(v))

    # Clean Earth surface with oceanic-continental gradient
    earth_surface = go.Surface(
        x=x_earth, y=y_earth, z=z_earth,
        colorscale=[[0, "#082f49"], [0.45, "#0284c7"], [0.55, "#0369a1"], [0.85, "#15803d"], [1.0, "#ffffff"]],
        showscale=False,
        hoverinfo="skip",
        opacity=0.92,
        lighting=dict(ambient=0.8, diffuse=0.7, roughness=0.5, specular=0.1)
    )
    fig.add_trace(earth_surface)

    # 2. Sentinel Trajectory Orbit Line (Nominal 600 km, 53° Orbit)
    r_sent = R_EARTH + 600.0
    theta_orbit = np.linspace(0, 2 * np.pi, 120)
    inc_sent = math.radians(53.0)
    x_sent_orb = r_sent * np.cos(theta_orbit)
    y_sent_orb = r_sent * np.sin(theta_orbit) * math.cos(inc_sent)
    z_sent_orb = r_sent * np.sin(theta_orbit) * math.sin(inc_sent)

    fig.add_trace(
        go.Scatter3d(
            x=x_sent_orb, y=y_sent_orb, z=z_sent_orb,
            mode="lines",
            line=dict(color="#2563eb", width=4),
            name="SENTINEL Orbit (600 km)",
            hoverinfo="name"
        )
    )

    # Sentinel Asset Marker
    fig.add_trace(
        go.Scatter3d(
            x=[x_sent_orb[15]], y=[y_sent_orb[15]], z=[z_sent_orb[15]],
            mode="markers+text",
            marker=dict(size=8, color="#10b981", symbol="circle", line=dict(color="#ffffff", width=2)),
            text=["<b>SAT-01 'SENTINEL'</b>"],
            textposition="top center",
            name="SAT-01 (Protected Asset)",
            hovertemplate="<b>SAT-A34 'SENTINEL'</b><br>Altitude: 600 km<br>Inclination: 53.0°<extra></extra>"
        )
    )

    # 3. Reference Satellites (Active LEO / MEO / GEO)
    sats_with_coords = df_sats.dropna(subset=["position_x", "position_y", "position_z"]).head(25)
    if not sats_with_coords.empty:
        fig.add_trace(
            go.Scatter3d(
                x=sats_with_coords["position_x"],
                y=sats_with_coords["position_y"],
                z=sats_with_coords["position_z"],
                mode="markers",
                marker=dict(size=4.5, color="#38bdf8", symbol="circle"),
                text=sats_with_coords["name"],
                name="Active Satellites",
                hovertemplate="<b>%{text}</b><br>ECI X: %{x:.0f} km<br>ECI Y: %{y:.0f} km<br>ECI Z: %{z:.0f} km<extra></extra>"
            )
        )

    # 4. Debris Cloud Markers
    if show_debris and not df_debris.empty:
        debris_sub = df_debris.dropna(subset=["position_x", "position_y", "position_z"]).head(max_debris_points)
        if not debris_sub.empty:
            fig.add_trace(
                go.Scatter3d(
                    x=debris_sub["position_x"],
                    y=debris_sub["position_y"],
                    z=debris_sub["position_z"],
                    mode="markers",
                    marker=dict(size=2.8, color="#ea580c", opacity=0.7),
                    text=debris_sub["name"],
                    name=f"Debris Cloud ({len(debris_sub)} pts)",
                    hovertemplate="<b>%{text}</b><br>Alt: %{customdata:.1f} km<extra></extra>",
                    customdata=debris_sub["altitude"]
                )
            )

    # 5. Conjunction Hazard Orbit Line (DEBRIS #8871 Cosmos-1408, 65° Orbit)
    r_deb = R_EARTH + 600.0
    inc_deb = math.radians(65.0)
    x_deb_orb = r_deb * np.cos(theta_orbit + 0.15)
    y_deb_orb = r_deb * np.sin(theta_orbit + 0.15) * math.cos(inc_deb)
    z_deb_orb = r_deb * np.sin(theta_orbit + 0.15) * math.sin(inc_deb)

    fig.add_trace(
        go.Scatter3d(
            x=x_deb_orb, y=y_deb_orb, z=z_deb_orb,
            mode="lines",
            line=dict(color="#ef4444", width=3, dash="dash"),
            name="DEBRIS #8871 Hazard Vector",
            hoverinfo="name"
        )
    )

    # Camera and 3D Viewport Setup
    fig.update_layout(
        title={
            "text": "<b>3D Earth Orbit Visualization (ECI Frame)</b><br><span style='font-size:11px;color:#64748b;'>Deterministic Two-Body Orbital Elements • Plotly Graph Objects 3D Surface</span>",
            "font": {"size": 15, "color": NAVY},
            "x": 0.01, "y": 0.96
        },
        paper_bgcolor=BG_CARD,
        height=580,
        margin={"l": 10, "r": 10, "t": 60, "b": 10},
        scene=dict(
            xaxis=dict(title="X (km)", backgroundcolor=BG_PLOT, gridcolor=GRID_COLOR, showbackground=True),
            yaxis=dict(title="Y (km)", backgroundcolor=BG_PLOT, gridcolor=GRID_COLOR, showbackground=True),
            zaxis=dict(title="Z (km)", backgroundcolor=BG_PLOT, gridcolor=GRID_COLOR, showbackground=True),
            camera=dict(
                eye=dict(x=1.35, y=1.35, z=1.15),
                up=dict(x=0, y=0, z=1)
            ),
            aspectmode="data"
        ),
        legend=dict(
            bgcolor="rgba(255,255,255,0.85)",
            bordercolor=GRID_COLOR,
            borderwidth=1,
            x=0.01, y=0.01
        )
    )
    return fig


def create_orbital_trajectory_comparison(
    df: pd.DataFrame,
    sat_name: str = "SAT-A34 'SENTINEL'",
    deb_name: str = "DEBRIS #8871 (Cosmos-1408)"
) -> go.Figure:
    """
    4B. Orbital Trajectory Visualization
    Displays side-by-side or overlaid 3D orbits of protected satellite vs candidate debris.
    """
    fig = go.Figure()

    theta = np.linspace(0, 2 * np.pi, 180)

    # Orbit 1: Protected Satellite (LEO, 600km, 53°)
    r1 = R_EARTH + 600.0
    inc1 = math.radians(53.0)
    x1 = r1 * np.cos(theta)
    y1 = r1 * np.sin(theta) * math.cos(inc1)
    z1 = r1 * np.sin(theta) * math.sin(inc1)

    fig.add_trace(
        go.Scatter3d(
            x=x1, y=y1, z=z1,
            mode="lines",
            line=dict(color="#2563eb", width=4),
            name=f"Protected: {sat_name}"
        )
    )

    # Orbit 2: Debris (600km, 65° intersecting inclination)
    r2 = R_EARTH + 600.0
    inc2 = math.radians(65.0)
    raan2 = math.radians(35.0)
    x2 = r2 * (np.cos(theta) * math.cos(raan2) - np.sin(theta) * math.sin(raan2) * math.cos(inc2))
    y2 = r2 * (np.cos(theta) * math.sin(raan2) + np.sin(theta) * math.cos(raan2) * math.cos(inc2))
    z2 = r2 * (np.sin(theta) * math.sin(inc2))

    fig.add_trace(
        go.Scatter3d(
            x=x2, y=y2, z=z2,
            mode="lines",
            line=dict(color="#ef4444", width=4, dash="dash"),
            name=f"Hazard: {deb_name}"
        )
    )

    # Intersection Conjunction Point
    fig.add_trace(
        go.Scatter3d(
            x=[x1[45]], y=[y1[45]], z=[z1[45]],
            mode="markers+text",
            marker=dict(size=10, color="#dc2626", symbol="diamond"),
            text=["<b>PREDICTED CONJUNCTION POINT</b>"],
            textposition="top center",
            name="CPA Conjunction Point"
        )
    )

    fig.update_layout(
        title={
            "text": "<b>Orbital Trajectory Plane Intersection Comparison</b><br><span style='font-size:11px;color:#64748b;'>Comparing Nominal Asset Orbit vs Conjunction Hazard Orbital Ephemeris</span>",
            "font": {"size": 15, "color": NAVY},
            "x": 0.01, "y": 0.96
        },
        paper_bgcolor=BG_CARD,
        height=500,
        margin={"l": 10, "r": 10, "t": 60, "b": 10},
        scene=dict(
            xaxis=dict(title="X (km)", backgroundcolor=BG_PLOT, gridcolor=GRID_COLOR),
            yaxis=dict(title="Y (km)", backgroundcolor=BG_PLOT, gridcolor=GRID_COLOR),
            zaxis=dict(title="Z (km)", backgroundcolor=BG_PLOT, gridcolor=GRID_COLOR),
            aspectmode="data"
        )
    )
    return fig


def create_satellite_proximity_ric() -> go.Figure:
    """
    4C. Satellite Proximity Visualization (RIC Local Vertical Local Horizontal Frame).
    Relative encounter view centered on Sentinel (0, 0, 0) with closest approach marker.
    """
    times = np.linspace(-30.0, 30.0, 121)
    
    # Relative motion in RIC frame:
    # Radial (R), In-Track (T), Cross-Track (W)
    v_rel = 8.12  # km/s
    t_pos = times * v_rel  # km
    r_pos = 0.0128 * np.cos(times * 0.1)  # small oscillation
    w_pos = times * 0.45

    fig = go.Figure()

    # Debris Trajectory relative to Sentinel
    fig.add_trace(
        go.Scatter(
            x=t_pos,
            y=r_pos,
            mode="lines",
            line=dict(color="#ef4444", width=3),
            name="Incoming Debris Trajectory"
        )
    )

    # Sentinel Asset (Center)
    fig.add_trace(
        go.Scatter(
            x=[0], y=[0],
            mode="markers+text",
            marker=dict(size=14, color="#2563eb", symbol="circle", line=dict(color="#ffffff", width=2)),
            text=["<b>SAT-01 'SENTINEL'</b>"],
            textposition="top right",
            name="Sentinel Asset (Center)"
        )
    )

    # CPA Point
    fig.add_trace(
        go.Scatter(
            x=[0], y=[0.0128],
            mode="markers+text",
            marker=dict(size=12, color="#dc2626", symbol="x", line=dict(color="#dc2626", width=2.5)),
            text=["<b>CPA: 12.8m @ T+0s</b>"],
            textposition="bottom center",
            name="Predicted CPA (d = 12.8m)"
        )
    )

    # Screening Threshold Bubble
    fig.add_shape(
        type="circle",
        xref="x", yref="y",
        x0=-25.0, y0=-25.0, x1=25.0, y1=25.0,
        line=dict(color="#dc2626", width=1.5, dash="dash"),
        fillcolor="rgba(239, 68, 68, 0.06)"
    )

    apply_aerospace_layout(
        fig,
        title="Asset-Centered Proximity Encounter (Radial vs. In-Track)",
        subtitle="Relative RIC Coordinate Frame • Red Circle Marks 25 km Screening Boundary",
        height=420
    )
    fig.update_xaxes(title="In-Track Separation ΔT (km)", range=[-60, 60])
    fig.update_yaxes(title="Radial Separation ΔR (km)", range=[-30, 30])
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# 5. COLLISION AVOIDANCE CHARTS
# ══════════════════════════════════════════════════════════════════════════════

def create_distance_vs_time_chart(sim_data: Dict[str, Any]) -> go.Figure:
    """
    5A. Distance vs Time Graph
    Shows pre-manoeuvre collision plunge vs post-manoeuvre clearance and 25km gate.
    """
    times = sim_data["times"]
    dist_unmitigated = sim_data["dist_unmitigated"]
    dist_opt_a = sim_data["dist_opt_a"]
    gate = sim_data["screening_gate_km"]

    fig = go.Figure()

    # Pre-maneuver unmitigated trajectory
    fig.add_trace(
        go.Scatter(
            x=times,
            y=dist_unmitigated,
            mode="lines",
            line=dict(color="#ef4444", width=3),
            name="Pre-Manoeuvre Trajectory (Collision Plunge)",
            hovertemplate="Time: %{x:.1f}s<br>Range: %{y:.2f} km<extra></extra>"
        )
    )

    # Post-maneuver trajectory (Option A Prograde Burn)
    fig.add_trace(
        go.Scatter(
            x=times,
            y=dist_opt_a,
            mode="lines",
            line=dict(color="#10b981", width=3, dash="solid"),
            name="Post-Manoeuvre Option A (+5.0 m/s Prograde)",
            hovertemplate="Time: %{x:.1f}s<br>Range: %{y:.2f} km<extra></extra>"
        )
    )

    # 25 km Screening Boundary Reference Line
    fig.add_hline(
        y=gate,
        line_dash="dot",
        line_color="#dc2626",
        line_width=2,
        annotation_text="Screening Boundary (25.0 km)",
        annotation_position="top left",
        annotation_font=dict(color="#dc2626", size=10)
    )

    # Highlight CPA Point on unmitigated trajectory
    fig.add_trace(
        go.Scatter(
            x=[0],
            y=[sim_data["cpa_unmitigated_km"]],
            mode="markers+text",
            marker=dict(size=12, color="#b91c1c", symbol="diamond"),
            text=["<b>CPA: 12.8m (COLLISION)</b>"],
            textposition="top center",
            name="Pre-Manoeuvre CPA"
        )
    )

    # Highlight Post-Maneuver Clearance at t=0
    fig.add_trace(
        go.Scatter(
            x=[0],
            y=[30.57],
            mode="markers+text",
            marker=dict(size=12, color="#059669", symbol="circle"),
            text=["<b>Post-Burn CPA: 30.57 km (SAFE)</b>"],
            textposition="top center",
            name="Post-Manoeuvre CPA"
        )
    )

    apply_aerospace_layout(
        fig,
        title="Separation Distance vs. Simulation Time (t_CPA = 0s)",
        subtitle="Contrasting Unmitigated Collision Vector with Proactive Autonomous RCS Avoidance Burn",
        height=420
    )
    fig.update_xaxes(title="Simulation Time Relative to CPA (seconds)", zeroline=True)
    fig.update_yaxes(title="Relative Separation Distance (km)", rangemode="tozero")
    return fig


def create_relative_velocity_chart(sim_data: Dict[str, Any]) -> go.Figure:
    """
    5B. Relative Velocity Chart
    Displays relative velocity profile during the close approach simulation.
    """
    times = sim_data["times"]
    vel_unmit = sim_data["vel_unmitigated"]
    vel_opt_a = sim_data["vel_opt_a"]

    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=times,
            y=vel_unmit,
            mode="lines",
            line=dict(color="#ef4444", width=2.5),
            name="Pre-Manoeuvre Relative Velocity (8.12 km/s)"
        )
    )

    fig.add_trace(
        go.Scatter(
            x=times,
            y=vel_opt_a,
            mode="lines",
            line=dict(color="#10b981", width=2.5, dash="dash"),
            name="Post-Manoeuvre Relative Velocity"
        )
    )

    apply_aerospace_layout(
        fig,
        title="Hypervelocity Relative Speed Profile",
        subtitle="Encounter Closing Velocity of 8.12 km/s (Mach 24.3)",
        height=380
    )
    fig.update_xaxes(title="Simulation Time (s)")
    fig.update_yaxes(title="Relative Velocity (km/s)", range=[7.8, 8.5])
    return fig


def create_maneuver_comparison_chart(sim_data: Dict[str, Any]) -> go.Figure:
    """
    5C. Manoeuvre Comparison Chart
    Compares Original trajectory with Manoeuvre Options A, B, and C.
    Displays resulting separation (km) and delta-V (m/s).
    """
    options = sim_data["maneuver_options"]

    names = ["Original (No Burn)"] + [opt["name"] for opt in options]
    separations = [0.0128] + [opt["resulting_d_cpa_km"] for opt in options]
    delta_vs = [0.0] + [opt["delta_v_ms"] for opt in options]
    colors = ["#ef4444", "#10b981", "#0284c7", "#f59e0b"]

    fig = go.Figure()

    # Bar 1: Resulting d_CPA (Clearance)
    fig.add_trace(
        go.Bar(
            name="Resulting d_CPA Clearance (km)",
            x=names,
            y=separations,
            text=[f"<b>{s:.1f} km</b>" for s in separations],
            textposition="outside",
            marker_color=colors
        )
    )

    # Bar 2: Delta-V Required
    fig.add_trace(
        go.Bar(
            name="Required ΔV (m/s)",
            x=names,
            y=delta_vs,
            text=[f"{dv:.1f} m/s" for dv in delta_vs],
            textposition="outside",
            marker_color="#94a3b8"
        )
    )

    # 25 km threshold line
    fig.add_hline(
        y=25.0,
        line_dash="dot",
        line_color="#dc2626",
        line_width=1.5,
        annotation_text="25 km Safety Threshold",
        annotation_position="top left",
        annotation_font=dict(color="#dc2626", size=10)
    )

    apply_aerospace_layout(
        fig,
        title="Avoidance Maneuver Candidate Trade Study",
        subtitle="Comparing Clearance Distance (km) vs. Propellant ΔV Cost (m/s)",
        height=420
    )
    fig.update_layout(barmode="group")
    fig.update_yaxes(title="Value (km / m/s)", rangemode="tozero")
    return fig


def create_risk_indicator_gauge(cpa_km: float = 0.0128, threshold_km: float = 25.0) -> go.Figure:
    """
    5D. Risk Indicator Gauge
    Visual indicator of proximity category with configurable threshold.
    Explicitly labeled as a prototype simulation assessment.
    """
    fig = go.Figure(
        go.Indicator(
            mode="gauge+number+delta",
            value=cpa_km,
            domain={"x": [0, 1], "y": [0, 1]},
            title={
                "text": "<b>Proximity Clearance vs. 25km Safety Gate</b><br><span style='font-size:10px;color:#64748b;'>*Prototype simulation assessment for demonstration, not an operational collision probability.</span>",
                "font": {"size": 13, "color": NAVY}
            },
            delta={"reference": threshold_km, "increasing": {"color": "#10b981"}, "decreasing": {"color": "#ef4444"}},
            number={"suffix": " km", "font": {"size": 32, "color": NAVY}},
            gauge={
                "axis": {"range": [0, 50], "tickwidth": 1, "tickcolor": NAVY, "ticksuffix": "km"},
                "bar": {"color": "#ef4444" if cpa_km < 1.0 else ("#f59e0b" if cpa_km < threshold_km else "#10b981"), "thickness": 0.45},
                "bgcolor": BG_PLOT,
                "borderwidth": 1,
                "bordercolor": GRID_COLOR,
                "steps": [
                    {"range": [0, 1], "color": "rgba(239, 68, 68, 0.35)"},      # CRITICAL
                    {"range": [1, threshold_km], "color": "rgba(245, 158, 11, 0.25)"}, # WARNING
                    {"range": [threshold_km, 40], "color": "rgba(14, 165, 233, 0.2)"},# MONITORED
                    {"range": [40, 50], "color": "rgba(16, 185, 129, 0.25)"}    # SAFE
                ],
                "threshold": {
                    "line": {"color": "#dc2626", "width": 4},
                    "thickness": 0.8,
                    "value": threshold_km
                }
            }
        )
    )

    fig.update_layout(
        paper_bgcolor=BG_CARD,
        height=280,
        margin={"l": 30, "r": 30, "t": 60, "b": 25},
        font={"family": "Inter, sans-serif"}
    )
    return fig
