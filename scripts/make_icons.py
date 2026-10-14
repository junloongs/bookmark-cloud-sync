"""生成书签云同步扩展的图标：简约书签 + 同步箭头
  风格：圆角矩形 + 渐变背景 + 白色书签主体 + 双向同步箭头
"""
from PIL import Image, ImageDraw
import math

# 调色板
BG_TOP = (99, 102, 241)       # 靛蓝（Indigo-500）
BG_BOT = (139, 92, 246)       # 紫罗兰（Violet-500）
BOOKMARK_FILL = (255, 255, 255)
BOOKMARK_SHADOW = (255, 255, 255, 80)
ACCENT = (251, 191, 36)       # 琥珀（Amber-500，箭头色）

def gradient_bg(size):
    """生成圆角渐变背景"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = y / max(1, size - 1)
            r = int(BG_TOP[0] * (1 - t) + BG_BOT[0] * t)
            g = int(BG_TOP[1] * (1 - t) + BG_BOT[1] * t)
            b = int(BG_TOP[2] * (1 - t) + BG_BOT[2] * t)
            px[x, y] = (r, g, b, 255)
    # 圆角遮罩
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    r = max(2, int(size * 0.22))
    md.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=r, fill=255)
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg.paste(img, (0, 0), mask)
    return bg

def draw_bookmark(canvas, size, scale=1.0):
    """画一个简洁的书签形状，居中。书签 = 顶部矩形 + 底部倒V切角"""
    s = size
    # 书签外框：宽度 50%、高度 70%、居中
    bw = int(s * 0.50 * scale)
    bh = int(s * 0.70 * scale)
    bx = (s - bw) // 2
    by = (s - bh) // 2 - int(s * 0.03)  # 略向上
    # 底部倒 V 深度
    notch = int(bw * 0.30)
    # 阴影层（轻微偏移）
    shadow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.polygon([
        (bx + 2, by + 2),
        (bx + bw + 2, by + 2),
        (bx + bw + 2, by + bh - notch + 2),
        (bx + bw // 2 + 2, by + bh - notch // 2 + 2),
        (bx + 2, by + bh - notch + 2),
    ], fill=(0, 0, 0, 40))
    canvas.alpha_composite(shadow)
    # 书签本体（白色填充）
    bm_img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bm_img)
    bd.polygon([
        (bx, by),
        (bx + bw, by),
        (bx + bw, by + bh - notch),
        (bx + bw // 2, by + bh - notch // 2),
        (bx, by + bh - notch),
    ], fill=BOOKMARK_FILL)
    canvas.alpha_composite(bm_img)

def draw_sync_arrows(canvas, size):
    """在书签内部画一对上下双向同步箭头（琥珀色）"""
    s = size
    cx, cy = s // 2, s // 2 + int(s * 0.03)
    # 箭头大小（按尺寸自适应）
    r = int(s * 0.13)        # 箭头臂长
    sw = max(2, int(s * 0.07))  # 线宽
    color = ACCENT
    overlay = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # 上箭头：右半圆 + 顶端尖
    # 右臂：从圆心向右箭头沿上臂
    od.line([(cx, cy - r), (cx + r, cy)], fill=color, width=sw)
    # 左臂：左下 → 右下方向（让箭头成回环）
    od.line([(cx + r, cy), (cx, cy + r)], fill=color, width=sw)
    od.line([(cx, cy + r), (cx - r, cy)], fill=color, width=sw)
    od.line([(cx - r, cy), (cx, cy - r)], fill=color, width=sw)
    # 箭头尖端（箭头 1：右上）
    head1 = int(s * 0.08)
    od.polygon([(cx + r + head1 // 2, cy - head1 // 2),
                (cx + r - head1 // 2, cy - head1 // 2 - head1 // 2),
                (cx + r - head1 // 2, cy + head1 // 2)],
               fill=color)
    # 箭头尖端（箭头 2：左下）
    od.polygon([(cx - r - head1 // 2, cy + head1 // 2),
                (cx - r + head1 // 2, cy + head1 // 2 + head1 // 2),
                (cx - r + head1 // 2, cy - head1 // 2)],
               fill=color)
    canvas.alpha_composite(overlay)

def make_icon(size, path):
    bg = gradient_bg(size)
    draw_bookmark(bg, size, scale=0.95)
    draw_sync_arrows(bg, size)
    bg.save(path, 'PNG', optimize=True)
    print(f'  {path} ({size}x{size})')

print('生成图标：')
make_icon(16,  'bookmark-sync-extension/icons/icon16.png')
make_icon(48,  'bookmark-sync-extension/icons/icon48.png')
make_icon(128, 'bookmark-sync-extension/icons/icon128.png')
print('完成。')