# ARES — Evidence-based Marswalk Planning

NASA Space Apps 2026 · **Interplanetary Survival Guide: Martian Map**

ARES is a pre-EVA planning prototype for a round trip from a hypothetical habitat to **Rochette**, a NASA-documented Perseverance sampling workspace in Jezero. It connects numerical orbital terrain to route decisions and shows how a change in walking pace affects the return reserve.

The interface defaults to English and includes a Portuguese language selector. The mobile layout shows the map and result before opening mission settings in a dialog.

## Run locally

From this directory:

```powershell
.\node.exe server.mjs
```

Open **http://127.0.0.1:4173/?lang=en**. On a machine with Node already installed, `node server.mjs` works. Double-clicking `iniciar.cmd` is another Windows option. Stop the server with Ctrl+C.

Production is buildless HTML/CSS/JavaScript with no npm dependencies, API keys, backend, or runtime Python requirement. Imagery and numerical terrain are stored with the app, so the core experience works offline when served locally. Optional web fonts fall back to system fonts.

## What changed in ARES-02

- Replaced three fictional destinations and circular exclusions with one traceable scientific workspace and a real numerical terrain model.
- Route cost now depends on slope derived from a **20 m USGS/NASA CTX DEM**, sampled on a **40 m planning grid**.
- Unknown terrain and cells above the assumed slope threshold are excluded. Diagonal corner cutting is blocked; simplified segments are checked against every crossed cell.
- Compares the direct baseline with a terrain-aware route, including round-trip distance, maximum mapped cell slope, and a relative terrain-cost index.
- Shows both routes' conservative mission time, time remaining, and margin beyond the required reserve side by side. Neither route is presented as a universally safer choice.
- Includes a three-step guided demonstration (`?demo=1`) that changes the reserve from 45 to 50 minutes and restores the prior plan on exit.
- Shows a numerical slope map, an elevation profile, and a terrain-cell inspector.
- Calculates faster, base-case, and conservative time scenarios, each including science work, return, and an explicit reserve.
- Exports round-trip GeoJSON geometry, parameters, scenarios, source references, and limitations.
- Provides English/Portuguese UI, mobile settings, a [seven-slide English mission brief](dist/mission-brief.html), and a machine-readable [reference scenario](dist/assets/validation-report.json).

## Scientific target

Rochette / Artuby ridge / Citadelle is associated with the Montdenier and Montagnac samples. The proposed observation asks what textures and mineral context can reveal about alteration of basalt by water; it does not claim evidence of life.

