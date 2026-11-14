$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'dist/assets/tiles'
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
$sources = @(
  @{ key='context'; product='Mars_Viking_MDIM21_ClrMosaic_global_232m'; level=7; label='Viking - Context'; resolution=232 },
  @{ key='optical'; product='CTX_beta01_uncontrolled_5m_Caltech'; level=11; label='MRO - CTX'; resolution=5 },
  @{ key='topography'; product='Mars_MGS_MOLA_ClrShade_merge_global_463m'; level=7; label='MGS - MOLA'; resolution=463 },
  @{ key='thermal'; product='Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly'; level=8; label='Odyssey - THEMIS'; resolution=100 }
)
$manifest = @{ retrievedAt=[DateTime]::UtcNow.ToString('o'); layers=@{} }
foreach ($source in $sources) {
  $capUrl = "https://trek.nasa.gov/tiles/Mars/EQ/$($source.product)/1.0.0/WMTSCapabilities.xml"
  try {
    $response = Invoke-WebRequest -Uri $capUrl -UseBasicParsing -TimeoutSec 45
    [xml]$xml = $response.Content
    $xml.Save((Join-Path $projectRoot "$($source.key)-capabilities.xml"))
    $matrixSet = $xml.SelectSingleNode("//*[local-name()='Contents']/*[local-name()='TileMatrixSet']")
    $matrix = $matrixSet.SelectNodes("*[local-name()='TileMatrix']") | Where-Object { $_.SelectSingleNode("*[local-name()='Identifier']").InnerText -eq [string]$source.level }
    if (!$matrix) { throw 'Matriz nao encontrada' }
    $width = [double]$matrix.SelectSingleNode("*[local-name()='MatrixWidth']").InnerText
    $height = [double]$matrix.SelectSingleNode("*[local-name()='MatrixHeight']").InnerText
    $tileSize = [int]$matrix.SelectSingleNode("*[local-name()='TileWidth']").InnerText
    $template = $xml.SelectSingleNode("//*[local-name()='ResourceURL']").GetAttribute('template')
    $matrixId = $matrixSet.SelectSingleNode("*[local-name()='Identifier']").InnerText
    $style = $xml.SelectSingleNode("//*[local-name()='Style']/*[local-name()='Identifier']").InnerText
    $centerCol = [int][Math]::Floor((77.4298+180)/360*$width)
    $centerRow = [int][Math]::Floor((90-18.4663)/180*$height)
    $radius = if ($source.key -eq 'optical') { 2 } else { 1 }
    $layer = @{ product=$source.product; capabilities=$capUrl; label=$source.label; sourceResolutionMeters=$source.resolution; level=$source.level; matrixWidth=$width; matrixHeight=$height; tileSize=$tileSize; tiles=@() }
    for ($row=$centerRow-$radius; $row -le $centerRow+$radius; $row++) {
      for ($col=$centerCol-$radius; $col -le $centerCol+$radius; $col++) {
        $url=$template.Replace('{TileMatrixSet}',$matrixId).Replace('{Style}',$style).Replace('{TileMatrix}',[string]$source.level).Replace('{TileRow}',[string]$row).Replace('{TileCol}',[string]$col)
        $relative = "assets/tiles/$($source.key)-$($source.level)-$row-$col.png"
        $file = Join-Path $projectRoot "dist/$relative"
        try {
          if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -TimeoutSec 30 }
          $bytes=[System.IO.File]::ReadAllBytes($file)
          if ($bytes.Length -lt 100 -or (($bytes[0] -ne 137 -or $bytes[1] -ne 80) -and ($bytes[0] -ne 255 -or $bytes[1] -ne 216))) { throw 'Resposta nao e imagem' }
          $layer.tiles += @{ row=$row; col=$col; path=$relative; url=$url; bytes=$bytes.Length }
        } catch { Write-Output "Tile indisponivel $($source.key) $row/$col : $($_.Exception.Message)" }
      }
    }
    $manifest.layers[$source.key]=$layer
    Write-Output "$($source.key): $($layer.tiles.Count) imagens NASA armazenadas"
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $projectRoot 'dist/assets/data-manifest.json') -Encoding UTF8
  } catch { Write-Output "Falha na camada $($source.key): $($_.Exception.Message)" }
}
