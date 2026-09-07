"""
Handwriting & Document Classification Detector
==============================================
Conservatively analyzes document images to classify content into:
- 'printed': Clean, digital or uniform printed typography
- 'handwritten': Primarily cursive handwritten text
- 'mixed': Printed/ruled register forms with handwritten entries and annotations (first-class)
- 'unknown': Low quality, blurred, or inconclusive
"""

import cv2
import numpy as np
import logging
from PIL import Image
from typing import Union

logger = logging.getLogger("app.pipeline.handwriting_detector")


def classify_image_content(image_input: Union[str, Image.Image, np.ndarray]) -> tuple[str, dict]:
    """
    Analyzes visual features of an image to classify whether it is
    printed, handwritten, mixed, or unknown.

    Returns:
        tuple (classification, metrics_dict)
        classification is in {'printed', 'handwritten', 'mixed', 'unknown'}
    """
    try:
        # 1. Normalize input to grayscale numpy array
        if isinstance(image_input, str):
            cv_img = cv2.imread(image_input)
            if cv_img is None:
                return "unknown", {"reason": "failed_to_read_image"}
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        elif isinstance(image_input, Image.Image):
            rgb = np.array(image_input.convert("RGB"))
            gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        elif isinstance(image_input, np.ndarray):
            if len(image_input.shape) == 3:
                gray = cv2.cvtColor(image_input, cv2.COLOR_BGR2GRAY)
            else:
                gray = image_input
        else:
            return "unknown", {"reason": "invalid_input_type"}

        h, w = gray.shape[:2]
        if h < 50 or w < 50:
            return "unknown", {"reason": "image_too_small"}

        # Resize to standard height for consistent morphological analysis (height=1200)
        target_h = 1200
        scale = target_h / float(h)
        scaled_w = int(w * scale)
        resized = cv2.resize(gray, (scaled_w, target_h), interpolation=cv2.INTER_AREA)

        # 2. Otsu thresholding
        _, binary = cv2.threshold(resized, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # 3. Detect Table / Form Grid Lines (Horizontal & Vertical)
        # Horizontal lines
        h_kernel_len = max(20, scaled_w // 40)
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
        h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
        h_line_pixels = cv2.countNonZero(h_lines)

        # Vertical lines
        v_kernel_len = max(20, target_h // 40)
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_kernel_len))
        v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
        v_line_pixels = cv2.countNonZero(v_lines)

        total_pixels = float(target_h * scaled_w)
        grid_line_ratio = (h_line_pixels + v_line_pixels) / total_pixels
        has_form_grid = grid_line_ratio > 0.008  # Presence of register table lines

        # 4. Remove grid lines to isolate text strokes
        table_mask = cv2.bitwise_or(h_lines, v_lines)
        text_only = cv2.subtract(binary, table_mask)

        # 5. Connected Component & Contour Analysis on text strokes
        contours, _ = cv2.findContours(text_only, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        valid_contours = []
        stroke_densities = []
        aspect_ratios = []

        for c in contours:
            area = cv2.contourArea(c)
            # Filter noise and large border artifacts
            if 15 < area < (scaled_w * target_h * 0.05):
                bx, by, bw, bh = cv2.boundingRect(c)
                if bh > 4 and bw > 4:
                    valid_contours.append(c)
                    aspect_ratios.append(float(bw) / float(bh))
                    hull = cv2.convexHull(c)
                    hull_area = cv2.contourArea(hull)
                    solidity = float(area) / hull_area if hull_area > 0 else 0
                    stroke_densities.append(solidity)

        num_components = len(valid_contours)
        if num_components < 10:
            return "unknown", {"reason": "insufficient_text_components", "components": num_components}

        # Measure variance in aspect ratio and stroke density
        # Handwritten cursive Devanagari exhibits significantly higher variance in component dimensions
        ar_std = float(np.std(aspect_ratios)) if aspect_ratios else 0.0
        solidity_mean = float(np.mean(stroke_densities)) if stroke_densities else 0.0
        solidity_std = float(np.std(stroke_densities)) if stroke_densities else 0.0

        metrics = {
            "components": num_components,
            "grid_line_ratio": round(grid_line_ratio, 4),
            "has_form_grid": has_form_grid,
            "aspect_ratio_std": round(ar_std, 3),
            "solidity_mean": round(solidity_mean, 3),
            "solidity_std": round(solidity_std, 3),
        }

        # 6. Classification Decision (Conservative & favoring mixed for land registers)
        # High irregularity + table grid = mixed (e.g. government register with handwritten entries)
        if has_form_grid and (ar_std > 0.85 or solidity_std > 0.14):
            classification = "mixed"
        elif not has_form_grid and (ar_std > 0.95 or solidity_std > 0.16):
            classification = "handwritten"
        elif ar_std < 0.65 and solidity_std < 0.11:
            classification = "printed"
        else:
            # Conservative rule: if table grid is detected, classify as mixed; otherwise printed
            classification = "mixed" if has_form_grid else "printed"

        logger.info(f"Document classified as '{classification}' (metrics: {metrics})")
        return classification, metrics

    except Exception as exc:
        logger.warning(f"Error during handwriting detection: {exc}. Defaulting to 'unknown'.")
        return "unknown", {"error": str(exc)}
