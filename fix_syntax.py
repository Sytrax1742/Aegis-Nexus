import re

with open("frontend/src/app/page.tsx", "r") as f:
    content = f.read()

# First, remove all the badly inserted return statements
lines = content.split('\n')
clean_lines = []
for i, line in enumerate(lines):
    if "return;" in line and "if (!" in line:
        continue
    clean_lines.append(line)

content = '\n'.join(clean_lines)

with open("frontend/src/app/page.tsx", "w") as f:
    f.write(content)
print("Removed bad return statements")
