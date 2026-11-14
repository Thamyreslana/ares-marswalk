# ARES — Evidence-based Marswalk Planning

NASA Space Apps 2026 · **Interplanetary Survival Guide: Martian Map**

ARES is a pre-EVA planning prototype for a round trip from a hypothetical habitat to **Rochette**, a NASA-documented Perseverance sampling workspace in Jezero. The straight line from the habitat climbs a ~40 m hill with mapped slopes up to 23°; ARES uses numerical orbital terrain to route around it, then turns the time budget into one rule for the crew: **when to leave the target** (a walkback deadline).

The interface defaults to English and includes a Portuguese language selector. The mobile layout shows the map and result before opening mission settings in a dialog.

**Live:** https://thamyreslana.github.io/ares-marswalk/ · [Portuguese](https://thamyreslana.github.io/ares-marswalk/?lang=pt) · [guided demo](https://thamyreslana.github.io/ares-marswalk/?lang=en&demo=1) · [7-slide brief](https://thamyreslana.github.io/ares-marswalk/mission-brief.html)

## Publish to GitHub Pages

GitHub Pages serves the `gh-pages` branch, which holds only the contents of `dist/`. After committing to `main`:

```powershell
git push origin main
git push origin "$(git subtree split --prefix dist HEAD):refs/heads/gh-pages" --force
```

## Run locally

From this directory:

```powershell
.\node.exe server.mjs
```

Open **http://127.0.0.1:4173/?lang=en**. On a machine with Node already installed, `node server.mjs` works. Double-clicking `iniciar.cmd` is another Windows option. Stop the server with Ctrl+C.

Production is buildless HTML/CSS/JavaScript with no npm dependencies, API keys, backend, or runtime Python requirement. Imagery and numerical terrain are stored with the app, so the core experience works offline when served locally. Optional web fonts fall back to system fonts.

## What changed in ARES-05

- **Routes A / B / C.** A = direct line (blocked: 23.2°), B = terrain-aware (recommended), C = terrain-aware that also avoids ground in the coolest night-IR quartile (**experimental**; cost × 2 on those cells). C cuts likely-loose ground from 25% to 2.7% of the way for 242 m more, and its conservative scenario falls 0.2 min below the 45 min reserve, so the summary keeps B as the only route that passes everything. Map tags A/B/C match the comparison cards; the selected route is cyan (white on the night layer), alternatives grey.
- **Ground already driven.** `tools/prepare-traverse.mjs` clips NASA/JPL's Perseverance traverse (MMGIS `M20_traverse.json`) to the map and converts it to the local frame (`dist/assets/perseverance-traverse.json`, sols 15–1006). Drawn as a sand dotted line with a show/hide button. It shows rover-proven ground, not a certified walking path.
- **Return to base and Emergency** in the crew view. Both send the crew back from the current position along the checked route: *Return* at the planned pace, *Emergency* at the slower pace with "base alerted (simulated)". The view shows a heading arrow to the habitat, the return path on the mini-map, time to base and reserve on arrival; *Cancel return* resumes the plan.
- **Fewer frames.** Only the decision metrics, the map, the playback, the route cards and the crew view keep a frame; secondary sections use a single top rule. The side accent bars were replaced by full status-coloured borders.

## What changed in ARES-04

- **Crew EVA view** (`Crew EVA view` button, or `?view=eva`). One glanceable screen for the astronaut, driven by the EVA playback: a status bar (ON PLAN / LEAVE SOON / TURN BACK NOW), a countdown to the leave-by time, the next waypoint with heading, time to shelter at a slower pace, the ground and maximum slope over the next 200 m (USGS DEM + THEMIS Night IR), and the cosmic-ray dose so far (Curiosity RAD rate). It is labelled as simulated from the plan, not live telemetry.
  Recording links: `?lang=en&view=eva&t=40` (walking out) and `?lang=en&view=eva&work=90&t=140` (turn back now).
