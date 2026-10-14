# -*- coding: utf-8 -*-
"""把 bookmark-sync-extension 目录打包为 Chrome Web Store / Edge Add-ons 提交格式的 ZIP。

Chrome Web Store / Edge Add-ons 要求：
  - manifest.json 位于 ZIP 根目录（不要嵌一层外层文件夹）
  - 文件名使用 ASCII，路径分隔符用 '/'
  - 不应包含 .git / .DS_Store / .map / node_modules 等

注意：这里只打包扩展运行所需的文件（manifest.json + 源码 + icons/）。
开发相关文件（README、LICENSE、CHANGELOG、CONTRIBUTING、docs/、store-listing/、
scripts/、.github/、tests/）只放在 GitHub 仓库里供开发者阅读，不进商店 ZIP。
"""
import os
import zipfile

ROOT = r"C:\Users\sjl88\Desktop\bookmark\bookmark-sync-extension"
OUT = r"C:\Users\sjl88\Desktop\bookmark\bookmark-sync-extension-v1.0.0.zip"

# 商店 ZIP 中允许出现的文件（相对路径）
INCLUDE_FILES = {
    "manifest.json",
    "background.js",
    "lib.js",
    "shim.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "options.html",
    "options.js",
    "options.css",
}

# 商店 ZIP 中允许出现的目录（递归包含）
INCLUDE_DIRS = {
    "icons",
}

# 通用排除
EXCLUDE_FILES = {".DS_Store", "Thumbs.db", ".gitkeep", "*.map", "*.tsbuildinfo"}
EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".vscode", ".idea", ".github"}


def should_skip_file(name: str) -> bool:
    base = os.path.basename(name)
    for pat in EXCLUDE_FILES:
        if pat.startswith("*") and base.endswith(pat[1:]):
            return True
        if base == pat:
            return True
    return False


count = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    # 顶层白名单文件
    for entry in sorted(os.listdir(ROOT)):
        full = os.path.join(ROOT, entry)
        if os.path.isfile(full) and entry in INCLUDE_FILES:
            arcname = entry  # ZIP 根目录
            z.write(full, arcname)
            count += 1
            print(f"  + {arcname}")
        elif os.path.isdir(full) and entry in INCLUDE_DIRS:
            for dirpath, dirnames, filenames in os.walk(full):
                # 过滤掉杂项目录
                dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
                for fn in filenames:
                    if should_skip_file(fn):
                        continue
                    fp = os.path.join(dirpath, fn)
                    rel = os.path.relpath(fp, ROOT).replace(os.sep, "/")
                    z.write(fp, rel)
                    count += 1
                    print(f"  + {rel}")

print(f"\nWrote: {OUT}")
print(f"Files packed: {count}")
print(f"Uncompressed size: {sum(z.getinfo(n).file_size for n in z.namelist()):,} bytes")
print(f"Compressed size:   {os.path.getsize(OUT):,} bytes")