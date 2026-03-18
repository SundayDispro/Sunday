param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = 'Stop'

$u = $DatabaseUrl.Trim()
if (-not $u) { exit 1 }

# Soporta URLs con formato:
# postgresql://user:pass@host:port/db?schema=public
# Nota: si la contraseña contiene '@' sin estar percent-encoded, ningún parser simple lo manejará bien.
$pattern = '^postgres(?:ql)?:\/\/(?<user>[^:\/@]+)(?::(?<pass>[^@\/]*))?@(?<host>[^:\/@]+)(?::(?<port>\d+))?\/(?<db>[^?\/]+)(?:\?(?<query>.*))?$'
if (-not ($u -match $pattern)) { exit 2 }

$user = $Matches.user
$pass = $Matches.pass
if ($null -eq $pass) { $pass = '' }

$dbHost = $Matches.host
$port = $Matches.port
if ($null -eq $port -or -not $port) { $port = '5432' }

$dbName = $Matches.db

$schema = 'public'
if ($u -match '[?&]schema=([^&]+)') {
  $schema = $Matches[1]
}

Write-Output ("{0}|{1}|{2}|{3}|{4}|{5}" -f $user, $pass, $dbHost, $port, $dbName, $schema)

