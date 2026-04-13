#!/usr/bin/env node
/**
 * Coder Agent Script
 * Usage: node coder-agent.js <task_id> <api_base>
 * 
 * 1. Fetch task + requirement from backend
 * 2. Generate code via LLM
 * 3. Write code to workspace
 * 4. Update task status via API
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const TASK_ID = process.argv[2];
const API_BASE = process.argv[3] || 'http://localhost:8080';
const WORKSPACE = '/Users/tianwei/.openclaw/workspace/ai_study';

if (!TASK_ID) {
  console.error('Usage: node coder-agent.js <task_id> [api_base]');
  process.exit(1);
}

function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(url, { ...options, method: options.method || 'GET' }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.error(`[coder-agent] Starting task: ${TASK_ID}`);

  // 1. Fetch task details
  const taskRes = await httpRequest(`${API_BASE}/api/tasks/${TASK_ID}`);
  const task = taskRes.task || taskRes;
  console.error(`[coder-agent] Task: ${task.title}, state: ${task.state}`);

  // 2. Fetch requirement if linked
  let requirement = null;
  const reqId = task.requirement_id || task.req_id;
  if (reqId) {
    try {
      requirement = await httpRequest(`${API_BASE}/api/requirements/${reqId}`);
      console.error(`[coder-agent] Requirement: ${requirement.title}`);
    } catch (e) {
      console.error(`[coder-agent] Could not fetch requirement: ${e.message}`);
    }
  }

  // 3. Build prompt for code generation
  const prompt = buildCodePrompt(task, requirement);
  
  // 4. Spawn dev-engineer subagent with the coding task
  // Use openclaw sessions spawn via a temporary session
  const sessionLabel = `coder-${TASK_ID}`;
  
  // Write coding task to a temp file for the agent to read
  const taskFile = `/tmp/coder-task-${TASK_ID}.md`;
  fs.writeFileSync(taskFile, prompt);
  console.error(`[coder-agent] Task prompt written to ${taskFile}`);

  // 5. Spawn openclaw agent
  try {
    const result = spawnOpenclawAgent(sessionLabel, prompt, TASK_ID);
    console.log(JSON.stringify(result));
  } catch (err) {
    // Fallback: generate code directly via LLM
    console.error(`[coder-agent] Agent spawn failed, using direct LLM: ${err.message}`);
    const code = await generateCodeDirectly(prompt);
    
    // Write code to workspace
    const codeFile = path.join(WORKSPACE, 'generated', `${TASK_ID}.txt`);
    fs.mkdirSync(path.dirname(codeFile), { recursive: true });
    fs.writeFileSync(codeFile, code);
    
    // Update task status
    await httpRequest(`${API_BASE}/api/tasks/${TASK_ID}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { from_state: 'running', to_state: 'completed', logs: [] });

    console.log(JSON.stringify({ success: true, code, output: codeFile }));
  }
}

function buildCodePrompt(task, requirement) {
  let context = `# 任务\n\n**标题**: ${task.title}\n**类型**: ${task.type}\n**优先级**: ${task.priority}\n`;
  
  if (requirement) {
    context += `\n## PRD\n\n${requirement.prd_content || '（无 PRD 内容）'}\n`;
  }
  
  context += `\n## 要求\n\n请根据以上信息，生成完整的代码实现。\n\n输出格式：\n1. 先说明实现思路\n2. 然后输出完整代码（用 \\`\\`\\`标记语言块）\n3. 列出需要创建/修改的文件\n\n请作为资深全栈开发工程师输出专业的代码。`;
  
  return context;
}

function spawnOpenclawAgent(sessionLabel, prompt, taskId) {
  // Use openclaw CLI to spawn a session
  const agentScript = `
import { sessions_spawn } from 'openclaw';
const result = await sessions_spawn({
  task: \`\${prompt}\\n\\n任务ID: ${taskId}\`,
  label: '${sessionLabel}',
  runtime: 'subagent',
  agentId: 'dev-engineer',
  runTimeoutSeconds: 300,
  mode: 'run',
});
console.log(JSON.stringify(result));
`.trim();

  // Write to temp file and execute with node
  const scriptFile = `/tmp/spawn-${taskId}.mjs`;
  fs.writeFileSync(scriptFile, agentScript);
  
  try {
    const output = execSync(`node ${scriptFile}`, { 
      timeout: 180000,
      cwd: '/Users/tianwei/.openclaw/workspace/ai_study'
    });
    return JSON.parse(output.toString());
  } catch (e) {
    throw new Error(`Agent spawn failed: ${e.message}`);
  }
}

async function generateCodeDirectly(prompt) {
  // Fallback: call MiniMax directly for code generation
  const apiKey = process.env.MINIMAX_API_KEY || '';
  if (!apiKey) {
    return `// No API key configured. Task: ${prompt.substring(0, 200)}...`;
  }
  
  const body = JSON.stringify({
    model: 'MiniMax-M2.7',
    messages: [
      { role: 'system', content: '你是一名资深全栈开发工程师。请根据以下任务生成代码。' },
      { role: 'user', content: prompt }
    ]
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.minimax.chat/v1/text/chatcompletion_pro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.messages?.[0]?.text || '// No response';
          resolve(content);
        } catch { reject(new Error('Failed to parse LLM response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

main().catch(err => {
  console.error('[coder-agent] Fatal error:', err.message);
  process.exit(1);
});
