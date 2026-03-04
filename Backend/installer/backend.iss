; Inno Setup script restored
#define MyAppName "GSPApp"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Shohruz Ochilov, Mirjalol Norqobilov, Azamat Aliqulov / Cyber park"
#define MyAppURL "http://localhost"

[Setup]
AppId={{8F21F3B7-0EDE-4A6F-9D6F-9E6A8FC5F0A1}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={pf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=GSPBackendInstaller
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
WizardStyle=modern

[Files]
Source: "..\\build\\app\\*"; DestDir: "{app}\\app"; Flags: recursesubdirs createallsubdirs
Source: "..\\build\\node\\*"; DestDir: "{app}\\node"; Flags: recursesubdirs createallsubdirs
Source: "..\\build\\pg\\*";   DestDir: "{app}\\pg";   Flags: recursesubdirs createallsubdirs
Source: "..\\build\\scripts\\*"; DestDir: "{app}\\scripts"; Flags: recursesubdirs createallsubdirs
Source: "..\\build\\.env"; DestDir: "{app}"; Flags: ignoreversion

[Run]
; Use doubled quotes for embedded quotes
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\init_db.ps1"""; StatusMsg: "Initializing database..."; Flags: runhidden
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\start_services.ps1"""; StatusMsg: "Starting services..."; Flags: runhidden nowait
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""GSPApp Backend"" dir=in action=allow protocol=TCP localport=8080"; StatusMsg: "Configuring firewall..."; Flags: runhidden

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\stop_services.ps1"""; Flags: runhidden
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""GSPApp Backend"""; Flags: runhidden

[Icons]
; API docs shortcut assumes default port 8080; user can edit ProgramData .env (PORT) and use tray which reads dynamically.
Name: "{group}\\Open API Docs"; Filename: "cmd.exe"; Parameters: "/C start http://localhost:8080/api/v1/api-docs"; WorkingDir: "{app}"; IconFilename: "{app}\\node\\node.exe"
; Use doubled quotes for embedded quotes per Inno Setup escaping rules
Name: "{group}\\Start Backend"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\start_services.ps1"""; Flags: runminimized; IconFilename: "{app}\\node\\node.exe"
Name: "{group}\\Stop Backend"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\stop_services.ps1"""; Flags: runminimized; IconFilename: "{app}\\node\\node.exe"
Name: "{group}\\Open DB (pgAdmin4)"; Filename: "{app}\\pg\\pgAdmin 4\\bin\\pgAdmin4.exe"; WorkingDir: "{app}\\pg\\pgAdmin 4\\bin"; IconFilename: "{app}\\pg\\pgAdmin 4\\bin\\pgAdmin4.exe"; Check: FileExists('{app}\\pg\\pgAdmin 4\\bin\\pgAdmin4.exe')
; Tray launcher (desktop + group)
Name: "{group}\\GSPBackend Tray"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\tray.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\\node\\node.exe"; Flags: runminimized
Name: "{autodesktop}\\GSPBackend"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\tray.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\\node\\node.exe"; Flags: runminimized

[Dirs]
Name: "{commonappdata}\GSPApp"; Permissions: users-modify
Name: "{commonappdata}\GSPApp\logs"; Permissions: users-modify
Name: "{commonappdata}\GSPApp\pids"; Permissions: users-modify

[Messages]
ConfirmUninstall=Are you sure you want to uninstall {#MyAppName}? Data directory in ProgramData will remain unless removed manually.

[Code]
var
  HostPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  HostPage := CreateInputQueryPage(wpSelectDir,
    'Server Configuration', 'Configure the backend server settings',
    'Enter the host/IP for the backend server.' + #13#10 +
    'Use 0.0.0.0 to accept connections from all machines (recommended for servers).' + #13#10 +
    'Use 127.0.0.1 for local access only.');
  HostPage.Add('Host:', False);
  HostPage.Add('API Port:', False);
  HostPage.Add('Database Port:', False);

  HostPage.Values[0] := '0.0.0.0';
  HostPage.Values[1] := '8080';
  HostPage.Values[2] := '5433';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvContent: String;
  EnvFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    EnvFile := ExpandConstant('{commonappdata}\GSPApp\.env');
    if not FileExists(EnvFile) then
    begin
      EnvContent := '# GSPApp Configuration' + #13#10 +
                    'HOST=' + HostPage.Values[0] + #13#10 +
                    'PORT=' + HostPage.Values[1] + #13#10 +
                    'PGPORT=' + HostPage.Values[2] + #13#10 +
                    'NODE_ENV=production' + #13#10;
      SaveStringToFile(EnvFile, EnvContent, False);
    end;
  end;
end;
