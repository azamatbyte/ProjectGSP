param([string]$ConnStr)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

try {
    $conn = New-Object System.Data.OleDb.OleDbConnection($ConnStr)
    $conn.Open()

    $tables = $conn.GetOleDbSchemaTable(
        [System.Data.OleDb.OleDbSchemaGuid]::Tables,
        @($null,$null,$null,"TABLE"))

    foreach ($trow in $tables.Rows) {
        $tname = $trow["TABLE_NAME"]
        if ($tname.StartsWith("MSys") -or $tname.StartsWith("~")) { continue }

        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT COUNT(*) FROM [$tname]"
        $cnt = $cmd.ExecuteScalar()
        $cmd.Dispose()
        Write-Output "TABLE:$tname|ROWS:$cnt"

        $cols = $conn.GetOleDbSchemaTable(
            [System.Data.OleDb.OleDbSchemaGuid]::Columns,
            @($null,$null,$tname,$null))
        $sorted = $cols.Select("","ORDINAL_POSITION ASC")
        foreach ($crow in $sorted) {
            $cname = $crow["COLUMN_NAME"]
            $ctype = $crow["DATA_TYPE"]
            $clen  = $crow["CHARACTER_MAXIMUM_LENGTH"]
            if ($clen -eq $null -or $clen -eq [System.DBNull]::Value) { $clen = 0 }
            Write-Output "COL:$cname|TYPE:$ctype|LEN:$clen"
        }

        try {
            $pks = $conn.GetOleDbSchemaTable(
                [System.Data.OleDb.OleDbSchemaGuid]::Primary_Keys,
                @($null,$null,$tname))
            foreach ($pkrow in $pks.Rows) {
                Write-Output ("PK:" + $pkrow["COLUMN_NAME"])
            }
        } catch {}

        Write-Output "END_TABLE"
    }

    $conn.Close()
    Write-Output "SCHEMA_DONE"
} catch {
    Write-Output ("SCHEMA_ERROR:" + $_.Exception.Message)
}
