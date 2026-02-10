param([string]$ConnStr, [string]$TableName)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Data.OleDb;
using System.Globalization;
using System.Text;

public static class AccessStreamer
{
    static string JEsc(string s)
    {
        if (s == null) return "";
        var sb = new StringBuilder(s.Length);
        foreach (char c in s)
        {
            switch (c)
            {
                case '"':  sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < ' ') sb.AppendFormat("\\u{0:x4}", (int)c);
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    public static void Stream(string connStr, string tableName)
    {
        Console.OutputEncoding = Encoding.UTF8;
        using (var conn = new OleDbConnection(connStr))
        {
            conn.Open();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT * FROM [" + tableName.Replace("]", "]]") + "]";
                using (var r = cmd.ExecuteReader())
                {
                    int fc = r.FieldCount;
                    var names = new string[fc];
                    var types = new Type[fc];
                    for (int i = 0; i < fc; i++)
                    {
                        names[i] = JEsc(r.GetName(i));
                        types[i] = r.GetFieldType(i);
                    }

                    var sb = new StringBuilder(4096);
                    int count = 0;

                    while (r.Read())
                    {
                        sb.Clear();
                        sb.Append('{');
                        for (int i = 0; i < fc; i++)
                        {
                            if (i > 0) sb.Append(',');
                            sb.Append('"').Append(names[i]).Append("\":");

                            if (r.IsDBNull(i))
                            {
                                sb.Append("null");
                            }
                            else if (types[i] == typeof(int) || types[i] == typeof(short)
                                     || types[i] == typeof(long) || types[i] == typeof(byte))
                            {
                                sb.Append(Convert.ToInt64(r.GetValue(i)).ToString(CultureInfo.InvariantCulture));
                            }
                            else if (types[i] == typeof(bool))
                            {
                                sb.Append(r.GetBoolean(i) ? "true" : "false");
                            }
                            else if (types[i] == typeof(DateTime))
                            {
                                sb.Append('"');
                                sb.Append(r.GetDateTime(i).ToString("yyyy-MM-ddTHH:mm:ss"));
                                sb.Append('"');
                            }
                            else if (types[i] == typeof(double) || types[i] == typeof(float)
                                     || types[i] == typeof(decimal))
                            {
                                sb.Append(Convert.ToDouble(r.GetValue(i)).ToString(CultureInfo.InvariantCulture));
                            }
                            else if (types[i] == typeof(byte[]))
                            {
                                sb.Append('"');
                                sb.Append(Convert.ToBase64String((byte[])r.GetValue(i)));
                                sb.Append('"');
                            }
                            else
                            {
                                sb.Append('"');
                                sb.Append(JEsc(r.GetValue(i).ToString()));
                                sb.Append('"');
                            }
                        }
                        sb.Append('}');
                        Console.Out.WriteLine(sb.ToString());
                        count++;
                    }
                    Console.Out.WriteLine("DONE:" + count);
                }
            }
        }
    }
}
'@ -ReferencedAssemblies System.Data

try {
    [AccessStreamer]::Stream($ConnStr, $TableName)
} catch {
    Write-Output ("STREAM_ERROR:" + $_.Exception.Message)
    exit 1
}
