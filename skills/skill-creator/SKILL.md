---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
license: Complete terms in LICENSE.txt
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend Claude's capabilities by providing specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific domains or tasks.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else Claude needs.

**Default assumption: Claude is already very smart.** Only add context Claude doesn't already have. Challenge each piece of information: "Does Claude really need this explanation?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

- **High freedom (text-based instructions)**: When multiple approaches are valid
- **Medium freedom (pseudocode/scripts)**: When a preferred pattern exists
- **Low freedom (specific scripts)**: When operations are fragile and error-prone

## Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation for context loading
    └── assets/           - Files used in output (templates, icons)
```

### SKILL.md (required)

- **Frontmatter** (YAML): Contains `name` and `description` fields. These are the only fields Claude reads to determine when the skill gets used.
- **Body** (Markdown): Instructions and guidance. Only loaded AFTER the skill triggers.

### Bundled Resources

#### Scripts (`scripts/`)
Executable code for tasks that require deterministic reliability or are repeatedly rewritten. Token efficient, deterministic, may be executed without loading into context.

#### References (`references/`)
Documentation intended to be loaded as needed into context. Keep SKILL.md lean; load reference files only when needed.

#### Assets (`assets/`)
Files not intended to be loaded into context, but used within the output. Templates, images, icons, boilerplate code.

### What to NOT Include

A skill should only contain essential files. Do NOT create:
- README.md
- INSTALLATION_GUIDE.md
- CHANGELOG.md
- etc.

The skill should only contain what an AI agent needs to do the job.

## Progressive Disclosure Design

Skills use a three-level loading system:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words)
3. **Bundled resources** - As needed (unlimited, scripts can execute without reading)

### Patterns

**Pattern 1: High-level guide with references**

```markdown
# PDF Processing

## Quick start
Extract text with pdfplumber.

## Advanced features
- **Form filling**: See [FORMS.md](FORMS.md)
- **API reference**: See [REFERENCE.md](REFERENCE.md)
```

**Pattern 2: Domain-specific organization**

```
bigquery-skill/
├── SKILL.md (overview + navigation)
└── reference/
    ├── finance.md
    ├── sales.md
    └── product.md
```

**Pattern 3: Conditional details**

```markdown
# DOCX Processing

## Creating documents
Use docx-js for new documents.

## Editing documents
For simple edits, modify the XML directly.
**For tracked changes**: See [REDLINING.md](REDLINING.md)
```

## Skill Creation Process

### Step 1: Understand with Concrete Examples

Understand concrete examples of how the skill will be used. Ask:
- "What functionality should this skill support?"
- "Can you give examples of how it would be used?"
- "What would a user say that should trigger this skill?"

Conclude when there is a clear sense of the functionality the skill should support.

### Step 2: Plan Reusable Skill Contents

Analyze each example to identify:
1. What scripts, references, and assets would be helpful
2. What would be executed repeatedly

Example: For a `pdf-editor` skill:
- A `scripts/rotate_pdf.py` script would be helpful

### Step 3: Initialize the Skill

Run the init script to generate the skill directory:

```bash
scripts/init_skill.py <skill-name> --path <output-directory>
```

The script creates:
- Skill directory
- SKILL.md template with proper frontmatter and TODO placeholders
- Example resource directories: `scripts/`, `references/`, `assets/`

### Step 4: Edit the Skill

#### Writing Guidelines: Always use imperative/infinitive form.

##### Frontmatter

```yaml
name: skill-name
description: Clear description of what the skill does and when to use it.
```

Do NOT include any other fields in YAML frontmatter.

##### Body

Write instructions for using the skill and its bundled resources.

### Step 5: Package a Skill

Once development is complete, package into a distributable .skill file:

```bash
scripts/package_skill.py <path/to/skill-folder>
```

The packaging script will:
1. **Validate** the skill automatically
2. **Package** the skill if validation passes

If validation fails, fix errors and run again.

### Step 6: Iterate

After testing:
1. Notice struggles or inefficiencies
2. Identify how SKILL.md or bundled resources should be updated
3. Implement changes and test again
