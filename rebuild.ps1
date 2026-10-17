param([string]$Blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Blender)) { throw "Blender not found: $Blender. Supply -Blender with your Blender executable path." }
Set-Location $PSScriptRoot
& $Blender --background --factory-startup --python (Join-Path $PSScriptRoot 'scripts\build_scene.py')
if ($LASTEXITCODE -ne 0) { throw 'Blender build failed' }
& node scripts/validate.mjs
if ($LASTEXITCODE -ne 0) { throw 'glTF validation failed' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
