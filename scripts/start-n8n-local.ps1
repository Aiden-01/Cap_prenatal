$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $repositoryRoot "n8n\.env"
$requiredN8nVersion = "2.26.4"

$allowedVariables = @(
  "N8N_ENCRYPTION_KEY",
  "N8N_HOST",
  "N8N_PORT",
  "N8N_PROTOCOL",
  "N8N_LISTEN_ADDRESS",
  "N8N_EDITOR_BASE_URL",
  "WEBHOOK_URL",
  "GENERIC_TIMEZONE",
  "TZ",
  "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS",
  "N8N_RUNNERS_ENABLED",
  "N8N_DIAGNOSTICS_ENABLED",
  "N8N_VERSION_NOTIFICATIONS_ENABLED",
  "EXECUTIONS_DATA_PRUNE",
  "EXECUTIONS_DATA_MAX_AGE",
  "EXECUTIONS_DATA_PRUNE_MAX_COUNT",
  "EXECUTIONS_DATA_SAVE_ON_SUCCESS",
  "EXECUTIONS_DATA_SAVE_ON_ERROR",
  "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS",
  "EXECUTIONS_DATA_SAVE_ON_PROGRESS",
  "CAP_BACKEND_AUTOMATION_URL",
  "CAP_SYSTEM_BASE_URL"
)

$essentialProcessVariables = @(
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROCESSOR_ARCHITECTURE",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "LANG",
  "LC_ALL"
)
$permittedProcessVariables = $essentialProcessVariables + $allowedVariables
Get-ChildItem Env: |
  Where-Object { $permittedProcessVariables -notcontains $_.Name } |
  ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Falta n8n/.env. Copie n8n/.env.example y complete la configuracion dedicada."
}

$loadedVariables = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }
  if (-not $line.Contains("=")) {
    throw "Linea invalida en n8n/.env."
  }

  $parts = $line.Split("=", 2)
  $name = $parts[0].Trim()
  $value = $parts[1].Trim()
  if ($allowedVariables -notcontains $name) {
    throw "Variable no permitida en n8n/.env: $name"
  }
  if ($loadedVariables.ContainsKey($name)) {
    throw "Variable repetida en n8n/.env: $name"
  }
  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  $loadedVariables[$name] = $value
  Set-Item -Path "Env:$name" -Value $value
}

if (-not $env:N8N_ENCRYPTION_KEY -or $env:N8N_ENCRYPTION_KEY.Length -lt 32) {
  throw "N8N_ENCRYPTION_KEY es obligatoria y debe tener al menos 32 caracteres."
}
if ($env:N8N_LISTEN_ADDRESS -notin @("127.0.0.1", "::1")) {
  throw "N8N_LISTEN_ADDRESS local debe ser loopback."
}
if ($env:GENERIC_TIMEZONE -ne "America/Guatemala") {
  throw "GENERIC_TIMEZONE debe ser America/Guatemala."
}
if (-not $env:CAP_BACKEND_AUTOMATION_URL -or -not $env:CAP_SYSTEM_BASE_URL) {
  throw "Faltan las URLs dedicadas de CAP Prenatal."
}

$n8nUserFolder = Join-Path $repositoryRoot ".n8n-local"
New-Item -ItemType Directory -Force -Path $n8nUserFolder | Out-Null
$env:N8N_USER_FOLDER = $n8nUserFolder

$localN8nBin = Join-Path $repositoryRoot "node_modules\n8n\bin\n8n"
$localN8nPackage = Join-Path $repositoryRoot "node_modules\n8n\package.json"
if (-not (Test-Path -LiteralPath $localN8nBin -PathType Leaf) -or
  -not (Test-Path -LiteralPath $localN8nPackage -PathType Leaf)) {
  throw "n8n no esta instalado localmente. Ejecute npm install en la raiz."
}

$installedVersion = (Get-Content -Raw -LiteralPath $localN8nPackage | ConvertFrom-Json).version
if ($installedVersion -ne $requiredN8nVersion) {
  throw "Version local de n8n no autorizada. Se requiere $requiredN8nVersion."
}

node $localN8nBin
exit $LASTEXITCODE
