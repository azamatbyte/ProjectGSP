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

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\scripts\\stop_services.ps1"""; Flags: runhidden

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

[Messages]
ConfirmUninstall=Are you sure you want to uninstall {#MyAppName}? Data directory in ProgramData will remain unless removed manually.
