; Combined Installer for GSP Application (Backend + Frontend)
; Inno Setup Script - Creates unified installer for Windows 10/11

#define MyAppName "GSPApp"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "GSP"
#define MyAppURL "http://localhost"
#define MyAppExeName "КОМПЛЕКС.exe"

[Setup]
AppId={{A8F21F3B-7EDE-4A6F-9D6F-9E6A8FC5F0B2}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=GSPAppInstaller
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
SetupIconFile=gsbp_mini.ico
WizardImageFile=..\..\frontedn_v2\public\img\gsbp_mini.png
WizardSmallImageFile=..\..\frontedn_v2\public\img\gsbp_mini.png
WizardImageBackColor=$403020
UninstallDisplayIcon={app}\frontend\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Types]
Name: "full"; Description: "Full installation (Backend + Frontend)"
Name: "backend"; Description: "Backend only (Server mode)"
Name: "frontend"; Description: "Frontend only (requires separate backend)"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "backend"; Description: "Backend Server (Node.js + PostgreSQL)"; Types: full backend custom
Name: "frontend"; Description: "Frontend Application (КОМПЛЕКС)"; Types: full frontend custom

[Files]
; Backend files
Source: "..\build\app\*"; DestDir: "{app}\backend\app"; Components: backend; Flags: recursesubdirs createallsubdirs
Source: "..\build\node\*"; DestDir: "{app}\backend\node"; Components: backend; Flags: recursesubdirs createallsubdirs
Source: "..\build\pg\*"; DestDir: "{app}\backend\pg"; Components: backend; Flags: recursesubdirs createallsubdirs
Source: "..\build\scripts\*"; DestDir: "{app}\backend\scripts"; Components: backend; Flags: recursesubdirs createallsubdirs

; Frontend files (unpacked electron app)
Source: "..\build\frontend\*"; DestDir: "{app}\frontend"; Components: frontend; Flags: recursesubdirs createallsubdirs

; Shared .env template
Source: "..\build\env.template"; DestDir: "{app}"; DestName: ".env.template"; Flags: ignoreversion

; Launcher scripts
Source: "scripts\launch_app.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\setup_env.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\GSPApp"; Permissions: users-modify
Name: "{commonappdata}\GSPApp\logs"; Permissions: users-modify
Name: "{commonappdata}\GSPApp\pids"; Permissions: users-modify

[Run]
; First run: setup environment
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\setup_env.ps1"" -AppRoot ""{app}\backend"""; StatusMsg: "Configuring environment..."; Components: backend; Flags: runhidden
; Initialize database
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\backend\scripts\init_db.ps1"" -AppRoot ""{app}\backend"""; StatusMsg: "Initializing database..."; Components: backend; Flags: runhidden
; Start services (must wait for completion so database is created, schema pushed, and seeded)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\backend\scripts\start_services.ps1"" -AppRoot ""{app}\backend"""; StatusMsg: "Starting services (this may take up to 60 seconds)..."; Components: backend; Flags: runhidden
; Launch frontend after install
Filename: "{app}\frontend\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Components: frontend; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\backend\scripts\stop_services.ps1"" -AppRoot ""{app}\backend"""; Components: backend; Flags: runhidden

[Icons]
; Start Menu - Backend controls
Name: "{group}\Start Backend Services"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\backend\scripts\start_services.ps1"" -AppRoot ""{app}\backend"""; Components: backend; IconFilename: "{app}\backend\node\node.exe"; Flags: runminimized
Name: "{group}\Stop Backend Services"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\backend\scripts\stop_services.ps1"" -AppRoot ""{app}\backend"""; Components: backend; IconFilename: "{app}\backend\node\node.exe"; Flags: runminimized
Name: "{group}\Open API Documentation"; Filename: "cmd.exe"; Parameters: "/C start http://localhost:8080/api/v1/api-docs"; Components: backend; IconFilename: "{app}\backend\node\node.exe"
Name: "{group}\View Logs"; Filename: "{commonappdata}\GSPApp\logs"; Components: backend

; Start Menu - Frontend
Name: "{group}\КОМПЛЕКС"; Filename: "{app}\frontend\{#MyAppExeName}"; Components: frontend; IconFilename: "{app}\frontend\{#MyAppExeName}"

; Desktop shortcut
Name: "{autodesktop}\КОМПЛЕКС"; Filename: "{app}\frontend\{#MyAppExeName}"; Components: frontend; IconFilename: "{app}\frontend\{#MyAppExeName}"
Name: "{autodesktop}\GSPApp Backend"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\backend\scripts\tray.ps1"" -AppRoot ""{app}\backend"""; Components: backend; IconFilename: "{app}\backend\node\node.exe"; Flags: runminimized

; Uninstall
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"; IconFilename: "{uninstallexe}"

[Registry]
; Add to PATH for easier access to node/pg commands if needed
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: expandsz; ValueName: "GSP_APP_PATH"; ValueData: "{app}"; Components: backend; Flags: preservestringtype uninsdeletevalue

[Messages]
SetupWindowTitle=GSBP Комплекс 1.0
ConfirmUninstall=Are you sure you want to uninstall {#MyAppName}?%n%nNote: Database and configuration files in %ProgramData%\GSPApp will NOT be deleted.%nTo completely remove all data, manually delete that folder after uninstall.
WelcomeLabel2=This will install {#MyAppName} on your computer.%n%nThe application includes:%n- Backend server (Node.js + PostgreSQL)%n- Frontend application (КОМПЛЕКС)%n%nClick Next to continue.

[Code]
// Custom code for environment setup during install
var
  HostPage: TInputQueryWizardPage;
  
procedure InitializeWizard;
begin
  // Create custom page for host/port configuration
  HostPage := CreateInputQueryPage(wpSelectComponents,
    'Server Configuration', 'Configure the backend server settings',
    'Enter the host and port for the backend server. Leave default for local use.');
  HostPage.Add('Host:', False);
  HostPage.Add('API Port:', False);
  HostPage.Add('Database Port:', False);
  
  // Set defaults
  HostPage.Values[0] := '127.0.0.1';
  HostPage.Values[1] := '8080';
  HostPage.Values[2] := '5433';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  // Skip host config page if only installing frontend
  if PageID = HostPage.ID then
    Result := not IsComponentSelected('backend');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvContent: String;
  EnvFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Create initial .env in ProgramData if backend selected
    if IsComponentSelected('backend') then
    begin
      EnvFile := ExpandConstant('{commonappdata}\GSPApp\.env');
      if not FileExists(EnvFile) then
      begin
        EnvContent := '# GSPApp Configuration' + #13#10 +
                      'HOST=' + HostPage.Values[0] + #13#10 +
                      'PORT=' + HostPage.Values[1] + #13#10 +
                      'PGPORT=' + HostPage.Values[2] + #13#10 +
                      'NODE_ENV=production' + #13#10 +
                      '# REACT_APP_SITE_BACKEND is not needed; frontend uses relative URLs' + #13#10;
        SaveStringToFile(EnvFile, EnvContent, False);
      end;
    end;
  end;
end;