- **Decision first.** The status, the leave-by time (largest number on the page), distance and base-case time sit above the map; the supporting explanation is one click away ("How this plan was checked"). Plan settings open in a dialog on every screen size.
- **Colour with meaning.** Graphite interface; cyan = the ARES plan and actions; green / amber / red are reserved for status; red cells = terrain above the slope limit; the direct line is a grey dashed reference.
- **Cleaner map.** Overlays on the map reduced to the layer picker, zoom tools and one legend; layer description, credits and data status moved to a line below the map; map labels enlarged (12–13 px titles, 10–11 px details).

## What changed in ARES-03b

- **EVA playback.** A play button and timeline under the map walk the plan minute by minute: phase, distance from the habitat, time to shelter at a 25% slower pace, and the leave-by time. The status turns to **TURN BACK NOW** once the leave-by time passes while the crew is still at Rochette. An option simulates a 25% slower walk home. The guided demo's third step freezes the playback at T+136 min.
- **THEMIS Night IR (Mars Trek).** The controlled night-time infrared mosaic is resampled to the 40 m grid by `tools/prepare-night-ir.mjs` (no dependencies) into `dist/assets/jezero-night-ir.json`. Cells are split by brightness quartiles: cool at night (likely loose material) and warm (likely rock). It is a map layer, a terrain-inspector readout and a per-route share (terrain route: 25% night-cool ground), and it is **not** part of the route cost. Plausibility check: the share of warm cells rises with slope, from 19% below 3° to 47% above 12°.
- **Radiation and space weather.** Curiosity RAD measured about 0.67 mSv/day from galactic cosmic rays on the surface (Hassler et al. 2014, value as reported by SwRI), so the base-case EVA adds about 0.08 mSv. The acute hazard is a solar particle event; the card shows the longest walk to shelter on the route (90 min at the slower pace).
- **Legibility.** Minimum visible text is now 10 px (it was 5–7 px for labels and status), the leave-by time is the highlighted result, and the repeated disclaimers are merged into one "Limits" block. The day-time THEMIS layer was dropped from the picker in favour of the night layer.

## What changed in ARES-03

- **A scenario with a real hazard.** In ARES-02 the direct line reached only 6.5°, so the detour avoided nothing important. The hypothetical habitat moved to **77.3971° E, 18.4407° N**, a flat site (under 4° within 120 m) chosen with `tools/find-habitat.mjs`. The straight line to Rochette now crosses **10 cells above the 12° limit, up to 23.2°**, over a hill about 40 m high that is also visible in the CTX image. `BASE` remains only the map projection origin.
- **Walkback deadline.** Walk out at the planned pace; plan the return as if pace drops to 75% (the conservative pace factor). The plan shows the latest time to leave Rochette and how much science time fits. If the target lies beyond the walkback limit, the map marks where to turn back and draws the rest of the route in red. Inspired by the walkback limits used to plan Apollo lunar rover traverses; not a NASA rule for Mars.
- **Perseverance surface images.** Three raw images (front Hazcam, Navcam, SHERLOC WATSON) from sols 180–182 at site 7 / drive 0, the same position as waypoint 7_0, show what the crew would see on arrival. Provenance, IDs and hashes are in `dist/assets/surface/surface-images.json`.
- **New guided demo:** (1) the straight line climbs a 23° hill, (2) ARES walks around it, (3) fieldwork stretches to 90 min and the walkback rule says when to turn back.
- Default available EVA time is 270 min (ARES-02: 240), so the default plan holds the reserve in all three scenarios.

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

The waypoint locates a rover workspace, not the exact center of a drill hole. Decimal precision is not a statement of geodetic accuracy. The habitat is hypothetical at **77.3971° E, 18.4407° N**; 77.4298° E, 18.4663° N is the local map/terrain projection origin.

## Sources and their distinct roles

