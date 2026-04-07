#!/usr/bin/env python3
"""
Coder Agent - 生成代码并写入文件
Usage: python3 run_coder.py <task_id> <api_base>
"""
import sys
import json
import urllib.request
import urllib.error
import os
import datetime

TASK_ID = sys.argv[1] if len(sys.argv) > 1 else None
API_BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8080'

if not TASK_ID:
    print("Usage: python3 run_coder.py <task_id> [api_base]")
    sys.exit(1)

def api_get(path):
    req = urllib.request.Request(f"{API_BASE}{path}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())

def api_post_json(path, data):
    import subprocess, tempfile
    json_str = json.dumps(data)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(json_str)
        fname = f.name
    try:
        proc = subprocess.run(
            ['curl', '-s', '-X', 'POST',
             f"{API_BASE}{path}",
             '-H', 'Content-Type: application/json',
             '--data-binary', f'@{fname}'],
            capture_output=True, text=True, timeout=15
        )
        if proc.returncode != 0:
            return {'error': f'curl failed: {proc.stderr}'}
        try:
            return json.loads(proc.stdout)
        except Exception as e:
            return {'error': f'parse error: {e}', 'raw': proc.stdout[:200]}
    finally:
        os.unlink(fname)

print(f"[coder] Starting task: {TASK_ID}", file=sys.stderr)

# 1. Fetch task
try:
    task_data = api_get(f"/api/tasks/{TASK_ID}")
    task = task_data.get('task', task_data)
except Exception as e:
    print(f"[coder] Failed to fetch task: {e}", file=sys.stderr)
    sys.exit(1)

task_title = task.get('title', '')
task_type = task.get('type', 'code')
task_priority = task.get('priority', 'medium')
user_id = task.get('user_id', '')

print(f"[coder] Task: {task_title}", file=sys.stderr)

# 2. Try to get latest requirement PRD for this user
prd_content = ''
if user_id:
    try:
        reqs = api_get(f"/api/requirements?user_id={user_id}")
        for r in reqs.get('requirements', []):
            if r.get('prd_content'):
                prd_content = r['prd_content']
                print(f"[coder] Found PRD: {r.get('title', '')[:50]}", file=sys.stderr)
                break
    except Exception as e:
        print(f"[coder] Could not fetch requirement: {e}", file=sys.stderr)

# 3. Get API key from config
api_key = os.environ.get('MINIMAX_API_KEY', '')
model = 'MiniMax-M2.7'

if not api_key:
    # Try to get from backend config endpoint or generate mock response
    print(f"[coder] No API key, generating placeholder response", file=sys.stderr)
    output = f"""# 代码生成占位符

任务: {task_title}
类型: {task_type}
优先级: {task_priority}

## 实现思路

根据任务描述，这是一个 {task_type} 类型的开发任务。

## 生成时间

{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 注意事项

请在环境变量中设置 MINIMAX_API_KEY 以生成真实代码。
"""
else:
    # 4. Call MiniMax LLM
    prd_section = f"## PRD\n\n{prd_content}" if prd_content else "（无 PRD 内容，请根据任务标题推断需求）"

    prompt = f"""你是资深全栈开发工程师。请根据以下任务生成代码。

任务信息：
- 标题：{task_title}
- 类型：{task_type}
- 优先级：{task_priority}

{prd_section}

要求：
1. 先分析实现思路
2. 然后输出完整代码（用 markdown 代码块标记，语言要合适）
3. 列出需要创建/修改的文件
4. 代码要符合最佳实践

任务ID: {TASK_ID}"""

    try:
        req_data = {
            'model': model,
            'messages': [
                {'role': 'system', 'content': '你是一名资深全栈开发工程师。请根据以下任务生成高质量代码。'},
                {'role': 'user', 'content': prompt}
            ]
        }
        req = urllib.request.Request(
            'https://api.minimax.chat/v1/text/chatcompletion_pro',
            data=json.dumps(req_data).encode(),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())

        choices = result.get('choices', [])
        if choices:
            msg = choices[0].get('messages', [{}])[0]
            output = msg.get('text', '# 无输出')
        else:
            output = f"# LLM 返回为空\n\n原始响应: {json.dumps(result)[:500]}"
        print(f"[coder] LLM response received, length: {len(output)}", file=sys.stderr)
    except Exception as e:
        print(f"[coder] LLM call failed: {e}", file=sys.stderr)
        output = f"# 代码生成失败\n\n错误: {e}\n\n任务: {task_title}"

# 5. Write output to file
output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'generated', TASK_ID)
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, 'output.md')

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"# {task_title}\n\n")
    f.write(f"**任务ID**: {TASK_ID}\n")
    f.write(f"**生成时间**: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    f.write("---\n\n")
    f.write(output)

print(f"[coder] Output written to: {output_file}", file=sys.stderr)
print(f"[coder] Done! Task: {TASK_ID}", file=sys.stderr)

# 6. Transition task to completed
try:
    result = api_post_json(f"/api/tasks/{TASK_ID}/transition", {
        'from_state': 'running',
        'to_state': 'completed',
        'logs': [{
            'timestamp': datetime.datetime.now().isoformat(),
            'level': 'INFO',
            'agent': 'coder',
            'message': f'代码生成完成，输出: {output_file}'
        }]
    })
    print(f"[coder] Transition result: {result}", file=sys.stderr)
except Exception as e:
    print(f"[coder] Failed to transition task: {e}", file=sys.stderr)

print("SUCCESS")
