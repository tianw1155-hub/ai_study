# RULES_GIT_FLOW.md - 分支策略与PR规范

> 文档状态：草稿 | 创建日期：2026-03-23

---

## 1. 分支结构

```
main ────────────────────────────────────── 受保护分支
  ↑                                          必须通过所有测试才能合并
  │
develop ◀── feature/M1-xxx ──── PR ──── review ──── merge
  ↑
  └── hotfix/xxx（紧急修复用）
```

- **main**：受保护分支，禁止强制推送，禁止直接commit
- **develop**：开发主分支，所有feature合并到这里
- **feature/模块名-功能**：功能开发分支
- **hotfix/xxx**：紧急修复分支，事后需合并回main和develop

---

## 2. 分支命名规范

```
feature/<模块名>-<功能简述>
示例：feature/M1-职业探索对话基础框架
      feature/M2-技能差距分析接口

hotfix/<问题简述>
示例：hotfix/登录态失效修复
```

---

## 3. PR合并规范

1. **PR必须经过1-2人review才能合并**
2. **禁止强制推送**（`git push -f`）
   - **例外**：ops-engineer在紧急hotfix场景下可申请临时权限，事后必须通知全员
3. **PR描述必须包含**：
   - 改了什么
   - 为什么改
   - 测试结果（包含CI门禁结果截图或摘要）
4. **main分支不过CI门禁不合并**

---

## 4. Commit信息规范（建议性）

```
<type>(<scope>): <subject>

type:
  feat     — 新功能
  fix      — 修复bug
  docs     — 文档变更
  style    — 格式/样式调整
  refactor — 重构
  test     — 测试相关
  chore    — 构建/工具变更

scope:
  M1 / M2 / M3 / M4 / _global

示例：
  feat(M1): 添加职业探索对话基础框架
  fix(M2): 修复技能分析接口超时问题
  docs(_global): 更新README
```

---

## 5. 合并流程

```
feature分支开发完成
    ↓
创建PR → 指定reviewer（1-2人）
    ↓
CI门禁检查（编译/语法/单元测试/安全扫描/集成测试）
    ↓
reviewer审核代码
    ↓
通过 → 合并到develop
失败 → 修复后重新触发CI
    ↓
阶段结束时develop合并到main
```

---

## 6. 相关规则

- `rules/_global/RULES_MAIN.md` — 项目总纲
- `rules/_global/RULES_MoSCoW.md` — 优先级定级指南
- `rules/_global/RULES_ADR.md` — 架构决策记录规范

---

*本文档为Git分支与PR规范，如与总纲冲突以总纲为准*
