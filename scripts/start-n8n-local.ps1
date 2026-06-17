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

if (-not $env:N8N_DIAGNOSTICS_ENABLED) {
  $env:N8N_DIAGNOSTICS_ENABLED = "false"
}

if (-not $env:N8N_VERSION_NOTIFICATIONS_ENABLED) {
  $env:N8N_VERSION_NOTIFICATIONS_ENABLED = "false"
}

if (-not $env:N8N_VERSION_NOTIFICATIONS_WHATS_NEW_ENABLED) {
  $env:N8N_VERSION_NOTIFICATIONS_WHATS_NEW_ENABLED = "false"
}

if (-not $env:N8N_USER_FOLDER) {
  $n8nUserFolder = Join-Path $PSScriptRoot "..\.n8n-local"
  New-Item -ItemType Directory -Force -Path $n8nUserFolder | Out-Null
  $env:N8N_USER_FOLDER = $n8nUserFolder
}

$localN8nBin = Join-Path $PSScriptRoot "..\node_modules\n8n\bin\n8n"

if (Test-Path $localN8nBin) {
  node $localN8nBin
  exit $LASTEXITCODE
}

npx n8n
