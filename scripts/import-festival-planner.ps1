$ErrorActionPreference = 'Stop'

$projectId = 'temple-volunteers-8ff23'
$database = '(default)'
$festivals = @(
  @{ Name = 'Nityanand Trayodashi'; Start = '2026-01-31' },
  @{ Name = 'Gaura Purnima'; Start = '2026-03-03' },
  @{ Name = 'Rama Navami'; Start = '2026-03-26' },
  @{ Name = 'Narasimha Yajna / Narasinha Chaturdashi'; Start = '2026-04-30' },
  @{ Name = 'Snana Yatra'; Start = '2026-06-29' },
  @{ Name = 'Ratha Yatra'; Start = '2026-07-16' },
  @{ Name = 'Balaram Jayanti'; Start = '2026-09-02' },
  @{ Name = 'Janmastami'; Start = '2026-09-04'; ExistingName = 'Janmashtami' },
  @{ Name = "Srila Prabhupad's appearance day"; Start = '2026-09-05' },
  @{ Name = 'Radhastami'; Start = '2026-09-19'; ExistingName = 'Radhasthami' },
  @{ Name = 'Bahulastami'; Start = '2026-11-02' },
  @{ Name = 'Diwali'; Start = '2026-11-08' },
  @{ Name = 'Prabhupada disappearance day'; Start = '2026-11-12' },
  @{ Name = 'Govardhan Puja'; Start = '2026-11-10' },
  @{ Name = 'Gopastami'; Start = '2026-11-17' },
  @{ Name = 'Bhishma Panchak'; Start = '2026-11-17'; End = '2026-11-21' },
  @{ Name = 'Gita Jayanti'; Start = '2026-12-20' },
  @{ Name = 'Hanuman Jayanti'; Start = '2026-04-01' },
  @{ Name = 'Vasant Panchmi'; Start = '2026-02-01' },
  @{ Name = 'Sita Navami'; Start = '2026-04-25' }
)

function Get-Slug([string]$value) {
  return (($value.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-'))
}

function Get-EasternTimestamp([string]$date) {
  $zone = [TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
  $local = [datetime]::SpecifyKind([datetime]::ParseExact($date, 'yyyy-MM-dd', $null), [DateTimeKind]::Unspecified)
  return [TimeZoneInfo]::ConvertTimeToUtc($local, $zone).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}

$auth = & node_modules\.bin\firebase.cmd login:list --json | ConvertFrom-Json
$token = $auth.result[0].tokens.access_token
if (-not $token) { throw 'Firebase CLI is not authenticated.' }
$headers = @{ Authorization = "Bearer $token" }
$baseUri = "https://firestore.googleapis.com/v1/projects/$projectId/databases/$database/documents/events"
$current = Invoke-RestMethod -Uri "${baseUri}?pageSize=500" -Headers $headers
$byName = @{}
foreach ($document in @($current.documents)) {
  $name = $document.fields.name.stringValue
  if ($name) { $byName[$name.ToLowerInvariant()] = ($document.name -split '/')[-1] }
}

$created = 0
$updated = 0
foreach ($festival in $festivals) {
  $lookupName = if ($festival.ExistingName) { $festival.ExistingName } else { $festival.Name }
  $existingId = $byName[$lookupName.ToLowerInvariant()]
  $documentId = if ($existingId) { $existingId } else { "festival-2026-$(Get-Slug $festival.Name)" }
  $fields = @{
    date = @{ timestampValue = Get-EasternTimestamp $festival.Start }
    allDay = @{ booleanValue = $true }
    description = @{ stringValue = 'Imported from 2026 Festival Planner.xlsx, Sheet3.' }
  }
  $mask = @('date', 'allDay', 'description')
  if ($festival.End) {
    $fields.endDate = @{ timestampValue = Get-EasternTimestamp $festival.End }
    $mask += 'endDate'
  }
  if (-not $existingId) {
    $fields.name = @{ stringValue = $festival.Name }
    $fields.endDate = if ($festival.End) { $fields.endDate } else { @{ nullValue = $null } }
    $fields.location = @{ stringValue = '' }
    $fields.color = @{ stringValue = '#2f7d32' }
    $fields.status = @{ stringValue = 'planned' }
    $fields.whatsappReminderEnabled = @{ booleanValue = $false }
    $fields.reminderHoursBefore = @{ arrayValue = @{ values = @(@{ integerValue = '24' }) } }
    $fields.reminderVersion = @{ integerValue = '0' }
    $fields.createdBy = @{ stringValue = 'festival-planner-import' }
    $fields.createdAt = @{ timestampValue = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }
    $mask = @($fields.Keys)
  }
  $query = ($mask | ForEach-Object { 'updateMask.fieldPaths=' + [uri]::EscapeDataString($_) }) -join '&'
  $body = @{ fields = $fields } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Patch -Uri "$baseUri/$documentId`?$query" -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
  if ($existingId) { $updated += 1 } else { $created += 1 }
  Write-Output ("Imported {0} ({1})" -f $festival.Name, $festival.Start)
}

Write-Output ("Complete: {0} created, {1} existing events updated." -f $created, $updated)
