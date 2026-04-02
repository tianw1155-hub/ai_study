"""
Tester Agent - 测试工程师 Agent
负责根据代码生成测试用例
"""

import re
from typing import Dict, Any, List
from .base import Agent, Log

TESTER_SYSTEM_PROMPT = """你是一个资深测试工程师，擅长根据代码生成完整、可运行的测试用例。

要求：
1. 使用 pytest（Python）或 jest（JS/TS）格式
2. 包含正常用例和异常用例
3. 测试函数命名清晰（test_xxx）
4. 只输出测试代码，不解释

输出格式：
```
```语言
测试代码
```
```"""


class TesterAgent(Agent):
    """Tester Agent：生成测试用例"""

    async def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        logs = [Log(self.name, "Tester Agent: 开始生成测试").to_dict()]

        code_files = context.get("code_files", [])
        task = context.get("task", {})

        if not code_files:
            logs.append(Log(self.name, "Tester Agent: 无代码文件可测试", "WARN").to_dict())
            return {"success": False, "error": "No code files provided", "logs": logs}

        logs.append(Log(self.name, f"Tester Agent: 为 {len(code_files)} 个文件生成测试").to_dict())

        # 合并所有代码文件内容
        combined_code = self._combine_code(code_files)
        language = self._detect_language(combined_code)

        user_prompt = f"""代码文件：
{combined_code[:3000]}

语言：{language}
请生成完整的测试代码（包含正常用例和异常用例）。"""

        try:
            test_output = await self.think(TESTER_SYSTEM_PROMPT, user_prompt, temp=0.3)
            if not test_output:
                logs.append(Log(self.name, "Tester Agent: LLM 返回为空", "ERROR").to_dict())
                return {"success": False, "error": "LLM returned empty content", "logs": logs}
            test_files = self._parse_test_blocks(test_output, language)

            logs.append(Log(self.name, f"Tester Agent: 生成 {len(test_files)} 个测试文件").to_dict())

            return {
                "success": True,
                "test_code": test_output,
                "test_files": test_files,
                "logs": logs,
            }
        except Exception as e:
            logs.append(Log(self.name, f"Tester Agent: 失败 - {e}", "ERROR").to_dict())
            return {"success": False, "error": str(e), "logs": logs}

    def _combine_code(self, code_files: List[Dict[str, str]]) -> str:
        """合并多个代码文件"""
        parts = []
        for f in code_files:
            path = f.get("path", "unknown")
            content = f.get("content", "")
            parts.append(f"// 文件: {path}\n{content}")
        return "\n\n".join(parts)

    def _detect_language(self, code: str) -> str:
        """检测代码语言"""
        if "def " in code and ":" in code:
            return "python"
        if "function " in code or "const " in code or "let " in code:
            return "javascript"
        if "func " in code and "package " in code:
            return "go"
        if "func " in code and "->" in code:
            return "rust"
        return "python"

    def _parse_test_blocks(self, content: str, language: str) -> List[Dict[str, str]]:
        """解析测试代码块"""
        files = []
        pattern = r"```(?:\w+)?\n?(.*?)```"
        matches = re.findall(pattern, content, re.DOTALL)

        ext_map = {"python": "py", "javascript": "js", "go": "go", "rust": "rs"}
        ext = ext_map.get(language, "py")

        for i, code in enumerate(matches):
            code = code.strip()
            if code:
                files.append({
                    "path": f"test_{i + 1}.{ext}",
                    "content": code,
                    "size": len(code),
                })

        if not files and content.strip():
            files.append({
                "path": f"test_1.{ext}",
                "content": content.strip(),
                "size": len(content.strip()),
            })

        return files
