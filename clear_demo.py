import os

file_path = "frontend/src/app/ai/policies/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

start_marker = "const DEMO_POLICIES: Policy[] = ["
if start_marker in content:
    start_idx = content.find(start_marker)
    # find the closing bracket for the array.
    # DEMO_POLICIES array ends around line 117. We can just find the comment "// ============================================================================\n// Animation Variants"
    end_marker = "// ============================================================================\n// Animation Variants"
    end_idx = content.find(end_marker)
    
    if start_idx != -1 and end_idx != -1:
        new_content = content[:start_idx] + "const DEMO_POLICIES: Policy[] = []\n\n" + content[end_idx:]
        with open(file_path, "w") as f:
            f.write(new_content)
        print("DEMO_POLICIES successfully replaced.")
    else:
        print("End marker not found")
else:
    print("Start marker not found")

