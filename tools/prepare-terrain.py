"""Build a small, reproducible Mars terrain grid; no Python dependencies at runtime."""
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.local' / 'terrain-python'))
import hashlib
import json
from datetime import datetime, timezone
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform, Resampling

BASE_LON, BASE_LAT, RADIUS = 77.4298, 18.4663, 3396190
SOURCE_URL = 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
SOURCE_PAGE = 'https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic'
STEP, X_MIN, Y_MAX, COLS, ROWS = 40, -4800, 4800, 240, 280
source_file = ROOT / '.local' / 'M20_JezeroCrater_CTXDEM_20m.tif'
local_crs = CRS.from_proj4(f'+proj=eqc +lat_ts={BASE_LAT} +lat_0={BASE_LAT} +lon_0={BASE_LON} +R={RADIUS} +units=m +no_defs')
geo_crs = CRS.from_proj4(f'+proj=longlat +R={RADIUS} +no_defs')
anchor_x, anchor_y = transform(geo_crs, local_crs, [BASE_LON], [BASE_LAT])
assert abs(anchor_x[0]) < 1e-5 and abs(anchor_y[0]) < 1e-5
grid = np.full((ROWS, COLS), np.nan, dtype=np.float32)
with rasterio.open(source_file) as source:
    print(json.dumps({'source_dimensions': [source.width, source.height], 'source_crs': source.crs.to_string(), 'source_resolution': source.res, 'nodata': source.nodata}))
    reproject(source=rasterio.band(source, 1), destination=grid,
              src_transform=source.transform, src_crs=source.crs, src_nodata=source.nodata,
              dst_transform=from_origin(X_MIN, Y_MAX, STEP, STEP), dst_crs=local_crs,
              dst_nodata=np.nan, resampling=Resampling.bilinear)
    source_crs = source.crs.to_wkt()
    source_resolution = list(source.res)

# Central differences in metres. Unknown data and the derivative perimeter stay blocked.
dy, dx = np.gradient(grid, STEP, STEP)
slopes = np.degrees(np.arctan(np.hypot(dx, dy)))
valid = np.isfinite(grid) & np.isfinite(slopes)
for dr, dc in [(0,1),(0,-1),(1,0),(-1,0)]:
    valid &= np.roll(np.isfinite(grid), (dr, dc), axis=(0,1))
valid[[0,-1], :] = False
valid[:, [0,-1]] = False
def values(array):
    return [round(float(v), 2) if ok else None for v, ok in zip(array.ravel(), valid.ravel())]
output = {
    'id': 'USGS_Mars2020_CTXDEM_20m_Jezero_local40m',
    'title': 'Mars 2020 Science Investigation CTX DEM Mosaic — local planning subset',
    'sourceUrl': SOURCE_URL, 'sourcePage': SOURCE_PAGE,
    'sourceSha256': hashlib.sha256(source_file.read_bytes()).hexdigest(),
    'preparedAt': datetime.now(timezone.utc).isoformat(),
    'origin': {'lon': BASE_LON, 'lat': BASE_LAT, 'radiusMeters': RADIUS},
    'sourceResolutionMeters': source_resolution, 'sourceCrsWkt': source_crs,
    'localCrsWkt': local_crs.to_wkt(), 'verticalReference': 'As distributed by the USGS source product; elevations are not rover-local heights.',
    'step': STEP, 'xMin': X_MIN, 'yMax': Y_MAX, 'cols': COLS, 'rows': ROWS,
    'resampling': 'Bilinear elevation sampling to a local 40 m grid; slope from central differences in metres across neighboring centers separated by 80 m.',
    'validCells': int(valid.sum()), 'unknownCells': int((~valid).sum()),
    'limits': 'Historical orbital terrain. Derived slopes span an 80 m central-difference baseline on a 40 m grid; smaller landforms can be missed. Distances are planimetric, not three-dimensional walking lengths. No detection of rocks or hazards below the source resolution. Threshold and route-cost weights are prototype assumptions, not NASA EVA limits. Absolute alignment with CTX imagery is not independently validated.',
    'elevations': values(grid), 'slopes': values(slopes)
}
target = ROOT / 'dist' / 'assets' / 'jezero-terrain.json'
target.write_text(json.dumps(output, separators=(',', ':'), allow_nan=False), encoding='utf-8')
print(json.dumps({'output': str(target), 'bytes': target.stat().st_size, 'valid_cells': output['validCells'], 'max_slope': float(np.nanmax(slopes)), 'valid_percent': round(float(valid.mean()*100), 2)}))

# Preserve the original waypoint record as the target's machine-readable source.
waypoints_file = ROOT / '.local' / 'M20_waypoints.json'
if waypoints_file.exists():
    data = json.loads(waypoints_file.read_text(encoding='utf-8-sig'))
    selected = [f for f in data['features'] if f['properties'].get('RMC') == '7_0']
    assert len(selected) == 1, 'NASA Rochette waypoint must be uniquely identifiable'
    (ROOT / 'dist' / 'assets' / 'rochette-waypoint.geojson').write_text(json.dumps({
        'type': 'FeatureCollection', 'source': 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
        'features': selected
    }, indent=2), encoding='utf-8')
