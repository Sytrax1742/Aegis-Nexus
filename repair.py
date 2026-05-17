import re

with open("frontend/src/app/page.tsx", "r") as f:
    content = f.read()

# 1. Replace Icons.spinner with Icons.activity
content = content.replace("Icons.spinner", "Icons.activity")

# 2. Fix JSON.stringify in JsonBlock
old_json_block = """function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className='max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100'>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}"""

new_json_block = """function JsonBlock({ value }: { value: unknown }) {
  let displayValue = ''
  try {
    displayValue = value ? JSON.stringify(value, null, 2) : 'null'
  } catch (e) {
    displayValue = '{"error": "Circular reference"}'
  }
  return (
    <pre className='max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100'>
      {displayValue}
    </pre>
  )
}"""

content = content.replace(old_json_block, new_json_block)

# 3. Fix parseOperatorOutput catch block
old_parse_catch = """  } catch {
    return JSON.stringify(data, null, 2)
  }"""

new_parse_catch = """  } catch {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return 'Unparseable output'
    }
  }"""

content = content.replace(old_parse_catch, new_parse_catch)

# 4. Add safety checks to API client POST calls
lines = content.split('\n')
new_lines = []
for line in lines:
    new_lines.append(line)
    if "await apiClient.post" in line:
        # Avoid multi-line breaks for this simplistic script
        match = re.search(r'const\s+(\w+)\s*=\s*await apiClient\.post', line)
        if match:
            var_name = match.group(1)
            indent = len(line) - len(line.lstrip())
            new_lines.append(" " * indent + f"if (!{var_name}) return;")

content = '\n'.join(new_lines)

with open("frontend/src/app/page.tsx", "w") as f:
    f.write(content)

print("Repair completed.")
