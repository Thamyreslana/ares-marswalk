$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = $PSScriptRoot
$manifestPath = Join-Path $projectRoot 'dist/assets/data-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$baseUrl = 'https://murray-lab.caltech.edu/Mars2020/kml/CTX/Mars2020CTX_E76_N16'
$level = 12
$height = [Math]::Pow(2,$level)
$span = 180/$height
$centerX = [int][Math]::Floor((77.4298+180)/$span)
$centerY = [int][Math]::Floor((18.4663+90)/$span)
$tiles = @()
for($y=$centerY-3; $y -le $centerY+3; $y++) {
  for($x=$centerX-3; $x -le $centerX+3; $x++) {
    $url = "$baseUrl/$level/$x/$y.png"
    $relative = "assets/tiles/jezero-ctx-$level-$x-$y.png"
    $file = Join-Path $projectRoot "dist/$relative"
    if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -TimeoutSec 30 }
    $image = [System.Drawing.Bitmap]::FromFile($file)
    $tileSize = $image.Width
    $transparent = 0
    for($px=0; $px -lt $image.Width; $px+=16) { for($py=0; $py -lt $image.Height; $py+=16) { if($image.GetPixel($px,$py).A -eq 0) { $transparent++ } } }
    $image.Dispose()
    if($transparent -gt 0) { throw "O recorte $x/$y contem lacunas. O manifesto anterior foi preservado." }
    $tiles += @{ row=[int]($height-1-$y); col=$x; path=$relative; url=$url; bounds=@{west=$x*$span-180;east=($x+1)*$span-180;south=$y*$span-90;north=($y+1)*$span-90}; bytes=(Get-Item -LiteralPath $file).Length }
  }
  Write-Output "Linha $y concluida: $($tiles.Count) imagens sem lacunas"
}
$newLayer = @{ product='Mars2020CTX_E76_N16'; capabilities="$baseUrl/Mars2020CTX_E76_N16.kml"; sourcePage='https://murray-lab.caltech.edu/Mars2020/index.html'; label='MRO - CTX / NASA Mars 2020 - Caltech'; sourceResolutionMeters=5; level=$level; matrixWidth=$height*2; matrixHeight=$height; tileSize=$tileSize; tiles=$tiles; retrievedAt=[DateTime]::UtcNow.ToString('o'); coverageVerified=$true }
$manifest.layers | Add-Member -NotePropertyName optical -NotePropertyValue $newLayer -Force
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Mosaico CTX atualizado: $($tiles.Count) imagens, $tileSize pixels por tile."
