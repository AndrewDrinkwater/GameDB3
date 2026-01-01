with open('frontend/src/components/ListView.tsx', 'r', encoding='utf-8') as f:
    for _ in range(5):
        line = f.readline()
        print(repr(line))
