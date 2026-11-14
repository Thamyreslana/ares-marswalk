$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localPath = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $localPath -Force | Out-Null
$demPath = Join-Path $localPath 'M20_JezeroCrater_CTXDEM_20m.tif'
if (!(Test-Path -LiteralPath $demPath)) {
  Invoke-WebRequest -Uri 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif' -OutFile $demPath -UseBasicParsing -TimeoutSec 240
}
if ((Get-Item -LiteralPath $demPath).Length -ne 90345300) { throw 'Unexpected DEM size. Inspect the local file before retrying; it has not been overwritten.' }
Invoke-WebRequest -Uri 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json' -OutFile (Join-Path $localPath 'M20_waypoints.json') -UseBasicParsing -TimeoutSec 30
Get-FileHash -LiteralPath $demPath -Algorithm SHA256
