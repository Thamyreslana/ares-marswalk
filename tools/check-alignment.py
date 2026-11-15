"""Independent image/terrain alignment check for ARES (python tools/check-alignment.py).
Needs the reference ortho and raw DEM in .local/ (see dist/alignment-check.md) and rasterio from
.local/terrain-python. Writes dist/assets/alignment-measurement.json.
Reference: USGS Mars 2020 TRN CTX orthomosaic (JEZ_ctx_B_soc_008, 6 m), resampled by GDAL/rasterio.
Compares (1) the CTX tiles ARES displays, (2) the ARES 40 m DEM grid and (3) the raw USGS 20 m DEM
against that reference with normalized cross-correlation over planar shifts."""
import sys, json, math
from pathlib import Path
root = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(root / '.local' / 'terrain-python'))
import warnings; warnings.filterwarnings('ignore', module='rasterio')
import numpy as np, rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
R, LON0, LAT0 = 3396190, 77.4298, 18.4663
K = math.cos(math.radians(LAT0))
local = CRS.from_proj4(f'+proj=eqc +lat_ts={LAT0} +lat_0={LAT0} +lon_0={LON0} +R={R} +units=m +no_defs')
RES, W, SH = 10, 2400, 30           # 10 m pixels, 2.4 km window, shifts up to +/-300 m
N = W // RES; M = N + 2 * SH
def to_xy(lon, lat): return (math.radians(lon - LON0) * R * K, math.radians(lat - LAT0) * R)
def warp(path, x0, y0, n, resampling):
    out = np.full((n, n), np.nan, np.float32)
    with rasterio.open(path) as s:
        reproject(rasterio.band(s, 1), out, src_transform=s.transform, src_crs=s.crs, src_nodata=s.nodata,
                  dst_transform=from_origin(x0, y0, RES, RES), dst_crs=local, dst_nodata=np.nan, resampling=resampling)
    return out
# ARES CTX tiles (as displayed): plate carree level 12, 256 px tiles, file row = 4095 - row
tiles = {}
def tile(tx, ty):
    if (tx, ty) not in tiles:
        p = root / 'dist' / 'assets' / 'tiles' / f'jezero-ctx-12-{tx}-{4095 - ty}.png'
        if p.exists():
            with rasterio.open(p) as s: tiles[(tx, ty)] = s.read(1).astype(np.float32)
        else: tiles[(tx, ty)] = None
    return tiles[(tx, ty)]
