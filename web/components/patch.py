import io

with open("ui_utils.js", 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    '.clab-workspace-tab.active {\n            background: rgba(255, 255, 255, 0.08);',
    '.clab-workspace-tab.active {\n            background: rgba(255, 255, 255, 0.08);\n        }\n        .clab-workspace-tab.selected {\n            background: rgba(255, 255, 255, 0.15);\n        }\n        .clab-workspace-tab.active.selected {\n            background: rgba(255, 255, 255, 0.22);\n        }\n        .clab-workspace-tab.active {'
)

text = text.replace(
    '.clab-drag-over-card { border-left: 3px solid var(--clab-theme-card, #4CAF50) !important; }',
    '.clab-drag-over-card { border-left: 3px solid var(--clab-theme-card, #4CAF50) !important; }\n        .clab-drag-over-tab-left { border-left: 2px solid var(--clab-theme-card, #4CAF50) !important; background: var(--clab-theme-card-hover, rgba(76, 175, 80, 0.1)) !important;}\n        .clab-drag-over-tab-right { border-right: 2px solid var(--clab-theme-card, #4CAF50) !important; background: var(--clab-theme-card-hover, rgba(76, 175, 80, 0.1)) !important;}'
)

with open("ui_utils.js", 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched settings")
