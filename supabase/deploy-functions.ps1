# One-shot deploy for Winback's only edge function, delete-account.
# Prerequisite (once): npx supabase login   (opens the browser to authorize the CLI)
# Then run this script from the project root:  .\supabase\deploy-functions.ps1 -ProjectRef <your-project-ref>
#
# It also removes what the AI features left behind on the project: the
# estimate-spend and notification-lines functions and the OPENAI_API_KEY
# secret. Those steps are skipped quietly when there is nothing to remove.

param([string]$ProjectRef = $env:SUPABASE_PROJECT_REF)

$ErrorActionPreference = 'Stop'
if (-not $ProjectRef) { throw 'Pass your Supabase project ref: -ProjectRef <ref>, or set SUPABASE_PROJECT_REF.' }
$ref = $ProjectRef

Write-Host "Linking project..." -ForegroundColor Cyan
npx supabase link --project-ref $ref
if ($LASTEXITCODE -ne 0) { throw "supabase link failed" }

# Optional secrets for delete-account (see supabase/functions/.env.example).
# Only these names are pushed, and only when they have a value, so a stale
# entry left in .env (such as an old AI key) is never uploaded again.
$optional = @('REVENUECAT_SECRET_API_KEY', 'POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST')
$envFile = 'supabase/functions/.env'
if (Test-Path $envFile) {
  $lines = Get-Content $envFile | Where-Object {
    $pair = $_ -split '=', 2
    $pair.Count -eq 2 -and $optional -contains $pair[0].Trim() -and $pair[1].Trim() -ne ''
  }
  if ($lines) {
    $tmp = New-TemporaryFile
    try {
      Set-Content -Path $tmp -Value $lines -Encoding ascii
      $names = ($lines | ForEach-Object { ($_ -split '=', 2)[0].Trim() }) -join ', '
      Write-Host "Pushing secrets ($names)..." -ForegroundColor Cyan
      npx supabase secrets set --env-file $tmp --project-ref $ref
      if ($LASTEXITCODE -ne 0) { throw "supabase secrets set failed" }
    } finally {
      Remove-Item $tmp -Force -Confirm:$false
    }
  } else {
    Write-Host "No optional secrets set in $envFile - RevenueCat and PostHog clean-up will be skipped." -ForegroundColor Yellow
  }
} else {
  Write-Host "No $envFile - RevenueCat and PostHog clean-up will be skipped." -ForegroundColor Yellow
}

# Keep JWT verification ON (the default). Never add --no-verify-jwt: the
# function must only ever delete the account that is calling it.
Write-Host "Deploying delete-account..." -ForegroundColor Cyan
npx supabase functions deploy delete-account --project-ref $ref
if ($LASTEXITCODE -ne 0) { throw "delete-account deploy failed" }

Write-Host "Removing the retired AI functions and key (ignored if already gone)..." -ForegroundColor Cyan
foreach ($fn in @('estimate-spend', 'notification-lines')) {
  npx supabase functions delete $fn --project-ref $ref
  if ($LASTEXITCODE -ne 0) { Write-Host "  $fn was not deployed - nothing to remove." }
}
npx supabase secrets unset OPENAI_API_KEY --project-ref $ref
if ($LASTEXITCODE -ne 0) { Write-Host "  OPENAI_API_KEY was not set - nothing to remove." }

Write-Host "Done." -ForegroundColor Green
Write-Host "Database: run supabase/migrations-2026-09-27-launch.sql once in the SQL editor" -ForegroundColor Yellow
Write-Host "(or supabase/setup-all.sql on a fresh project). Both are safe to re-run." -ForegroundColor Yellow
Write-Host "Also revoke the old OpenAI key in the OpenAI dashboard, and keep CAPTCHA OFF" -ForegroundColor Yellow
Write-Host "for anonymous sign-ins (the app does not send a captcha token)." -ForegroundColor Yellow