def ares_ctx(x0, y0, n, shift=(0, 0)):
    # shift = display registration (east, north): the pixel drawn at x came from x - shift
    out = np.full((n, n), np.nan, np.float32)
    for j in range(n):
        for i in range(n):
            acc = []
            for a in (0.25, 0.75):
                for b in (0.25, 0.75):
                    x = x0 + (i + a) * RES - shift[0]; y = y0 - (j + b) * RES - shift[1]   # toGeo() as in the app
                    lon = LON0 + math.degrees(x / (R * K)); lat = LAT0 + math.degrees(y / R)
                    gx = (lon + 180) / 360 * 8192 * 256; gy = (90 - lat) / 180 * 4096 * 256
                    t = tile(int(gx // 256), int(gy // 256))
                    if t is not None: acc.append(t[int(gy) % 256, int(gx) % 256])
            if acc: out[j, i] = sum(acc) / len(acc)
    return out
terr = json.loads((root / 'dist' / 'assets' / 'jezero-terrain.json').read_text())
E = np.array([np.nan if v is None else v for v in terr['elevations']], np.float32).reshape(terr['rows'], terr['cols'])
def ares_dem(x0, y0, n):
    # bilinear between cell centres, as the app defines cells: centre = xMin + (c + .5) * step
    xs = x0 + (np.arange(n) + .5) * RES; ys = y0 - (np.arange(n) + .5) * RES
    fc = (xs - terr['xMin']) / terr['step'] - .5; fr = (terr['yMax'] - ys) / terr['step'] - .5
    C, Rr = np.meshgrid(fc, fr); c = np.floor(C).astype(int); r = np.floor(Rr).astype(int); u = C - c; v = Rr - r
    ok = (c >= 0) & (r >= 0) & (c + 1 < terr['cols']) & (r + 1 < terr['rows'])
    c = np.clip(c, 0, terr['cols'] - 2); r = np.clip(r, 0, terr['rows'] - 2)
    z = E[r, c] * (1 - u) * (1 - v) + E[r, c + 1] * u * (1 - v) + E[r + 1, c] * (1 - u) * v + E[r + 1, c + 1] * u * v
    z[~ok] = np.nan; return z
def hillshade(z, az):
    gy, gx = np.gradient(z, RES)          # rows go south
    dzdx, dzdy = gx, -gy
    s, alt = math.radians(az), math.radians(30)
    sx, sy, sz = math.sin(s) * math.cos(alt), math.cos(s) * math.cos(alt), math.sin(alt)
    return (-dzdx * sx - dzdy * sy + sz) / np.sqrt(dzdx ** 2 + dzdy ** 2 + 1)
def ncc_best(small, big):
    best = None
    for dy in range(-SH, SH + 1):
        for dx in range(-SH, SH + 1):
            b = big[SH + dy:SH + dy + N, SH + dx:SH + dx + N]; ok = np.isfinite(small) & np.isfinite(b)
            if ok.sum() < N * N * .5: continue
            a1 = small[ok] - small[ok].mean(); b1 = b[ok] - b[ok].mean()
            r = float((a1 * b1).sum() / math.sqrt((a1 ** 2).sum() * (b1 ** 2).sum()))
            if best is None or r > best[0]: best = (r, dx * RES, -dy * RES)
    return best  # (r, east, north): where the feature sits in `big` relative to `small`
ortho = root / '.local' / 'reference' / 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif'
rawdem = root / '.local' / 'M20_JezeroCrater_CTXDEM_20m.tif'
SHIFT = (-55, 105)  # dist/map-view.js IMAGE_REGISTRATION for Mars2020CTX_E76_N16
marks = [
    {'id': 'A', 'note': 'crater with dune field, ~960 m', 'lon': 77.37893, 'lat': 18.48283},
    {'id': 'B', 'note': 'delta-front scarp', 'lon': 77.42873, 'lat': 18.49363},
    {'id': 'C', 'note': 'hill on the direct line', 'lon': 77.40881, 'lat': 18.43964},
    {'id': 'D', 'note': 'mound, east of the route', 'lon': 77.49703, 'lat': 18.46934},
    {'id': 'E', 'note': 'scarp, north edge of the subset', 'lon': 77.41593, 'lat': 18.53682},
    {'id': 'F', 'note': 'mound north of the route', 'lon': 77.43229, 'lat': 18.51320}]
rows = []
for m in marks:
    x, y = to_xy(m['lon'], m['lat'])
    ref_big = warp(ortho, x - W / 2 - SH * RES, y + W / 2 + SH * RES, M, Resampling.average)
    ref = ref_big[SH:SH + N, SH:SH + N]
    ctx_small = ares_ctx(x - W / 2, y + W / 2, N)
    r_ctx = ncc_best(ctx_small, ref_big)                      # ARES CTX feature -> position in reference
    r_fix = ncc_best(ares_ctx(x - W / 2, y + W / 2, N, SHIFT), ref_big)   # residual after display registration
    dem_a = ares_dem(x - W / 2, y + W / 2, N)
    dem_r = warp(rawdem, x - W / 2, y + W / 2, N, Resampling.bilinear)
    r_dem = max((ncc_best(hillshade(dem_a, az), ref_big) + (az,) for az in (180, 225, 270, 315)), key=lambda t: t[0])
    r_raw = max((ncc_best(hillshade(dem_r, az), ref_big) + (az,) for az in (180, 225, 270, 315)), key=lambda t: t[0])
    rows.append({'id': m['id'], 'note': m['note'],
                 'lon': m['lon'], 'lat': m['lat'],
                 'aresCtx': {'r': round(r_ctx[0], 3), 'east': r_ctx[1], 'north': r_ctx[2]},
                 'aresCtxRegistered': {'r': round(r_fix[0], 3), 'east': r_fix[1], 'north': r_fix[2]},
                 'aresDem': {'r': round(r_dem[0], 3), 'east': r_dem[1], 'north': r_dem[2], 'sunAz': r_dem[3]},
                 'rawDem': {'r': round(r_raw[0], 3), 'east': r_raw[1], 'north': r_raw[2], 'sunAz': r_raw[3]}})
    print(json.dumps(rows[-1]), flush=True)
report = {'method': 'Normalized cross-correlation over planar shifts (10 m steps, +/-300 m) in 2.4 km windows on a local equirectangular grid. CTX tiles are compared image-to-image with the reference; DEMs as a west-lit hillshade (sun azimuth chosen per landmark), which can bias the result along the illumination direction by tens of metres.',
  'reference': {'product': 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif', 'url': 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif', 'resampling': 'GDAL average via rasterio'},
  'offsetConvention': 'east/north = where the feature appears in the reference relative to the compared layer, metres',
  'displayRegistration': {'product': 'Mars2020CTX_E76_N16', 'east': SHIFT[0], 'north': SHIFT[1]},
  'landmarks': rows,
  'limits': 'Relative registration between products; not geodetic accuracy. Resolution 10 m; DEM shading bias of a few tens of metres is possible.'}
(root / 'dist' / 'assets' / 'alignment-measurement.json').write_text(json.dumps(report, indent=1) + chr(10), encoding='utf-8')
