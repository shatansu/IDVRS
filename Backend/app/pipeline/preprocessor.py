import cv2
import numpy as np
import logging
from PIL import Image

logger = logging.getLogger("app.pipeline.preprocessor")

def deskew(image: np.ndarray) -> np.ndarray:
    """
    Detects skew angle and rotates the image to align horizontally.
    """
    try:
        # If image is RGB, convert to grayscale for angle detection
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        # Invert colors: text becomes white, background black
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]

        # Find coordinates of all foreground pixels
        coords = np.column_stack(np.where(thresh > 0))
        if coords.size == 0:
            return image

        # Determine minimum bounding box
        angle = cv2.minAreaRect(coords)[-1]
        
        # Determine correct angle
        if angle < -45:
            angle = -(90 + angle)
        elif angle > 45:
            angle = 90 - angle
        else:
            angle = -angle

        # If angle is very small, no rotation needed
        if abs(angle) < 0.5 or abs(angle) > 45:
            return image

        # Rotate image around center
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            image,
            M,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        return rotated
    except Exception as exc:
        logger.warning(f"Deskew failed, returning original image: {exc}")
        return image

def preprocess_image(image_input) -> np.ndarray:
    """
    Executes OpenCV image preprocessing pipeline:
    1. Convert to grayscale
    2. Denoise with fastNlMeans
    3. Adaptive thresholding / Otsu binarization
    4. Deskew correction
    5. Resolution scaling if resolution is low
    """
    # Convert input to numpy array if PIL Image or file path
    if isinstance(image_input, str):
        img = cv2.imread(image_input)
        if img is None:
            raise ValueError(f"Could not load image from path: {image_input}")
    elif isinstance(image_input, Image.Image):
        img = cv2.cvtColor(np.array(image_input), cv2.COLOR_RGB2BGR)
    elif isinstance(image_input, np.ndarray):
        img = image_input.copy()
    else:
        raise TypeError(f"Unsupported image input type: {type(image_input)}")

    # 1. Grayscale
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    # 2. Resize / upscale if low resolution (< 1200px width)
    h, w = gray.shape[:2]
    if w < 1200:
        scale = 1200 / float(w)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # 3. Denoise (fastNlMeans)
    try:
        denoised = cv2.fastNlMeansDenoising(gray, h=10)
    except Exception as exc:
        logger.warning(f"fastNlMeansDenoising failed: {exc}, using GaussianBlur")
        denoised = cv2.GaussianBlur(gray, (3, 3), 0)

    # 4. Adaptive Thresholding / Otsu binarization
    # Otsu threshold with slight Gaussian blur is effective for printed Hindi texts
    blurred = cv2.GaussianBlur(denoised, (3, 3), 0)
    binarized = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    # 5. Deskew
    deskewed = deskew(binarized)

    return deskewed
