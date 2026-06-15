$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot "..\backend\.env"

if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()

    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $parts = $line.Split("=", 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path "Env:$name" -Value $value
  }
}

if (-not $env:GENERIC_TIMEZONE) {
  $env:GENERIC_TIMEZONE = "America/Guatemala"
}

if (-not $env:TZ) {
  $env:TZ = "America/Guatemala"
}

npx n8n
