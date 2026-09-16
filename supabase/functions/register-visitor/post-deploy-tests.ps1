# M02 post-deployment security tests (read-only DB verification after Test A)
$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
Set-Location $ProjectRoot

$SupabaseUrl = "https://pdjboswcspakcnwjzfmi.supabase.co"
$AnonKey = (Get-Content "apps/mobile/.env" | Where-Object { $_ -match 'EXPO_PUBLIC_SUPABASE_ANON_KEY=' }) -replace 'EXPO_PUBLIC_SUPABASE_ANON_KEY=',''
$FunctionUrl = "$SupabaseUrl/functions/v1/register-visitor"
$PhotoUploadUrl = "$SupabaseUrl/functions/v1/upload-visitor-photo"

$DEMO2_SOCIETY = "11111111-1111-1111-1111-111111111102"
$GUARD02_ID = "22222222-2222-2222-2222-222222222204"
$DEMO2_FLAT = "33333333-3333-4333-a333-333333333301"
$DEMO_FLAT = "33333333-3333-4333-a333-333333333302"
$DEMO2_RESIDENT_LINKED = "44444444-4444-4444-8444-444444444401"
$DEMO2_RESIDENT_UNLINKED = "44444444-4444-4444-8444-444444444402"
$PlaceholderPhotoUploadId = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111"
$TestPhotoBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q=="

function Invoke-Api {
  param(
    [string]$Url,
    [hashtable]$Body,
    [hashtable]$Headers = @{},
    [switch]$Raw
  )
  $json = $Body | ConvertTo-Json -Depth 6 -Compress
  $allHeaders = @{ "Content-Type" = "application/json"; apikey = $AnonKey } + $Headers
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method Post -Headers $allHeaders -Body $json -UseBasicParsing
    $parsed = $resp.Content | ConvertFrom-Json
    return @{ status = [int]$resp.StatusCode; body = $parsed }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
      try { $parsed = $text | ConvertFrom-Json } catch { $parsed = @{ raw = $text } }
      return @{ status = [int]$resp.StatusCode; body = $parsed }
    }
    throw
  }
}

function Get-Token {
  param([string]$LoginId, [string]$Password)
  $r = Invoke-Api -Url "$SupabaseUrl/functions/v1/auth-login" -Body @{
    societyCode = "DEMO2"; loginId = $LoginId; password = $Password
  }
  if ($r.status -ne 200 -or -not $r.body.session.accessToken) {
    throw "$LoginId login failed status=$($r.status)"
  }
  return $r.body.session.accessToken
}

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
  $r = Invoke-Api -Url $PhotoUploadUrl -Headers @{ Authorization = "Bearer $AccessToken" } -Body @{
    image_base64 = $TestPhotoBase64
    content_type = "image/jpeg"
  }
  if ($r.status -ne 200 -or -not $r.body.photoUploadId) {
    throw "Photo upload failed status=$($r.status) code=$($r.body.error.code)"
  }
  return $r.body.photoUploadId
}

$results = @{}
$testAEntryId = $null
$testAMobile = ("9{0:D9}" -f (Get-Random -Minimum 0 -Maximum 999999999)).Substring(0,10)

Write-Host "=== M02 Post-Deployment Security Tests ==="

# TEST H
Write-Host "`n[H] Auth regression"
$validate = Invoke-Api -Url "$SupabaseUrl/functions/v1/validate-society-code" -Body @{ societyCode = "DEMO2" }
$guardLogin = Invoke-Api -Url "$SupabaseUrl/functions/v1/auth-login" -Body @{
  societyCode = "DEMO2"; loginId = "GUARD02"; password = "guard123"
}
$hPass = ($validate.status -eq 200 -and $validate.body.society.societyCode -eq "DEMO2" -and $guardLogin.status -eq 200 -and $guardLogin.body.session.user.role -eq "guard")
$results.H = @{ expected = "Pass"; actual = if ($hPass) { "DEMO2 validate OK; GUARD02 login OK" } else { "validate=$($validate.status) login=$($guardLogin.status)" }; result = if ($hPass) { "PASS" } else { "FAIL" } }

$guardToken = $guardLogin.body.session.accessToken
$adminToken = Get-Token -LoginId "ADMIN2" -Password "admin123"