- Workspace: **77.44436574° E, 18.43073940° N**.
- NASA waypoint: **RMC 7_0, sol 180**. Original record preserved in `dist/assets/rochette-waypoint.geojson`.
- [NASA/JPL waypoint GeoJSON](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json).
- [Simon et al. (2023), Table 2](https://doi.org/10.1029/2022JE007474), linking the rounded coordinates and sample names.
- [NASA/JPL science context](https://www.jpl.nasa.gov/news/nasas-perseverance-rover-collects-puzzle-pieces-of-mars-history/).

The waypoint locates a rover workspace, not the exact center of a drill hole. Decimal precision is not a statement of geodetic accuracy. The habitat is hypothetical at **77.4298° E, 18.4663° N**.

## Sources and their distinct roles

| Data | Role | Source |
|---|---|---|
| Local CTX optical mosaic | Surface context; no automatic boulder detection | [NASA Mars 2020 / Caltech Murray Lab](https://murray-lab.caltech.edu/Mars2020/index.html) |
| CTX numerical DEM | Slope, exclusion policy, route cost, profile | [USGS Mars 2020 Science Investigation CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) |
| MOLA color hillshade | Regional relief context only | [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/) |
| THEMIS daytime infrared | Historical regional context only | [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/) |

Mars Trek is listed in the [official 2026 challenge Resources](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources). The other official resources and their use are recorded in `dist/assets/challenge-resources.json`. Not every listed resource is integrated.

Per-tile URLs, bounds, resolutions, and download dates are recorded in `dist/assets/data-manifest.json`. The DEM subset records the original URL, source file SHA-256, CRS definitions, resampling procedure, and limitations in `dist/assets/jezero-terrain.json`.

The 49 local CTX tiles replaced an incomplete global beta mosaic. Their display resolution is approximately 10 m/pixel. MOLA and THEMIS keep their own matrix geometry and regional framing. Original imagery remains unfiltered; slope colors are a separate derived overlay.

## Terrain method

The source DEM has 20 m pixels. `tools/prepare-terrain.py` reprojects a subset to a local equirectangular CRS that matches the JavaScript origin, latitude scale, and Mars radius of **3,396,190 m**. It samples elevations bilinearly on a 40 m grid and calculates slope with central differences in metres. Those derivatives span neighboring grid centers separated by 80 m; the result cannot resolve smaller landforms reliably. Unknown neighbors and the derivative perimeter are excluded.

A* searches an eight-connected grid with this prototype cost:

```text
edge cost = horizontal distance × [1 + 4 × (mapped slope / selected limit)²]
```

The default **12° limit** and the weight of **4** are assumptions, not NASA EVA limits or calibrated metabolic coefficients. The route is terrain-aware; it is not claimed to be a globally optimal solution to the continuously integrated post-analysis cost. Path simplification preserves traversability and checks segment cost. Supercover traversal checks all crossed cells, including corner contacts.

Distances are planimetric. The return retraces the outbound route. Total ascent includes both outbound and return. The elevation profile shows the outbound leg, and unknown data must not be drawn as a continuous measured profile.

## Reference scenario

Generated from the checked-in terrain by `node tools/build-validation.mjs`:

| Result | Direct baseline | Terrain-aware |
|---|---:|---:|
| Round trip | 4.52 km | 4.83 km |
| Maximum mapped cell slope | 6.5° | 4.1° |
| Relative terrain cost | 2,771 | 2,639 |

The terrain route adds approximately **303 m** round trip. The direct baseline is not automatically blocked at the default 12° threshold; the difference also comes from weighting the lower slopes. At an assumed 5° threshold, the direct baseline crosses cells above the limit.

With 240 min available, 2.5 km/h pace, 30 min fieldwork, and 45 min reserve:

- Faster: pace ×1.20, fieldwork ×0.85.
- Base case: approximately **146 min** total.
- Conservative: pace ×0.75, fieldwork ×1.25, approximately **192 min** total; approximately **48 min** remain, only **3 min beyond the required reserve**.

Reducing available time to 210 min preserves the base-case reserve but fails it in the conservative case. Scenarios are what-if assumptions, not statistical confidence intervals or predictions of suit performance.

## Tests and verification

```powershell
.\node.exe --test tests/terrain-planner.test.mjs tests/map-view.test.mjs tests/decision.test.mjs
.\node.exe tools/build-validation.mjs
.\node.exe qa-browser.mjs
```

The browser script requires Chrome at its standard Windows path and a running local server. It verifies desktop/mobile, both languages, four map views, reserve sensitivity, a strict-slope baseline warning, settings dialogs, expanded maps, export with return geometry/provenance, the seven-slide brief, and handling of unavailable terrain data. Screenshots stay in `.local/` and are not published.

The reference report explicitly distinguishes automated checks from validations that remain incomplete: human usability testing, independent absolute image/DEM alignment, and operational safety validation. No human study or astronaut endorsement is claimed.

## Reproduce the terrain subset

The application itself needs no Python. To reproduce the data preparation:

1. Read and run `tools/download-terrain.ps1` (90 MB DEM plus NASA waypoints).
2. Install preparation dependencies locally: `python -m pip install --target .local/terrain-python -r tools/requirements-terrain.txt`.
3. Run `python tools/prepare-terrain.py`.
4. Run `node tools/build-validation.mjs` and the tests.

Windows execution policies and network access may require permission. Raw data, Python packages, browser profiles, and screenshots remain in ignored `.local/`; they are not uploaded with the site. To reproduce imagery, use `fetch-data.ps1` and `fetch-optical.ps1`.

## Limits

Historical orbital data do not capture every obstacle or current surface condition. Absolute alignment between the local CTX mosaic and DEM has not been independently validated. MOLA color is not elevation input, and THEMIS brightness is not a temperature forecast. The app does not estimate oxygen, radiation dose, current weather, fatigue, carrying-load effects, communication, or emergency rescue. The green status means the configured time reserve holds under the displayed scenarios; it does not certify an EVA as safe.

## A short demonstration

1. Open the prototype in English with `?lang=en&demo=1`, or select **Guided demo** in the route comparison.
2. Compare the two routes with a 45 min reserve: the direct baseline has about 12.8 min conservative margin, and the terrain route about 3.1 min.
3. Advance to a 50 min reserve: the direct baseline still meets the conservative budget, while the terrain route falls about 1.9 min below the requirement.
4. Explain the tradeoff between lower mapped slope and more time reserve. Finish to restore the plan that was open before the demo.

### A small comprehension test

The main interface offers three shortcuts below the map: adjust the mission, compare routes, and inspect the evidence. The comparison summary updates with the terrain and reserve checks; it does not choose a route for the user. A nearby disclosure separates source data, planning assumptions, and pending validation.

Open `dist/comprehension-test.html` (or the site's **5-minute comprehension test** link). The protocol is available in English and Portuguese. Ask someone outside the project to compare the routes, change the reserve to 50 min, and explain what the green status establishes. Keep the guided demo closed until the tasks are complete.

The facilitator can also record the first observed issue to fix and the proposed change/retest. These optional fields are exported in `followUp` with the observation notes. They do not change any project validation claim.

The facilitator may export anonymous observations only after selecting outcomes and confirming that an actual person was observed. The form sends nothing to a server and does not change `humanUsabilityStudyCompleted:false` in the project's reference report. Three small sessions can reveal wording or layout problems; they do not establish operational safety or representative scientific validity.

Use `dist/mission-brief.html` as a seven-slide submission demo. Additional public resources include `dist/assets/validation-report.json`, the preserved waypoint, and numerical terrain metadata. List NASA imagery/data, the primary paper, and external software in the submission References field. Follow the official event submission instructions for the final project page.

## Português

Abra o site e escolha **PT** no seletor. No celular, o mapa aparece primeiro; **Ajustar missão** abre os parâmetros. O terreno é real, mas o habitat, o limite de declividade e os cenários de tempo são hipóteses explícitas de um protótipo de planejamento.
