import re

with open('frontend/src/app/page.tsx', 'r') as f:
    text = f.read()

# We only care about lines between `return (` and the end
start = text.rfind('return (')
jsx_text = text[start:]

# Extract all simple tags
tags = re.findall(r'</?([a-zA-Z0-9]+)[^>]*>', jsx_text)

stack = []
for tag in tags:
    if tag.startswith('/'):
        tag_name = tag[1:]
        if not stack:
            print(f"Error: unmatched closing tag {tag_name}")
            break
        if stack[-1] == tag_name:
            stack.pop()
        else:
            print(f"Error: closing tag {tag_name} does not match opening tag {stack[-1]}")
            break
    else:
        # ignore self closing tags
        # but regex caught them as open tags. Let's filter out tags that end with />
        # we need to re-parse properly.
        pass

