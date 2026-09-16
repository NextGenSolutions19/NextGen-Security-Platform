# Integration tests for register-visitor Edge Function (local serve, hosted DB).
# Prerequisites: linked Supabase project, JWT_SECRET on hosted project, function served locally.
#
# Usage:
#   Terminal 1: npx supabase functions serve register-visitor --no-verify-jwt --project-ref pdjboswcspakcnwjzfmi
#   Terminal 2: pwsh ./supabase/functions/register-visitor/run-tests.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
Set-Location $ProjectRoot

$FunctionBaseUrl = $env:REGISTER_VISITOR_TEST_URL
if (-not $FunctionBaseUrl) {
  $FunctionBaseUrl = "http://127.0.0.1:54321/functions/v1"
}

$SupabaseUrl = $env:EXPO_PUBLIC_SUPABASE_URL
$AnonKey = $env:EXPO_PUBLIC_SUPABASE_ANON_KEY
if (-not $SupabaseUrl -or -not $AnonKey) {
  $MobileEnv = Join-Path $ProjectRoot "apps/mobile/.env"
  if (Test-Path $MobileEnv) {
    Get-Content $MobileEnv | ForEach-Object {
      if ($_ -match '^\s*EXPO_PUBLIC_SUPABASE_URL=(.+)$') { $SupabaseUrl = $matches[1].Trim() }
      if ($_ -match '^\s*EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)$') { $AnonKey = $matches[1].Trim() }
    }
  }
}

if (-not $SupabaseUrl) {
  throw "Set EXPO_PUBLIC_SUPABASE_URL or apps/mobile/.env before running tests."
}

function Invoke-JsonPost {
  param(
    [string]$Url,
    [hashtable]$Body,
    [hashtable]$Headers = @{}
  )
  $json = $Body | ConvertTo-Json -Depth 6 -Compress
  $allHeaders = @{ "Content-Type" = "application/json"; apikey = $AnonKey } + $Headers
  try {
    return Invoke-RestMethod -Uri $Url -Method Post -Headers $allHeaders -Body $json
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
      try { return ($text | ConvertFrom-Json) } catch { return @{ raw = $text; status = [int]$resp.StatusCode } }
    }
    throw
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "ASSERT FAILED: $Message" }
}

$TestPhotoBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q=="
$PlaceholderPhotoUploadId = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111"

function Get-RegisterVisitorBody {
  param(
    [string]$FlatId,
    [string]$VisitorMobile,
    [string]$PhotoUploadId = $PlaceholderPhotoUploadId,
    [string]$ResidentId,
    [string]$PurposeCode = "guest",
    [string]$RegistrationMode = "register_without_otp",
    [bool]$VehicleVisuallyChecked = $false,
    [string]$Notes
  )

  $body = @{
    flat_id = $FlatId
    visitor_mobile = $VisitorMobile
    registration_mode = $RegistrationMode
    purpose_code = $PurposeCode
    photo_upload_id = $PhotoUploadId
    vehicle_visually_checked = $VehicleVisuallyChecked
  }

  if ($ResidentId) { $body.resident_id = $ResidentId }
  if ($Notes) { $body.notes = $Notes }
  return $body
}

function New-TestPhotoUpload {
  param([string]$AccessToken)

  $uploadUrl = "$SupabaseUrl/functions/v1/upload-visitor-photo"
  $upload = Invoke-JsonPost -Url $uploadUrl -Headers @{ Authorization = "Bearer $AccessToken" } -Body @{
    image_base64 = $TestPhotoBase64
    content_type = "image/jpeg"
  }

  Assert-True ($null -ne $upload.photoUploadId) "Photo upload failed"
  return $upload.photoUploadId
}

Write-Host "=== register-visitor integration tests ==="
Write-Host "Function base: $FunctionBaseUrl"
Write-Host "Supabase URL: $SupabaseUrl"

