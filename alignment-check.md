# ARES — Image–terrain check

**Status: PERFORMED — AUTOMATED MEASUREMENT, 2026-11-15.**

Result: the displayed CTX mosaic (Caltech, `Mars2020CTX_E76_N16`) was ~120 m off (≈55 m E, ≈105 m S) relative to the USGS Mars 2020 CTX orthomosaic at all six landmarks. The DEM used for routing agrees with that reference within one 40 m cell. The image display was corrected; routes, slopes and numbers did not change. Residual after correction: ≤10 m.

The protocol is below, followed by the completed record and a blank template for repeat checks. This is relative registration between products, not geodetic accuracy or route certification.

## Protocol

1. Record the version or commit, date and observer. Retain the hashes and parameters from the [reference scenario](assets/validation-report.json).
2. Compare CTX imagery and the DEM using a tool or conversion independent of the ARES conversion. Record product, URL, projection, longitude convention and resolution. [NASA Mars Trek](https://trek.nasa.gov/mars/) and the USGS product cited in the scenario are starting points; matching projections alone do not prove absolute alignment.
3. Choose at least three identifiable features distributed across the subset, such as crater rims or ridges. Do not use points from one area only. Rochette is a rover workspace waypoint, not necessarily a visible drill-hole center.
4. Compare positions in both products and record discrepancies with their evidence. Mark ambiguous features **inconclusive**. Do not assign metre accuracy without a reproducible measurement and its uncertainty.

## Record

- Version: the commit that adds this record; display registration in `dist/map-view.js` (`IMAGE_REGISTRATION`).
- Date and observer: 2026-11-15. Measurement scripted with AI assistance (`tools/check-alignment.py`); no manual landmark picking.
- Products and independent tool:
  - Reference: USGS Mars 2020 TRN CTX orthomosaic, [JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif), ESRI:103885 (Mars 2000 sphere, equidistant cylindrical), 6 m.
  - Compared: the 49 Caltech CTX tiles ARES displays (level 12, plate carrée, KML bounds); the ARES 40 m DEM grid; the raw USGS 20 m DEM.
  - Tool: GDAL via rasterio (resampling to a local equirectangular grid), independent of the browser projection code; normalized cross-correlation over ±300 m shifts in 10 m steps, 2.4 km windows. DEMs compared as west-lit hillshades.
- Data: [alignment-measurement.json](assets/alignment-measurement.json).

East/north = where the feature appears in the reference relative to the compared layer, in metres.

| Feature | Position (DEM) | Displayed CTX, before | Displayed CTX, after | ARES DEM (40 m) | Outcome |
| --- | --- | --- | --- | --- | --- |
| A — crater with dune field, ~960 m | 77.37893 E, 18.48283 N | −60 E, +100 N (r 0.90) | 0, −10 (r 0.90) | +30, +10 (r 0.62) | Suspected mismatch → corrected |
| B — delta-front scarp | 77.42873 E, 18.49363 N | −50, +100 (r 0.91) | +10, 0 (r 0.92) | +40, +10 (r 0.61) | Suspected mismatch → corrected |
| C — hill on the direct line | 77.40881 E, 18.43964 N | −60, +100 (r 0.88) | 0, −10 (r 0.88) | +30, +20 (r 0.49) | Suspected mismatch → corrected |
| D — mound east of the route | 77.49703 E, 18.46934 N | −60, +110 (r 0.85) | 0, 0 (r 0.85) | +30, +10 (r 0.58) | Suspected mismatch → corrected |
| E — scarp, north edge | 77.41593 E, 18.53682 N | −50, +110 (r 0.89) | +10, 0 (r 0.88) | +40, 0 (r 0.55) | Suspected mismatch → corrected |
| F — mound north of the route | 77.43229 E, 18.51320 N | −50, +110 (r 0.89) | +10, 0 (r 0.89) | +40, 0 (r 0.62) | Suspected mismatch → corrected |

Raw USGS DEM vs ARES DEM grid: same offsets within 10 m, so the ARES terrain conversion adds no measurable shift. The consistent +30–40 m east offset of both DEMs may be partly hillshade illumination bias (sun from the west); it is below one 40 m planning cell and is not corrected.

Limits: 10 m measurement step; image-to-DEM correlation is moderate (r 0.49–0.62). Landmarks were chosen automatically from DEM relief and confirmed visually. The validation flag `independentAbsoluteImageDemAlignmentValidated` stays `false`: no geodetic control or field survey was used.

## Blank template

- Version or commit:
- Date and observer:
- Products, URLs, projections and independent tool:
- Screenshot references:

| Feature | CTX reference | DEM reference | Discrepancy and evidence | Outcome |
| --- | --- | --- | --- | --- |
| 1 — complete | | | | Not assessed |
| 2 — complete | | | | Not assessed |
| 3 — complete | | | | Not assessed |

Possible outcomes: visually consistent, suspected mismatch or inconclusive. Record failures and rejected landmarks too. Visual consistency is not independent geodetic validation.

## After checking

- Document issues, changes and what must be repeated. Keep the original record.
- Run the [comprehension test](comprehension-test.html?lang=en) separately with someone outside the project, before showing the guided demo.
- This protocol never updates the report's `independentAbsoluteImageDemAlignmentValidated`, `humanUsabilityStudyCompleted` or `operationalSafetyValidated` flags automatically; actual evidence and a review of the claim are required.
