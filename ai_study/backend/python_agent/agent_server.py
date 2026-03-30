"""
Python Agent gRPC Server with DeepSeek LLM Integration

Listens on 0.0.0.0:50051 and responds to gRPC calls.
Uses DeepSeek-V3 API for real content generation.

Usage:
    pip install -r requirements.txt
    ./start.sh

Environment:
    DEEPSEEK_API_KEY - DeepSeek API key (get from https://platform.deepseek.com)
"""

import os
import sys
import grpc
from concurrent import futures
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import generated gRPC modules
try:
    import agent_pb2
    import agent_pb2_grpc
    GRPC_AVAILABLE = True
except ImportError:
    logger.warning("agent_pb2 modules not found. Running in mock mode.")
    GRPC_AVAILABLE = False

# DeepSeek API configuration
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# System prompts for each agent
PM_SYSTEM_PROMPT = """你是一个资深产品经理，擅长将用户需求转化为结构清晰的 PRD 文档。
输出格式为 Markdown，包含：# 需求标题、## 功能概述、## 用户故事、## 技术约束。"""

DEV_SYSTEM_PROMPT = """你是一个资深全栈工程师，擅长根据需求和 PRD 生成高质量代码。
输出：直接输出代码文件内容（不用解释），语言根据需求推断。"""

TEST_SYSTEM_PROMPT = """你是一个资深测试工程师，擅长根据代码生成测试用例。
输出：直接输出测试代码，使用 pytest（Python）或 jest（JS/TS）格式。"""


class AgentServiceServicer:
    """
    Python Agent Service with DeepSeek LLM integration.
    
    Implements 5 RPCs:
    - GeneratePRD: PM Agent generates Product Requirements Document
    - GenerateCode: Dev Agent generates code
    - GenerateTests: Test Agent generates test cases
    - TriggerDeployment: Ops Agent triggers deployment (mock)
    - Ping: Connectivity test
    """

    def __init__(self):
        self.client = None
        if DEEPSEEK_API_KEY:
            try:
                import openai
                self.client = openai.OpenAI(
                    api_key=DEEPSEEK_API_KEY,
                    base_url=DEEPSEEK_BASE_URL
                )
                logger.info("DeepSeek client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize DeepSeek client: {e}")
        else:
            logger.warning("DEEPSEEK_API_KEY not set - LLM calls will fail")

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Call DeepSeek LLM with given prompts."""
        if not self.client:
            raise Exception("DEEPSEEK_API_KEY not configured or client not initialized")
        
        response = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content

    def GeneratePRD(self, request, context):
        """PM Agent: Generate PRD from requirement description."""
        logger.info(f"GeneratePRD called: requirement_id={request.requirement_id}")
        
        logs = ["PM Agent: 开始分析需求", "PM Agent: 调用 LLM 生成 PRD"]
        
        try:
            user_prompt = f"用户需求：{request.description}"
            prd_content = self._call_llm(PM_SYSTEM_PROMPT, user_prompt)
            logs.append("PM Agent: PRD 生成完成")
            
            return agent_pb2.PRDResponse(
                success=True,
                prd_content=prd_content,
                error="",
                logs=logs,
            )
        except Exception as e:
            logger.error(f"GeneratePRD failed: {e}")
            return agent_pb2.PRDResponse(
                success=False,
                prd_content="",
                error=str(e),
                logs=["PM Agent: 生成失败 - " + str(e)],
            )

    def GenerateCode(self, request, context):
        """Dev Agent: Generate code from description and PRD context."""
        logger.info(f"GenerateCode called: task_id={request.task_id}, language={request.language}")
        
        logs = ["Dev Agent: 开始生成代码", "Dev Agent: 调用 LLM 生成代码"]
        
        try:
            user_prompt = f"""任务：{request.description}