Write-Host "`n[setup] Inserting temporary DEMO2/DEMO test fixtures..."
$setupSql = @"
insert into public.flats (id, society_id, flat_number, status)
values
  ('33333333-3333-4333-a333-333333333301', '11111111-1111-1111-1111-111111111102', 'M02-T101', 'active'),
  ('33333333-3333-4333-a333-333333333302', '11111111-1111-1111-1111-111111111101', 'M02-T101', 'active')
on conflict (society_id, flat_number) do update set status = excluded.status;

insert into public.residents (id, society_id, name, mobile, status)
values ('44444444-4444-4444-8444-444444444401', '11111111-1111-1111-1111-111111111102', 'M02 Test Resident', '9999900001', 'active')
on conflict (id) do nothing;

insert into public.resident_flats (id, society_id, resident_id, flat_id)
values ('55555555-5555-4555-a555-555555555501', '11111111-1111-1111-1111-111111111102', '44444444-4444-4444-8444-444444444401', '33333333-3333-4333-a333-333333333301')
on conflict (resident_id, flat_id) do nothing;

insert into public.residents (id, society_id, name, mobile, status)
values ('44444444-4444-4444-8444-444444444402', '11111111-1111-1111-1111-111111111102', 'M02 Unlinked Resident', '9999900002', 'active')
on conflict (id) do nothing;
"@

npx supabase db query --linked $setupSql | Out-Null

$DEMO2FlatId = "33333333-3333-4333-a333-333333333301"
$DEMOFlatId = "33333333-3333-4333-a333-333333333302"
$DEMO2ResidentId = "44444444-4444-4444-8444-444444444401"
$DEMO2UnlinkedResidentId = "44444444-4444-4444-8444-444444444402"

function Get-Guard02Token {
  $login = Invoke-JsonPost -Url "$SupabaseUrl/functions/v1/auth-login" -Body @{
    societyCode = "DEMO2"
    loginId = "GUARD02"
    password = "guard123"
  }
  Assert-True ($null -ne $login.session.accessToken) "GUARD02 login failed"
  return $login.session.accessToken
}

function Get-Admin2Token {
  $login = Invoke-JsonPost -Url "$SupabaseUrl/functions/v1/auth-login" -Body @{
    societyCode = "DEMO2"
    loginId = "ADMIN2"
    password = "admin123"
  }
  Assert-True ($null -ne $login.session.accessToken) "ADMIN2 login failed"
  return $login.session.accessToken
}

$results = @()

