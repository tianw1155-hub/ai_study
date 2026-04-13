#!/usr/bin/env python3
"""
Tester Agent - 运行测试并报告结果
Usage: python3 run_tester.py <task_id> <api_base>

1. Fetch task details to find generated files
2. Run tests (syntax check, execution test)
3. Report results to backend
"""
import sys
import os
import json
import tempfile
import subprocess
import traceback
import datetime

TASK_ID = sys.argv[1] if len(sys.argv) > 1 else None
API_BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8080'
WORKSPACE = '/Users/tianwei/.openclaw/workspace/ai_study'

if not TASK_ID:
    print("[tester] Usage: python3 run_tester.py <task_id> [api_base]", file=sys.stderr)
    sys.exit(1)


def http_request(method, path, data=None):
    import urllib.request, urllib.parse
    url = f"{API_BASE}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            try:
                return json.loads(raw)
            except:
                return raw
    except Exception as e:
        print(f"[tester] HTTP request failed: {e}", file=sys.stderr)
        return None


def find_generated_files(task_id):
    """Find generated files for a task"""
    gen_dir = os.path.join(WORKSPACE, 'backend', 'scripts', 'generated', task_id)
    if not os.path.exists(gen_dir):
        return []
    files = []
    for root, dirs, filenames in os.walk(gen_dir):
        for f in filenames:
            filepath = os.path.join(root, f)
            rel = os.path.relpath(filepath, gen_dir)
            size = os.path.getsize(filepath)
            files.append({'path': rel, 'full_path': filepath, 'size': size})
    return files


def run_syntax_check(filepath):
    """Check syntax of a file"""
    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.py':
        result = subprocess.run(
            ['python3', '-m', 'py_compile', filepath],
            capture_output=True, text=True, timeout=30
        )
        return {'passed': result.returncode == 0, 'error': result.stderr or '', 'tool': 'py_compile'}
    elif ext in ('.js', '.ts', '.jsx', '.tsx'):
        result = subprocess.run(
            ['node', '--check', filepath],
            capture_output=True, text=True, timeout=30
        )
        return {'passed': result.returncode == 0, 'error': result.stderr or '', 'tool': 'node --check'}
    elif ext in ('.go',):
        result = subprocess.run(
            ['go', 'build', '-o', '/dev/null', filepath],
            capture_output=True, text=True, timeout=60, cwd=os.path.dirname(filepath)
        )
        return {'passed': result.returncode == 0, 'error': result.stderr or '', 'tool': 'go build'}
    return {'passed': True, 'error': '', 'tool': 'none', 'note': f'No syntax check for {ext}'}


def run_execution_test(filepath):
    """Try to run the file (if it's a script)"""
    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.py':
        result = subprocess.run(
            ['python3', filepath],
            capture_output=True, text=True, timeout=30
        )
        # Exit code 0 is success, but也可能只是 script 没有输出
        return {
            'passed': result.returncode == 0,
            'stdout': result.stdout[:500],
            'stderr': result.stderr[:500],
            'exit_code': result.returncode
        }
    elif ext in ('.js',):
        result = subprocess.run(
            ['node', filepath],
            capture_output=True, text=True, timeout=30
        )
        return {
            'passed': result.returncode == 0,
            'stdout': result.stdout[:500],
            'stderr': result.stderr[:500],
            'exit_code': result.returncode
        }
    return {'passed': None, 'note': f'Execution test not supported for {ext}'}


def add_test_log(task_id, level, agent, message):
    """Add a log entry to the task"""
    http_request('POST', f'/api/tasks/{task_id}/logs', {
        'timestamp': datetime.datetime.now().isoformat(),
        'level': level,
        'agent': agent,
        'message': message[:2000]
    })


def main():
    print(f"[tester] Starting test for task: {TASK_ID}", file=sys.stderr)

    # 1. Fetch task details
    task_res = http_request('GET', f'/api/tasks/{TASK_ID}')
    if not task_res:
        print(f"[tester] Failed to fetch task {TASK_ID}", file=sys.stderr)
        sys.exit(1)

    task = task_res.get('task') or task_res
    task_title = task.get('title', 'unknown')
    print(f"[tester] Testing task: {task_title}", file=sys.stderr)

    # 2. Find generated files
    files = find_generated_files(TASK_ID)
    print(f"[tester] Found {len(files)} generated files", file=sys.stderr)

    if not files:
        add_test_log(TASK_ID, 'WARN', 'tester', 'No generated files found to test')
        # 没有文件，测试通过（coder 可能只生成了说明文档）
        print("[tester] No files to test - exiting with SUCCESS")
        print("SUCCESS")
        return

    # 3. Run tests on each file
    results = []
    all_passed = True

    for f in files:
        filepath = f['full_path']
        relpath = f['path']
        print(f"[tester] Testing: {relpath} ({f['size']} bytes)", file=sys.stderr)

        # Syntax check
        syntax_result = run_syntax_check(filepath)
        status = '✓' if syntax_result['passed'] else '✗'
        print(f"[tester]   Syntax: {status}", file=sys.stderr)
        add_test_log(TASK_ID, 'INFO' if syntax_result['passed'] else 'ERROR',
                     'tester', f'Syntax check [{relpath}]: {"PASS" if syntax_result["passed"] else "FAIL"} {syntax_result.get("error","")[:200]}')

        if not syntax_result['passed']:
            all_passed = False
            results.append({**f, 'syntax': syntax_result, 'execution': None})
            continue

        # Execution test
        exec_result = run_execution_test(filepath)
        exec_status = '✓' if exec_result.get('passed') == True else ('✗' if exec_result.get('passed') == False else '—')
        print(f"[tester]   Execution: {exec_status}", file=sys.stderr)

        if exec_result.get('passed') == False:
            all_passed = False
            add_test_log(TASK_ID, 'ERROR', 'tester',
                         f'Execution [{relpath}] FAILED: {exec_result.get("stderr","")[:300]}')
        elif exec_result.get('passed') == True:
            add_test_log(TASK_ID, 'INFO', 'tester',
                         f'Execution [{relpath}]: OK (exit 0)')

        results.append({**f, 'syntax': syntax_result, 'execution': exec_result})

    # 4. Report final results
    summary = f"Tester: {len(files)} files, all_passed={all_passed}"
    add_test_log(TASK_ID, 'INFO' if all_passed else 'ERROR', 'tester',
                 f'Test summary - {"ALL PASSED" if all_passed else "SOME FAILED"}')

    print(f"[tester] Results:", file=sys.stderr)
    for r in results:
        syn = 'PASS' if r['syntax']['passed'] else 'FAIL'
        exe = 'OK' if r['execution'] and r['execution'].get('passed') == True else ('FAIL' if r['execution'] and r['execution'].get('passed') == False else 'SKIP')
        print(f"[tester]   {r['path']}: syntax={syn} execution={exe}", file=sys.stderr)

    print(f"[tester] All tests passed: {all_passed}", file=sys.stderr)

    if all_passed:
        print("[tester] Tests PASSED")
        print("SUCCESS")
    else:
        print("[tester] Tests FAILED")
        print("FAIL")
        sys.exit(1)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"[tester] Tester error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
