import re

with open("frontend/src/app/page.tsx", "r") as f:
    lines = f.readlines()

# 1. Add Switch import
for i, line in enumerate(lines):
    if "import { Icons }" in line:
        lines.insert(i + 1, "import { Switch } from '@/components/ui/switch'\n")
        break

# 2. Add debugMode state
for i, line in enumerate(lines):
    if "const [busy, setBusy] = useState(false)" in line:
        lines.insert(i + 1, "  const [debugMode, setDebugMode] = useState(false)\n")
        break

def find_line_index(lines, search_str):
    for i, line in enumerate(lines):
        if search_str in line:
            return i
    return -1

grid_idx = find_line_index(lines, "<div className='grid gap-6 lg:grid-cols-12'>")
toggle_html = """        <div className='mb-4 flex items-center justify-end gap-2'>
           <Switch checked={debugMode} onCheckedChange={setDebugMode} id='debug-mode' />
           <label htmlFor='debug-mode' className='text-sm font-medium text-slate-600'>Developer Trace</label>
        </div>\n"""
lines.insert(grid_idx, toggle_html)

col7_idx = find_line_index(lines, "<div className='space-y-6 lg:col-span-7'>")
lines[col7_idx] = lines[col7_idx].replace("lg:col-span-7", "lg:col-span-8")

def extract_block(lines, start_marker):
    start_idx = find_line_index(lines, start_marker)
    while start_idx >= 0 and "<Panel" not in lines[start_idx]:
        start_idx -= 1
    
    while start_idx > 0 and lines[start_idx - 1].strip().startswith("{/*"):
        start_idx -= 1

    count = 0
    end_idx = start_idx
    for i in range(start_idx, len(lines)):
        if "<Panel" in lines[i]:
            count += 1
        if "</Panel>" in lines[i]:
            count -= 1
            if count == 0:
                end_idx = i
                break
    block = lines[start_idx:end_idx+1]
    del lines[start_idx:end_idx+1]
    return block

block_lead = extract_block(lines, "title='Lead / deal orchestrator'")
block_operator = extract_block(lines, "title='Operator mesh'")
block_policy = extract_block(lines, "title='Policy sync'")
block_nexus = extract_block(lines, "title='Nexus Orchestrator - Deal Intelligence'")
block_full = extract_block(lines, "title='Full Sales Pipeline'")

for i, line in enumerate(block_nexus):
    if "title='Nexus Orchestrator - Deal Intelligence'" in line:
        block_nexus[i] = line.replace("Nexus Orchestrator - Deal Intelligence", "Aegis-Nexus: Revenue Command")

for i, line in enumerate(block_policy):
    if "<JsonBlock value={latestIngestion} />" in line:
        block_policy[i] = "                  {debugMode ? (\n                    <JsonBlock value={latestIngestion} />\n                  ) : (\n                    <div className='flex items-center gap-2 text-emerald-600'>✓ Processing complete</div>\n                  )}\n"

def replace_operator_json(block, key):
    for i, line in enumerate(block):
        if f"<JsonBlock value={{operatorResults['{key}']}} />" in line:
            block[i] = line.replace(f"<JsonBlock value={{operatorResults['{key}']}} />", f"{{debugMode ? <JsonBlock value={{operatorResults['{key}']}} /> : <ReadableOutput value={{operatorResults['{key}']}} />}}")

replace_operator_json(block_operator, 'lead-intel')
replace_operator_json(block_operator, 'policy-guard')
replace_operator_json(block_operator, 'crm-ops')
replace_operator_json(block_operator, 'doc-ops')

for i, line in enumerate(block_lead):
    if "<JsonBlock value={orchestrateResult} />" in line:
        block_lead[i] = line.replace("<JsonBlock value={orchestrateResult} />", "{debugMode ? <JsonBlock value={orchestrateResult} /> : <ReadableOutput value={orchestrateResult} />}")

col8_idx = find_line_index(lines, "<div className='space-y-6 lg:col-span-8'>")
insert_idx = col8_idx + 1

new_content = []
new_content.extend(block_nexus)

collapsible_start = """            {/* The Engine Room (The Dropdown) */}
            <details className='group rounded-2xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur [&_summary::-webkit-details-marker]:hidden'>
              <summary className='flex cursor-pointer items-center justify-between p-5 font-semibold text-slate-900 outline-none'>
                Advanced Operator Controls
                <span className='transition-transform group-open:rotate-180'>▼</span>
              </summary>
              <div className='space-y-6 border-t border-slate-200 p-5'>\n"""
new_content.append(collapsible_start)
new_content.extend(block_full)
new_content.extend(block_policy)
new_content.extend(block_operator)
new_content.extend(block_lead)
collapsible_end = """              </div>
            </details>\n"""
new_content.append(collapsible_end)

for line in reversed(new_content):
    lines.insert(insert_idx, line)

for i, line in enumerate(lines):
    if "className='space-y-6 lg:col-span-5'" in line:
        lines[i] = line.replace("lg:col-span-5", "lg:col-span-4")
    elif "title='Live audit trail'" in line:
        lines[i] = line.replace("Live audit trail", "Action Inbox")
    elif "title='Current policy state'" in line:
        lines[i] = line.replace("Current policy state", "Active Guardrails")

with open("frontend/src/app/page.tsx", "w") as f:
    f.writelines(lines)

print("Refactoring complete.")
