import re

with open("frontend/src/app/ai/policies/page.tsx", "r") as f:
    content = f.read()

# Replace DEMO_POLICIES array
content = re.sub(
    r"const DEMO_POLICIES:\s*Policy\[\]\s*=\s*\[.*?\]",
    "const DEMO_POLICIES: Policy[] = []",
    content,
    flags=re.DOTALL
)

with open("frontend/src/app/ai/policies/page.tsx", "w") as f:
    f.write(content)

# Now check workbench page
with open("frontend/src/app/workbench/page.tsx", "r") as f:
    workbench_content = f.read()

# Just to be absolutely sure, if there is any DEMO_EXCEPTIONS left
workbench_content = re.sub(
    r"const DEMO_EXCEPTIONS:\s*ExceptionItem\[\]\s*=\s*\[.*?\]",
    "const DEMO_EXCEPTIONS: ExceptionItem[] = []",
    workbench_content,
    flags=re.DOTALL
)

with open("frontend/src/app/workbench/page.tsx", "w") as f:
    f.write(workbench_content)

print("Dummy data cleared from UI files.")