try {
  Write-Host "`n[H] Regression: validate-society-code DEMO2"
  $validate = Invoke-JsonPost -Url "$SupabaseUrl/functions/v1/validate-society-code" -Body @{ societyCode = "DEMO2" }
  Assert-True ($validate.society.societyCode -eq "DEMO2") "DEMO2 society validation failed"
  $results += "H PASS - DEMO2 society validation unaffected"

  Write-Host "`n[G] Unauthenticated request"
  $unauth = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Body (Get-RegisterVisitorBody -FlatId $DEMO2FlatId -VisitorMobile "9876543210")
  Assert-True ($unauth.error.code -eq "UNAUTHORIZED") "Expected UNAUTHORIZED"
  $results += "G PASS - unauthenticated rejected"

  $guardToken = Get-Guard02Token
  $adminToken = Get-Admin2Token
  $authHeader = @{ Authorization = "Bearer $guardToken" }

  Write-Host "`n[B] Invalid mobile"
  $badMobile = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers $authHeader -Body (Get-RegisterVisitorBody -FlatId $DEMO2FlatId -VisitorMobile "12345")
  Assert-True ($badMobile.error.code -eq "VALIDATION_ERROR") "Expected VALIDATION_ERROR for mobile"
  $results += "B PASS - invalid mobile rejected"

  Write-Host "`n[C] Missing required field (purpose_code)"
  $missingPurpose = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers $authHeader -Body @{
    flat_id = $DEMO2FlatId
    visitor_mobile = "9876543210"
    registration_mode = "register_without_otp"
    photo_upload_id = $PlaceholderPhotoUploadId
    vehicle_visually_checked = $false
  }
  Assert-True ($missingPurpose.error.code -eq "VALIDATION_ERROR") "Expected VALIDATION_ERROR for missing purpose_code"
  $results += "C PASS - missing purpose_code rejected"

  Write-Host "`n[C2] Missing required field (flat_id)"
  $missingFlat = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers $authHeader -Body (Get-RegisterVisitorBody -FlatId "" -VisitorMobile "9876543210")
  Assert-True ($missingFlat.error.code -eq "VALIDATION_ERROR") "Expected VALIDATION_ERROR for missing flat_id"
  $results += "C PASS - missing flat_id rejected"

  Write-Host "`n[D] Unauthorized role (ADMIN2)"
  $adminAttempt = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers @{ Authorization = "Bearer $adminToken" } -Body (Get-RegisterVisitorBody -FlatId $DEMO2FlatId -VisitorMobile "9876543210")
  Assert-True ($adminAttempt.error.code -eq "FORBIDDEN") "Expected FORBIDDEN for admin"
  $results += "D PASS - admin rejected"

  Write-Host "`n[E] Wrong-society flat"
  $wrongSociety = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers $authHeader -Body (Get-RegisterVisitorBody -FlatId $DEMOFlatId -VisitorMobile "9876543210")
  Assert-True ($wrongSociety.error.code -eq "FORBIDDEN") "Expected FORBIDDEN for cross-society flat"
  $results += "E PASS - cross-society flat rejected"

  Write-Host "`n[F] Invalid resident/flat relationship"
  $badResident = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers $authHeader -Body (Get-RegisterVisitorBody -FlatId $DEMO2FlatId -VisitorMobile "9876543210" -ResidentId $DEMO2UnlinkedResidentId)
  Assert-True ($badResident.error.code -eq "INVALID_RESIDENT_FLAT_RELATIONSHIP") "Expected INVALID_RESIDENT_FLAT_RELATIONSHIP"
  $results += "F PASS - invalid resident/flat rejected"

  Write-Host "`n[A] Positive: GUARD02 registers visitor with mandatory photo"
  $mobile = "9{0}{1}" -f (Get-Random -Minimum 100000000 -Maximum 999999999), (Get-Random -Minimum 0 -Maximum 9)
  $mobile = $mobile.Substring(0, 10)
  $photoUploadId = New-TestPhotoUpload -AccessToken $guardToken
  $success = Invoke-JsonPost -Url "$FunctionBaseUrl/register-visitor" -Headers $authHeader -Body (Get-RegisterVisitorBody -FlatId $DEMO2FlatId -VisitorMobile $mobile -PhotoUploadId $photoUploadId -ResidentId $DEMO2ResidentId -Notes "M02 integration test")
  Assert-True ($null -ne $success.visitorEntry.id) "Expected visitorEntry"
  Assert-True ($success.visitorEntry.status -eq "checked_in") "Expected checked_in status"
  Assert-True ($success.visitorEntry.createdByAppUserId -eq "22222222-2222-2222-2222-222222222204") "created_by must be GUARD02"
  Assert-True ($success.visitorEntry.societyId -eq "11111111-1111-1111-1111-111111111102") "society must be DEMO2"
  Assert-True ($success.visitorEntry.verificationMethod -eq "OTP_NOT_PERFORMED") "Expected OTP_NOT_PERFORMED"
  $results += "A PASS - GUARD02 created visitor entry $($success.visitorEntry.id)"

  Write-Host "`n=== ALL TESTS PASSED ==="
  $results | ForEach-Object { Write-Host $_ }
} catch {
  Write-Host "`n=== TEST FAILED ==="
  Write-Host $_.Exception.Message
  if ($results.Count -gt 0) {
    Write-Host "`nCompleted before failure:"
    $results | ForEach-Object { Write-Host $_ }
  }
  exit 1
}
