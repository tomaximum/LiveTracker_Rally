import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
        
    depth = 0
    line_num = 1
    stack = []
    
    for i, char in enumerate(content):
        if char == '\n':
            line_num += 1
        elif char == '{':
            depth += 1
            stack.append(line_num)
        elif char == '}':
            depth -= 1
            if depth < 0:
                print(f"Error: Extra '}}' at line {line_num}")
                depth = 0 # reset
            else:
                stack.pop()
                
    if depth > 0:
        print(f"Error: {depth} unclosed '{{' left at end of file")
        print("Unclosed blocks started at lines:")
        for l in stack:
            print(f"  Line {l}")
    else:
        print("Braces are balanced")

if __name__ == '__main__':
    check_braces(sys.argv[1])
