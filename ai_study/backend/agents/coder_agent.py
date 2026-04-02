"""
Coder Agent - 开发者 Agent
负责根据任务描述生成代码
"""

import re
from typing import Dict, Any, List
from .base import Agent, Log

CODER_SYSTEM_PROMPT = """你是一个资深全栈工程师，擅长根据产品需求和任务描述生成高质量、生产级别的代码。

要求：
1. 代码必须是完整的、可运行的
2. 包含必要的错误处理
3. 遵循语言最佳实践（类型提示、注释等）
4. 只输出代码，不解释（除非代码本身需要注释说明）

输出格式：
```
```语言
// 文件路径：src/xxx
代码内容
```
```"""


class CoderAgent(Agent):
    """Coder Agent：根据任务生成代码"""

    async def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        logs = [Log(self.name, "Coder Agent: 开始生成代码").to_dict()]

        task = context.get("task", {})
        prd = context.get("prd", "")
        task_title = task.get("title", "")
        task_type = task.get("type", "code")

        logs.append(Log(self.name, f"Coder Agent: 处理任务「{task_title}」（类型: {task_type}）").to_dict())

        user_prompt = self._build_prompt(task_title, task_type, prd, context)

        try:
            code_output = await self.think(CODER_SYSTEM_PROMPT, user_prompt, temp=0.3)
            if not code_output:
                logs.append(Log(self.name, "Coder Agent: LLM 返回为空", "ERROR").to_dict())
                return {"success": False, "error": "LLM returned empty content", "logs": logs}
            files = self._parse_code_blocks(code_output)

            logs.append(Log(self.name, f"Coder Agent: 生成完成（{len(files)} 个文件）").to_dict())

            return {
                "success": True,
                "code": code_output,
                "files": files,
                "logs": logs,
            }
        except Exception as e:
            logs.append(Log(self.name, f"Coder Agent: 失败 - {e}", "ERROR").to_dict())
            return {"success": False, "error": str(e), "logs": logs}

    def _build_prompt(self, task_title: str, task_type: str, prd: str, context: Dict[str, Any]) -> str:
        """构建发给 LLM 的 prompt"""
        language = context.get("language", "python")
        framework = context.get("framework", "")

        parts = [f"任务：{task_title}"]
        if prd:
            parts.append(f"\nPRD 上下文：\n{prd[:1000]}")
        if framework:
            parts.append(f"框架：{framework}")
        parts.append(f"语言：{language}")
        return "\n".join(parts)

    def _parse_code_blocks(self, content: str) -> List[Dict[str, str]]:
        """解析 markdown 代码块，提取文件列表"""
        files = []
        # 匹配 ```language 或 ``` 后跟文件路径的内容
        pattern = r"```(?:\w+)?\s*(?:file:?\s*)?([^\n]+)?\n(.*?)```"
        matches = re.findall(pattern, content, re.DOTALL)

        for filepath, code in matches:
            filepath = filepath.strip() if filepath else "generated.py"
            # 去掉可能的注释行
            code_lines = []
            for line in code.split("\n"):
                # 跳过路径注释行
                if line.startswith("# 文件路径：") or line.startswith("// 文件路径："):
                    continue
                code_lines.append(line)
            files.append({
                "path": filepath,
                "content": "\n".join(code_lines).strip(),
                "size": len("\n".join(code_lines).strip()),
            })

        # 如果没有找到代码块，把整个内容当一个文件
        if not files and content.strip():
            ext = self._ext_from_content(content)
            files.append({
                "path": f"generated.{ext}",
                "content": content.strip(),
                "size": len(content.strip()),
            })

        return files

    def _ext_from_content(self, content: str) -> str:
        """根据内容推断文件扩展名"""
        if "def " in content and ":" in content:
            return "py"
        if "function " in content or "const " in content:
            return "js"
        if "func " in content and "package " in content:
            return "go"
        if "struct " in content and "type " in content:
            return "go"
        return "txt"
