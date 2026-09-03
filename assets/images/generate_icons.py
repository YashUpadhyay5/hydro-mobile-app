import os
from PIL import Image, ImageDraw, ImageFilter

def create_glossy_bg(size, color1, color2):
    bg = Image.new('RGBA', size)
    draw = ImageDraw.Draw(bg)
    # create a diagonal gradient
    for y in range(size[1]):
        for x in range(size[0]):
            ratio = (x + y) / (size[0] + size[1])
            r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
            g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
            b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
            draw.point((x, y), fill=(r, g, b, 255))
    
    # Add glossy overlay (a soft white curve at the top)
    gloss = Image.new('RGBA', size, (255,255,255,0))
    g_draw = ImageDraw.Draw(gloss)
    g_draw.ellipse((-size[0]*0.5, -size[1]*0.5, size[0]*1.5, size[1]*0.5), fill=(255,255,255,40))
    bg = Image.alpha_composite(bg, gloss)
    return bg

try:
    # Load original logo (icon.png seems to be the user's logo based on previous checks)
    original = Image.open('icon.png').convert('RGBA')
    
    # --- 1. Universal Icon (1024x1024) ---
    icon_bg = create_glossy_bg((1024, 1024), (230, 244, 254), (200, 230, 250)) # Light blue glossy
    
    # Resize original to fit safely inside 1024x1024 (let's say max 650x650)
    orig_w, orig_h = original.size
    ratio = min(650/orig_w, 650/orig_h)
    new_size = (int(orig_w * ratio), int(orig_h * ratio))
    resized_logo = original.resize(new_size, Image.Resampling.LANCZOS)
    
    # Paste logo onto center
    pos = ((1024 - new_size[0]) // 2, (1024 - new_size[1]) // 2)
    
    # Optional drop shadow for the main icon
    shadow = Image.new('RGBA', (1024, 1024), (0,0,0,0))
    shadow.paste(resized_logo, ((1024 - new_size[0]) // 2, (1024 - new_size[1]) // 2 + 15), resized_logo)
    r,g,b,a = shadow.split()
    shadow_black = Image.new('RGBA', shadow.size, (0,0,0,255))
    shadow_black.putalpha(a)
    shadow_black = shadow_black.filter(ImageFilter.GaussianBlur(15))
    r,g,b,a = shadow_black.split()
    a = a.point(lambda i: int(i * 0.4))
    shadow_black.putalpha(a)
    
    icon_bg = Image.alpha_composite(icon_bg, shadow_black)
    icon_bg.paste(resized_logo, pos, resized_logo)
    icon_bg.save('icon_new.png')

    # --- 2. Adaptive Foreground (1080x1080) ---
    # Must be transparent background with the logo in the center safe zone (max ~450x450)
    fg = Image.new('RGBA', (1080, 1080), (0,0,0,0))
    fg_ratio = min(450/orig_w, 450/orig_h)
    fg_size = (int(orig_w * fg_ratio), int(orig_h * fg_ratio))
    fg_logo = original.resize(fg_size, Image.Resampling.LANCZOS)
    
    # Add a drop shadow to the foreground logo for that premium look
    shadow_fg = Image.new('RGBA', (1080, 1080), (0,0,0,0))
    shadow_fg.paste(fg_logo, ((1080 - fg_size[0]) // 2, (1080 - fg_size[1]) // 2 + 10), fg_logo)
    # Extract alpha from shadow, make it black, blur it
    r,g,b,a = shadow_fg.split()
    shadow_black_fg = Image.new('RGBA', shadow_fg.size, (0,0,0,255))
    shadow_black_fg.putalpha(a)
    shadow_black_fg = shadow_black_fg.filter(ImageFilter.GaussianBlur(10))
    
    # reduce shadow opacity
    r,g,b,a = shadow_black_fg.split()
    a = a.point(lambda i: int(i * 0.4))
    shadow_black_fg.putalpha(a)
    
    fg = Image.alpha_composite(fg, shadow_black_fg)
    fg.paste(fg_logo, ((1080 - fg_size[0]) // 2, (1080 - fg_size[1]) // 2), fg_logo)
    fg.save('android-icon-foreground_new.png')

    # --- 3. Adaptive Background (1080x1080) ---
    # Glossy background for the adaptive icon
    bg = create_glossy_bg((1080, 1080), (230, 244, 254), (180, 220, 248))
    bg.save('android-icon-background_new.png')
    
    # --- 4. Monochrome Icon (1080x1080) ---
    mono = Image.new('RGBA', (1080, 1080), (0,0,0,0))
    mono_alpha = fg_logo.split()[3]
    mono_final = Image.new('RGBA', fg_size, (255,255,255,255))
    mono_final.putalpha(mono_alpha)
    mono.paste(mono_final, ((1080 - fg_size[0]) // 2, (1080 - fg_size[1]) // 2), mono_final)
    mono.save('android-icon-monochrome_new.png')

    # --- 5. Splash Icon (1024x1024) ---
    splash = Image.new('RGBA', (1024, 1024), (0,0,0,0))
    sp_ratio = min(600/orig_w, 600/orig_h)
    sp_size = (int(orig_w * sp_ratio), int(orig_h * sp_ratio))
    sp_logo = original.resize(sp_size, Image.Resampling.LANCZOS)
    splash.paste(sp_logo, ((1024 - sp_size[0]) // 2, (1024 - sp_size[1]) // 2), sp_logo)
    splash.save('splash-icon_new.png')

    print("SUCCESS")
except Exception as e:
    print("ERROR:", e)