| Data | Role | Source |
|---|---|---|
| Local CTX optical mosaic | Surface context; no automatic boulder detection | [NASA Mars 2020 / Caltech Murray Lab](https://murray-lab.caltech.edu/Mars2020/index.html) |
| CTX numerical DEM | Slope, exclusion policy, route cost, profile | [USGS Mars 2020 Science Investigation CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) |
| MOLA color hillshade | Regional relief context only | [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/) |
| THEMIS Night IR controlled mosaic | Likely loose vs rocky ground along the route (advisory) | [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/) |
| Curiosity RAD surface dose | Order of magnitude of EVA radiation dose | [Hassler et al. 2014](https://doi.org/10.1126/science.1244797) |
| Perseverance raw images | What the workspace looks like (not used in routing) | [NASA Mars 2020 raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) |

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

| Result | Direct line | Terrain-aware |
|---|---:|---:|
| Round trip | 5.44 km | 5.62 km |
| Cells above the 12° limit | 10 | 0 |
| Maximum mapped cell slope | 23.2° | 5.8° |
| Total climbing, round trip | 207 m | 119 m |
| Relative terrain cost | 6,683 | 3,531 |

The detour adds approximately **178 m** round trip (+3.3%). The direct line is blocked at the default 12° threshold; it becomes passable only if the limit is raised above 23.2°.

With 270 min available, 2.5 km/h pace, 30 min fieldwork, and 45 min reserve:

- Faster: pace ×1.20, fieldwork ×0.85.
- Base case: approximately **165 min** total.
- Conservative: pace ×0.75, fieldwork ×1.25, approximately **217 min** total; approximately **53 min** remain, **7.6 min beyond the required reserve**.
- Walkback: leave Rochette by **T+135 min**, allowing up to **67 min** of science.

With 90 min of fieldwork, the base case still fits (45.1 min left), the conservative scenario does not, and the walkback rule allows only 67 of the 90 minutes. Scenarios are what-if assumptions, not statistical confidence intervals or predictions of suit performance.

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
2. Step 1, slope map: the direct line crosses 10 cells above 12°, up to 23.2°, over a hill about 40 m high.
3. Step 2, optical map: the terrain-aware route walks around it for 178 m extra (+3.3%), maximum 5.8°, climbing cut from 207 m to 119 m.
4. Step 3: fieldwork stretches to 90 min. The base case still fits, but the walkback rule says leave Rochette by T+135 min, which allows 67 of the 90 minutes. Finish to restore the plan that was open before the demo.

### A small comprehension test

The main interface offers three shortcuts below the map: adjust the mission, compare routes, and inspect the evidence. The comparison summary updates with the terrain and reserve checks; it does not choose a route for the user. A nearby disclosure separates source data, planning assumptions, and pending validation.

Open `dist/comprehension-test.html` (or the site's **5-minute comprehension test** link). The protocol is available in English and Portuguese. Ask someone outside the project to explain why the direct line is not acceptable, change science work to 90 min and read the walkback deadline, and explain what the green status establishes. Keep the guided demo closed until the tasks are complete.

The facilitator can also record the first observed issue to fix and the proposed change/retest. These optional fields are exported in `followUp` with the observation notes. They do not change any project validation claim.

The facilitator may export anonymous observations only after selecting outcomes and confirming that an actual person was observed. The form sends nothing to a server and does not change `humanUsabilityStudyCompleted:false` in the project's reference report. Three small sessions can reveal wording or layout problems; they do not establish operational safety or representative scientific validity.

Use `dist/mission-brief.html` as a seven-slide submission demo. Additional public resources include `dist/assets/validation-report.json`, the preserved waypoint, and numerical terrain metadata. List NASA imagery/data, the primary paper, and external software in the submission References field. Follow the official event submission instructions for the final project page.

## Português

Abra o site e escolha **PT** no seletor. No celular, o mapa aparece primeiro; **Ajustar missão** abre os parâmetros. O terreno é real, mas o habitat, o limite de declividade e os cenários de tempo são hipóteses explícitas de um protótipo de planejamento.
