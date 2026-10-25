"""Converte dist/index.html em página de Artifact (sem doctype/head/body, CSS embutido)."""
import re, sys, os
dist, out = sys.argv[1], sys.argv[2]
html = open(os.path.join(dist, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(dist, 'assets', 'index.css'), encoding='utf-8').read()
title = re.search(r'<title>(.*?)</title>', html).group(1)
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts.googleapis.com[^"]+)"', html).group(1)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script type="module" src="./src/main.ts"></script>', '', body)
page = f'''<meta charset="utf-8">
<title>{title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#07080d">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
{body.strip()}
<script type="module" src="assets/game.js"></script>
'''
open(out, 'w', encoding='utf-8').write(page)
print(len(page), 'bytes')