# TEST G
Write-Host "`n[G] Unauthenticated"
$g = Invoke-Api -Url $FunctionUrl -Body (Get-RegisterVisitorBody -FlatId $DEMO2_FLAT -VisitorMobile "9876543210")
$gPass = ($g.status -eq 401 -and $g.body.error.code -eq "UNAUTHORIZED")
$results.G = @{ expected = "Reject"; actual = "HTTP $($g.status) code=$($g.body.error.code)"; result = if ($gPass) { "PASS" } else { "FAIL" } }

# TEST D
Write-Host "`n[D] Admin rejected"
$d = Invoke-Api -Url $FunctionUrl -Headers @{ Authorization = "Bearer $adminToken" } -Body (Get-RegisterVisitorBody -FlatId $DEMO2_FLAT -VisitorMobile "9876543211")
$dPass = ($d.status -eq 403 -and $d.body.error.code -eq "FORBIDDEN")
$results.D = @{ expected = "Reject"; actual = "HTTP $($d.status) code=$($d.body.error.code)"; result = if ($dPass) { "PASS" } else { "FAIL" } }

# TEST E
Write-Host "`n[E] Cross-society flat"
$e = Invoke-Api -Url $FunctionUrl -Headers @{ Authorization = "Bearer $guardToken" } -Body (Get-RegisterVisitorBody -FlatId $DEMO_FLAT -VisitorMobile "9876543212")
$ePass = ($e.status -eq 403 -and $e.body.error.code -eq "FORBIDDEN")
$results.E = @{ expected = "Reject"; actual = "HTTP $($e.status) code=$($e.body.error.code)"; result = if ($ePass) { "PASS" } else { "FAIL" } }

# TEST F
Write-Host "`n[F] Invalid resident/flat"
$f = Invoke-Api -Url $FunctionUrl -Headers @{ Authorization = "Bearer $guardToken" } -Body (Get-RegisterVisitorBody -FlatId $DEMO2_FLAT -VisitorMobile "9876543213" -ResidentId $DEMO2_RESIDENT_UNLINKED)
$fPass = ($f.status -eq 400 -and $f.body.error.code -eq "INVALID_RESIDENT_FLAT_RELATIONSHIP")
$results.F = @{ expected = "Reject"; actual = "HTTP $($f.status) code=$($f.body.error.code)"; result = if ($fPass) { "PASS" } else { "FAIL" } }

# TEST A
Write-Host "`n[A] Valid GUARD02 registration with mandatory photo"
$photoUploadId = New-TestPhotoUpload -AccessToken $guardToken
$a = Invoke-Api -Url $FunctionUrl -Headers @{ Authorization = "Bearer $guardToken" } -Body (Get-RegisterVisitorBody -FlatId $DEMO2_FLAT -VisitorMobile $testAMobile -PhotoUploadId $photoUploadId -ResidentId $DEMO2_RESIDENT_LINKED -Notes "Post-deploy Test A")
$aPass = ($a.status -eq 201 -and $a.body.visitorEntry.id -and $a.body.visitorEntry.status -eq "checked_in" -and $a.body.visitorEntry.societyId -eq $DEMO2_SOCIETY -and $a.body.visitorEntry.createdByAppUserId -eq $GUARD02_ID -and $a.body.visitorEntry.checkInAt -and $a.body.visitorEntry.verificationMethod -eq "OTP_NOT_PERFORMED")
if ($aPass) { $testAEntryId = $a.body.visitorEntry.id }
$results.A = @{
  expected = "Success"
  actual = "HTTP $($a.status) id=$($a.body.visitorEntry.id) society=$($a.body.visitorEntry.societyId) creator=$($a.body.visitorEntry.createdByAppUserId) status=$($a.body.visitorEntry.status) verification=$($a.body.visitorEntry.verificationMethod) checkInAt=$($a.body.visitorEntry.checkInAt)"
  result = if ($aPass) { "PASS" } else { "FAIL" }
}

Write-Host "`n=== RESULTS JSON ==="
@{
  results = $results
  testAEntryId = $testAEntryId
  testAMobile = $testAMobile
  photoUploadId = $photoUploadId
} | ConvertTo-Json -Depth 6
