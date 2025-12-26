param(
  [string]$Database = "ttrpg",
  [string]$User = "ttrpg"
)

$ErrorActionPreference = "Stop"

$sql = @'
SELECT pg_terminate_backend(pid)
FROM pg_locks
WHERE locktype = 'advisory'
  AND classid = 0
  AND objid = 72707369
  AND pid <> pg_backend_pid();
'@

docker compose exec -T db psql -U $User -d $Database -c $sql
