with open("frontend/src/app/page.tsx", "r") as f:
    text = f.read()

count = 0
for i, char in enumerate(text):
    if char == '{':
        count += 1
    elif char == '}':
        count -= 1
    if count < 0:
        print(f"Extra closing brace at {i}")
        break

print(f"Final brace count: {count}")
