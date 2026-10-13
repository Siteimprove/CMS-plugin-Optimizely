"""Run a disposable SQL Server and localhost CMS, retaining only sanitized evidence."""
import argparse
import json
import os
from pathlib import Path
import secrets
import resource
import shutil
import signal
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SQL_IMAGE = 'mcr.microsoft.com/mssql/server:2022-CU22-ubuntu-22.04@sha256:db9a8fe3098b7e8bbde41106bdc7caee942e97124e5fdb71b872ca208de3092d'


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--live', action='store_true')
    mode.add_argument('--upgrade', action='store_true')
    args = parser.parse_args()
    live, upgrade = args.live, args.upgrade
    if not live and any(key.startswith('SITEIMPROVE_') and value for key, value in os.environ.items()):
        raise SystemExit('Do not supply live configuration to the controlled-response suite.')
    if live:
        shutil.rmtree(ROOT / 'artifacts/live', ignore_errors=True)
        subprocess.run(['node', '--input-type=module', '-e',
            "import { settings } from './tests/live/settings.mjs'; try { settings(process.env); } catch { process.exit(1); }"],
            cwd=ROOT, check=True)
    if not shutil.which('docker'):
        raise SystemExit('Docker is required: use an x64 Linux host or the GitHub-hosted CMS job.')
    host = ROOT / 'artifacts/host'
    evidence = ROOT / 'artifacts/evidence'
    evidence.mkdir(parents=True, exist_ok=True)
    password = 'T!' + secrets.token_hex(24)
    editor_password = 'E!' + secrets.token_hex(24)
    container = 'cms-sql-' + secrets.token_hex(6)
    env = dict(os.environ, ACCEPT_EULA='Y', MSSQL_PID='Developer', MSSQL_SA_PASSWORD=password,
               SQLCMDPASSWORD=password, CMS_EDITOR_PASSWORD=editor_password,
               CMS_DRAFT_MARKER='CMS-DRAFT-' + secrets.token_hex(12),
               CMS_DRAFT_FIXED_MARKER='CMS-FIXED-' + secrets.token_hex(12),
               CMS_TEST_HOST='1', CMS_SITEIMPROVE_MODE='live' if live else 'stub', ASPNETCORE_ENVIRONMENT='Development',
               Logging__LogLevel__Default='Warning', Logging__LogLevel__Microsoft='Warning')
    started = time.monotonic()
    timings = {'sqlImage': SQL_IMAGE}
    process = None
    raw = evidence / 'host.raw.log'
    def stop_on_signal(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop_on_signal)
    try:
        subprocess.run(['docker', 'run', '-d', '--name', container, '--memory', '3g', '--cpus', '2',
                        '-p', '127.0.0.1::1433', '-e', 'ACCEPT_EULA', '-e', 'MSSQL_PID',
                        '-e', 'MSSQL_SA_PASSWORD', SQL_IMAGE], env=env, check=True, stdout=subprocess.DEVNULL)
        sqlcmd = ['docker', 'exec', '-e', 'SQLCMDPASSWORD', container, '/opt/mssql-tools18/bin/sqlcmd',
                  '-S', 'localhost', '-U', 'sa', '-C', '-b', '-l', '2']
        deadline = time.monotonic() + 120
        while subprocess.run(sqlcmd + ['-Q', 'SELECT 1'], env=env, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL).returncode:
            if time.monotonic() >= deadline:
                raise RuntimeError('SQL Server did not become ready within 120 seconds')
            time.sleep(1)
        timings['sqlReadySeconds'] = round(time.monotonic() - started, 2)
        subprocess.run(sqlcmd + ['-Q', 'CREATE DATABASE CmsIntegration'], env=env, check=True,
                       stdout=subprocess.DEVNULL)
        port = subprocess.check_output(['docker', 'port', container, '1433/tcp'], text=True).strip().rsplit(':', 1)[1]
        env['ConnectionStrings__EPiServerDB'] = f'Server=127.0.0.1,{port};Database=CmsIntegration;User Id=sa;Password={password};Encrypt=True;TrustServerCertificate=True'
        with (open(os.devnull, 'w') if live else raw.open('w')) as log:
            for phase in (['before', 'after'] if upgrade else ['single']):
                active_host = ROOT / 'artifacts/host-baseline' if phase == 'before' else host
                if upgrade:
                    env['CMS_UPGRADE_PHASE'] = phase
                    env['CMS_EXPECTED_VERSION'] = '4.3.3' if phase == 'before' else json.loads(
                        (ROOT / 'artifacts/candidate/manifest.json').read_text())['packageVersion']
                    if phase == 'after':
                        shutil.copytree(ROOT / 'artifacts/host-baseline/App_Data', host / 'App_Data', dirs_exist_ok=True)
                process = subprocess.Popen(['dotnet', 'bin/Release/net8.0/CmsHost.dll'], cwd=active_host, env=env,
                                           stdout=log, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 180
                while True:
                    if process.poll() is not None:
                        raise RuntimeError('CMS exited before readiness; see sanitized host.log')
                    try:
                        with urllib.request.urlopen('http://localhost:5000/test/ready', timeout=2) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        pass
                    if time.monotonic() >= deadline:
                        raise RuntimeError('CMS did not become ready within 180 seconds')
                    time.sleep(1)
                timings['cmsReadySeconds'] = round(time.monotonic() - started, 2)
                timings['sqlResources'] = json.loads(subprocess.check_output(
                    ['docker', 'stats', '--no-stream', '--format', '{{json .}}', container], text=True))
                subprocess.run(['npm', 'run', 'test:upgrade' if upgrade else ('test:live' if live else 'test:cms')], cwd=ROOT, env=env,
                               check=True, timeout=900, stdout=subprocess.DEVNULL if live else None,
                               stderr=subprocess.DEVNULL if live else None)
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if raw.exists():
            text = raw.read_text(errors='replace').replace(password, '[redacted]').replace(editor_password, '[redacted]')
            (evidence / 'host.log').write_text(text)
            raw.unlink()
        if not live:
            result = subprocess.run(['docker', 'logs', container], capture_output=True, text=True)
            (evidence / 'sql.log').write_text((result.stdout + result.stderr).replace(password, '[redacted]'))
        else:
            shutil.rmtree(ROOT / 'artifacts/live-private', ignore_errors=True)
        subprocess.run(['docker', 'rm', '-f', '-v', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        timings['childPeakRssNativeUnits'] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
        timings['childPeakRssUnits'] = 'KiB on Linux; bytes on macOS (all child processes)'
        timings['totalSeconds'] = round(time.monotonic() - started, 2)
        (evidence / 'timings.json').write_text(json.dumps(timings, indent=2) + '\n')
        # Identity cookies, keys, database credentials and mutable CMS state are disposable.
        shutil.rmtree(host / 'App_Data', ignore_errors=True)
        if upgrade:
            shutil.rmtree(ROOT / 'artifacts/host-baseline/App_Data', ignore_errors=True)


if __name__ == '__main__':
    main()
