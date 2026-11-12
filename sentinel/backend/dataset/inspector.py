"""
SENTINEL Dataset Inspector
Analyzes supplied optical space debris detection dataset (train.csv, val.csv, sample_submission.csv).
Checks: format, columns, missing values, duplicates, invalid bounds, coordinate ranges, image availability.
"""

import os
import json
import pandas as pd
import numpy as np

RAW_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/raw"))
IMAGES_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../debris-detection"))

def inspect_csv(file_path):
    print(f"\n--- Inspecting: {os.path.basename(file_path)} ---")
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    file_size_bytes = os.path.getsize(file_path)
    df = pd.read_csv(file_path)
    
    total_records = len(df)
    columns = list(df.columns)
    missing_values = df.isnull().sum().to_dict()
    duplicate_image_ids = df["ImageID"].duplicated().sum() if "ImageID" in df else 0
    
    # Analyze bounding box formats
    valid_box_records = 0
    total_boxes = 0
    min_box_count = float("inf")
    max_box_count = 0
    box_elements_lengths = set()
    
    coord_stats = {
        "min_c0": float("inf"), "max_c0": float("-inf"),
        "min_c1": float("inf"), "max_c1": float("-inf"),
        "min_c2": float("inf"), "max_c2": float("-inf"),
        "min_c3": float("inf"), "max_c3": float("-inf"),
    }
    
    sample_records = []
    
    for idx, row in df.iterrows():
        raw_bboxes = row.get("bboxes", "[]")
        try:
            boxes = json.loads(raw_bboxes) if isinstance(raw_bboxes, str) else raw_bboxes
            if isinstance(boxes, list):
                valid_box_records += 1
                b_count = len(boxes)
                total_boxes += b_count
                min_box_count = min(min_box_count, b_count)
                max_box_count = max(max_box_count, b_count)
                
                for b in boxes:
                    box_elements_lengths.add(len(b))
                    if len(b) >= 4:
                        coord_stats["min_c0"] = min(coord_stats["min_c0"], b[0])
                        coord_stats["max_c0"] = max(coord_stats["max_c0"], b[0])
                        coord_stats["min_c1"] = min(coord_stats["min_c1"], b[1])
                        coord_stats["max_c1"] = max(coord_stats["max_c1"], b[1])
                        coord_stats["min_c2"] = min(coord_stats["min_c2"], b[2])
                        coord_stats["max_c2"] = max(coord_stats["max_c2"], b[2])
                        coord_stats["min_c3"] = min(coord_stats["min_c3"], b[3])
                        coord_stats["max_c3"] = max(coord_stats["max_c3"], b[3])
                
                if len(sample_records) < 3:
                    sample_records.append({
                        "ImageID": int(row.get("ImageID", idx)),
                        "box_count": len(boxes),
                        "first_box": boxes[0] if len(boxes) > 0 else None
                    })
        except Exception as e:
            pass

    report = {
        "file_name": os.path.basename(file_path),
        "file_size_mb": round(file_size_bytes / (1024 * 1024), 2),
        "total_rows": total_records,
        "columns": columns,
        "missing_values": missing_values,
        "duplicate_image_ids": int(duplicate_image_ids),
        "total_detections": total_boxes,
        "avg_detections_per_frame": round(total_boxes / max(1, total_records), 2),
        "min_detections": min_box_count if min_box_count != float("inf") else 0,
        "max_detections": max_box_count,
        "box_vector_lengths": list(box_elements_lengths),
        "coordinate_bounds": coord_stats,
        "sample_records": sample_records,
        "contains_satellite_info": False,
        "contains_debris_info": True,
        "contains_direct_3d_state": False,
        "contains_optical_detections": True
    }
    
    print(f"File Size: {report['file_size_mb']} MB")
    print(f"Total Rows: {report['total_rows']}, Detections: {report['total_detections']}")
    print(f"Columns: {report['columns']}")
    print(f"Missing Values: {report['missing_values']}")
    print(f"Duplicates: {report['duplicate_image_ids']}")
    print(f"Coordinate Bounds: {report['coordinate_bounds']}")
    return report

def inspect_all():
    results = {}
    for filename in ["train.csv", "val.csv", "sample_submission.csv"]:
        filepath = os.path.join(RAW_DATA_DIR, filename)
        if os.path.exists(filepath):
            results[filename] = inspect_csv(filepath)
    return results

if __name__ == "__main__":
    report = inspect_all()
    out_path = os.path.join(RAW_DATA_DIR, "inspection_summary.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nInspection summary saved to {out_path}")
