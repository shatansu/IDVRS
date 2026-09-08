import os
import sys
from pathlib import Path

# Add Backend root directory to sys.path so 'app' package imports work cleanly
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
