# Windows PowerShell commands

Use these in the VS Code / Cursor terminal on Windows. This Cloud Agent built the project for you; you do not need to recreate files unless you want to learn the steps.

## Phase 1 — environment and project

```powershell
flutter --version
dart --version
flutter doctor
```

If you are creating a new empty project yourself (this repo already contains `fixrwanda`):

```powershell
flutter create --org rw.fixrwanda --project-name fixrwanda --platforms android,ios --description "Kigali home and professional services marketplace" fixrwanda
cd fixrwanda
flutter pub get
```

If the project already exists in this repository:

```powershell
cd fixrwanda
flutter pub get
flutter devices
```

## Phase 2 — dependencies

```powershell
cd fixrwanda
flutter pub add provider intl uuid
flutter pub get
```

Create folders (only if you are rebuilding by hand):

```powershell
New-Item -ItemType Directory -Force -Path "lib\models","lib\screens","lib\widgets","lib\services","lib\repositories","lib\providers","lib\utils","lib\theme","lib\data","docs","test"
```

## Phases 3–10 — after pulling this branch

```powershell
cd fixrwanda
flutter pub get
flutter analyze
flutter test
flutter devices
flutter run
```

## Phase 11 — Android APK

```powershell
cd fixrwanda
flutter devices
flutter build apk --release
explorer.exe build\app\outputs\flutter-apk
```

Install on a plugged-in phone:

```powershell
adb install -r build\app\outputs\flutter-apk\app-release.apk
```

## Phase 12 — later REST API

See `docs/api-plan.md`. No extra Flutter command is required until you add `http` or `dio`:

```powershell
cd fixrwanda
flutter pub add http
flutter pub get
```