语言：{request.language}
框架：{request.framework}
PRD上下文：{request.prd_context}
请生成完整的代码文件。"""
            
            code_output = self._call_llm(DEV_SYSTEM_PROMPT, user_prompt)
            
            # Extract code block if present
            if "```" in code_output:
                parts = code_output.split("```")
                if len(parts) >= 3:
                    # Handle language tag after opening backticks
                    first_part = parts[1].strip()
                    if any(first_part.startswith(lang) for lang in ["python", "javascript", "typescript", "go", "java", "rust"]):
                        # Language tag present, skip it
                        code_output = parts[1].split("\n", 1)[1]
                    else:
                        code_output = parts[1]
            
            logs.append("Dev Agent: 代码生成完成")
            
            return agent_pb2.CodeResponse(
                success=True,
                code_output=code_output,
                files=[
                    agent_pb2.FileOutput(
                        path=f"generated.{self._ext(request.language)}",
                        content=code_output,
                        size=len(code_output),
                    )
                ],
                error="",
                logs=logs,
            )
        except Exception as e:
            logger.error(f"GenerateCode failed: {e}")
            return agent_pb2.CodeResponse(
                success=False,
                code_output="",
                files=[],
                error=str(e),
                logs=["Dev Agent: 生成失败 - " + str(e)],
            )

    def _ext(self, language: str) -> str:
        """Get file extension for language."""
        mapping = {
            "python": "py",
            "javascript": "js",
            "typescript": "ts",
            "go": "go",
            "java": "java",
            "rust": "rs",
        }
        return mapping.get(language.lower(), "txt")

    def _test_ext(self, language: str) -> str:
        """Get test file extension for language."""
        return f"test_{self._ext(language)}"

    def GenerateTests(self, request, context):
        """Test Agent: Generate test cases from code files."""
        logger.info(f"GenerateTests called: task_id={request.task_id}, framework={request.test_framework}")
        
        logs = ["Test Agent: 开始生成测试", "Test Agent: 调用 LLM 生成测试用例"]
        
        try:
            user_prompt = f"""代码文件：{request.code_files}
语言：{request.language}
测试框架：{request.test_framework}
请生成完整的测试代码。"""
            
            test_output = self._call_llm(TEST_SYSTEM_PROMPT, user_prompt)
            logs.append("Test Agent: 测试生成完成")
            
            return agent_pb2.TestResponse(
                success=True,
                test_files=[
                    agent_pb2.FileOutput(
                        path=f"test_generated.{self._test_ext(request.language)}",
                        content=test_output,
                        size=len(test_output),
                    )
                ],
                error="",
                logs=logs,
            )
        except Exception as e:
            logger.error(f"GenerateTests failed: {e}")
            return agent_pb2.TestResponse(
                success=False,
                test_files=[],
                error=str(e),
                logs=["Test Agent: 生成失败 - " + str(e)],
            )

    def TriggerDeployment(self, request, context):
        """Ops Agent: Trigger deployment to specified platform (mock)."""
        logger.info(f"TriggerDeployment called: task_id={request.task_id}, platform={request.platform}")
        
        # Deployment is mocked - just return success
        import uuid
        deployment_id = f"deploy-{uuid.uuid4().hex[:8]}"
        preview_url = f"https://{request.task_id[:8]}.preview.vercel.app"
        
        return agent_pb2.DeployResponse(
            success=True,
            deployment_id=deployment_id,
            preview_url=preview_url,
            status="success",
            error="",
            logs=[
                f"Ops Agent: 开始部署到 {request.platform}",
                f"Ops Agent: 部署类型 {request.app_type}",
                "Ops Agent: 部署完成（Mock）",
            ],
        )

    def Ping(self, request, context):
        """Connectivity test."""
        logger.info("Ping called")
        return agent_pb2.PongResponse(message="pong from Python Agent (DeepSeek)")


def serve(port=50051, max_workers=10):
    """Start the gRPC server."""
    if not GRPC_AVAILABLE:
        logger.error("Cannot start server - gRPC stubs not available")
        return
    
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    agent_pb2_grpc.add_AgentServiceServicer_to_server(
        AgentServiceServicer(), server
    )
    server.add_insecure_port(f'[::]:{port}')
    server.start()
    
    logger.info(f"Python Agent gRPC server started on port {port}")
    logger.info(f"LLM: DeepSeek-V3 (DeepSeek API Key: {'set' if DEEPSEEK_API_KEY else 'NOT SET'})")
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        server.stop(0)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 50051
    serve(port)
