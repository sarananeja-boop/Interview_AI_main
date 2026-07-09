import re

def tailwind_to_css(tw_class):
    mapping = {
        'relative': 'position: relative;',
        'absolute': 'position: absolute;',
        'inset-0': 'top: 0; right: 0; bottom: 0; left: 0;',
        'inset-4': 'top: 1rem; right: 1rem; bottom: 1rem; left: 1rem;',
        'top-0': 'top: 0;',
        'left-0': 'left: 0;',
        'bottom-8': 'bottom: 2rem;',
        'bottom-12': 'bottom: 3rem;',
        '-bottom-5': 'bottom: -1.25rem;',
        'right-8': 'right: 2rem;',
        'z-0': 'z-index: 0;',
        'z-10': 'z-index: 10;',
        'z-50': 'z-index: 50;',
        'z-100': 'z-index: 100;',
        'flex': 'display: flex;',
        'hidden': 'display: none;',
        'flex-col': 'flex-direction: column;',
        'flex-row': 'flex-direction: row;',
        'flex-wrap': 'flex-wrap: wrap;',
        'flex-1': 'flex: 1 1 0%;',
        'items-center': 'align-items: center;',
        'items-start': 'align-items: flex-start;',
        'justify-center': 'justify-content: center;',
        'justify-between': 'justify-content: space-between;',
        'justify-end': 'justify-content: flex-end;',
        'self-end': 'align-self: flex-end;',
        'w-full': 'width: 100%;',
        'h-full': 'height: 100%;',
        'w-3': 'width: 0.75rem;',
        'h-3': 'height: 0.75rem;',
        'w-4': 'width: 1rem;',
        'h-4': 'height: 1rem;',
        'w-1.5': 'width: 0.375rem;',
        'h-1.5': 'height: 0.375rem;',
        'w-8': 'width: 2rem;',
        'h-8': 'height: 2rem;',
        'w-12': 'width: 3rem;',
        'h-12': 'height: 3rem;',
        'w-16': 'width: 4rem;',
        'h-16': 'height: 4rem;',
        'w-40': 'width: 10rem;',
        'w-48': 'width: 12rem;',
        'h-48': 'height: 12rem;',
        'w-64': 'width: 16rem;',
        'h-64': 'height: 16rem;',
        'w-72': 'width: 18rem;',
        'w-[150px]': 'width: 150px;',
        'w-[380px]': 'width: 380px;',
        'max-w-[1200px]': 'max-width: 1200px;',
        'min-h-screen': 'min-height: 100vh;',
        'h-screen': 'height: 100vh;',
        'max-h-screen': 'max-height: 100vh;',
        'p-1': 'padding: 0.25rem;',
        'p-3': 'padding: 0.75rem;',
        'p-5': 'padding: 1.25rem;',
        'p-6': 'padding: 1.5rem;',
        'px-3': 'padding-left: 0.75rem; padding-right: 0.75rem;',
        'px-4': 'padding-left: 1rem; padding-right: 1rem;',
        'px-6': 'padding-left: 1.5rem; padding-right: 1.5rem;',
        'px-8': 'padding-left: 2rem; padding-right: 2rem;',
        'py-1.5': 'padding-top: 0.375rem; padding-bottom: 0.375rem;',
        'py-2': 'padding-top: 0.5rem; padding-bottom: 0.5rem;',
        'py-3': 'padding-top: 0.75rem; padding-bottom: 0.75rem;',
        'py-4': 'padding-top: 1rem; padding-bottom: 1rem;',
        'py-8': 'padding-top: 2rem; padding-bottom: 2rem;',
        'px-[20px]': 'padding-left: 20px; padding-right: 20px;',
        'pt-24': 'padding-top: 6rem;',
        'pb-3': 'padding-bottom: 0.75rem;',
        'pb-4': 'padding-bottom: 1rem;',
        'pb-8': 'padding-bottom: 2rem;',
        'pl-11': 'padding-left: 2.75rem;',
        'pr-6': 'padding-right: 1.5rem;',
        'm-0': 'margin: 0;',
        'mx-auto': 'margin-left: auto; margin-right: auto;',
        'mt-4': 'margin-top: 1rem;',
        'mb-2': 'margin-bottom: 0.5rem;',
        'mb-4': 'margin-bottom: 1rem;',
        'mb-8': 'margin-bottom: 2rem;',
        'mb-12': 'margin-bottom: 3rem;',
        'ml-1': 'margin-left: 0.25rem;',
        'ml-2': 'margin-left: 0.5rem;',
        'ml-4': 'margin-left: 1rem;',
        'ml-auto': 'margin-left: auto;',
        'mr-auto': 'margin-right: auto;',
        'mt-[-64px]': 'margin-top: -64px;',
        'gap-1': 'gap: 0.25rem;',
        'gap-2': 'gap: 0.5rem;',
        'gap-3': 'gap: 0.75rem;',
        'gap-4': 'gap: 1rem;',
        'gap-5': 'gap: 1.25rem;',
        'gap-6': 'gap: 1.5rem;',
        'gap-8': 'gap: 2rem;',
        'gap-[24px]': 'gap: 24px;',
        'text-center': 'text-align: center;',
        'uppercase': 'text-transform: uppercase;',
        'italic': 'font-style: italic;',
        'font-mono': 'font-family: var(--font-mono, monospace);',
        'font-label-caps': 'font-family: var(--font-sans); letter-spacing: 0.1em;',
        'font-label-md': 'font-family: var(--font-sans);',
        'font-body-md': 'font-family: var(--font-sans);',
        'font-body-lg': 'font-family: var(--font-sans);',
        'font-headline-lg': 'font-family: var(--font-display);',
        'font-semibold': 'font-weight: 600;',
        'font-medium': 'font-weight: 500;',
        'text-xs': 'font-size: 0.75rem; line-height: 1rem;',
        'text-lg': 'font-size: 1.125rem; line-height: 1.75rem;',
        'text-xl': 'font-size: 1.25rem; line-height: 1.75rem;',
        'text-3xl': 'font-size: 1.875rem; line-height: 2.25rem;',
        'text-7xl': 'font-size: 4.5rem; line-height: 1;',
        'text-[10px]': 'font-size: 10px;',
        'text-[12px]': 'font-size: 12px;',
        'text-[13px]': 'font-size: 13px;',
        'text-[14px]': 'font-size: 14px;',
        'text-[16px]': 'font-size: 16px;',
        'text-[18px]': 'font-size: 18px;',
        'text-[32px]': 'font-size: 32px;',
        'leading-relaxed': 'line-height: 1.625;',
        'tracking-widest': 'letter-spacing: 0.1em;',
        'bg-background': 'background-color: var(--background);',
        'text-on-surface': 'color: var(--on-surface);',
        'text-on-surface-variant': 'color: var(--on-surface-variant);',
        'bg-primary': 'background-color: var(--primary);',
        'text-primary': 'color: var(--primary);',
        'bg-primary-container': 'background-color: var(--primary-container);',
        'text-on-primary-container': 'color: var(--on-primary-container);',
        'bg-secondary': 'background-color: var(--secondary);',
        'text-secondary': 'color: var(--secondary);',
        'bg-surface': 'background-color: var(--surface);',
        'bg-surface-variant': 'background-color: var(--surface-variant);',
        'text-outline': 'color: var(--outline);',
        'text-outline-variant': 'color: var(--outline-variant);',
        'bg-outline': 'background-color: var(--outline);',
        'text-error': 'color: var(--error);',
        'bg-error-container': 'background-color: var(--error-container);',
        'text-on-error-container': 'color: var(--on-error-container);',
        'bg-white/20': 'background-color: rgba(255, 255, 255, 0.2);',
        'bg-error/10': 'background-color: rgba(179, 38, 30, 0.1);',
        'bg-primary/10': 'background-color: rgba(21, 69, 57, 0.1);',
        'bg-secondary-container/50': 'background-color: rgba(210, 232, 218, 0.5);',
        'bg-primary-fixed-dim': 'background-color: var(--primary-fixed-dim);',
        'border-secondary/20': 'border-color: rgba(79, 99, 88, 0.2);',
        'text-on-secondary-container': 'color: var(--on-secondary-container);',
        'rounded-md': 'border-radius: 0.375rem;',
        'rounded-lg': 'border-radius: 0.5rem;',
        'rounded-xl': 'border-radius: 0.75rem;',
        'rounded-2xl': 'border-radius: 1rem;',
        'rounded-full': 'border-radius: 9999px;',
        'rounded-tr-none': 'border-top-right-radius: 0;',
        'border': 'border-width: 1px;',
        'border-2': 'border-width: 2px;',
        'border-b': 'border-bottom-width: 1px;',
        'border-outline-variant': 'border-color: var(--outline-variant);',
        'border-outline-variant/30': 'border-color: rgba(188, 237, 220, 0.3);',
        'border-outline-variant/50': 'border-color: rgba(188, 237, 220, 0.5);',
        'border-white': 'border-color: #ffffff;',
        'border-white/20': 'border-color: rgba(255, 255, 255, 0.2);',
        'border-error/30': 'border-color: rgba(179, 38, 30, 0.3);',
        'border-primary/30': 'border-color: rgba(21, 69, 57, 0.3);',
        'border-primary': 'border-color: var(--primary);',
        'opacity-0': 'opacity: 0;',
        'opacity-30': 'opacity: 0.3;',
        'opacity-40': 'opacity: 0.4;',
        'opacity-50': 'opacity: 0.5;',
        'opacity-70': 'opacity: 0.7;',
        'opacity-75': 'opacity: 0.75;',
        'opacity-80': 'opacity: 0.8;',
        'opacity-100': 'opacity: 1;',
        'mix-blend-multiply': 'mix-blend-mode: multiply;',
        'mix-blend-overlay': 'mix-blend-mode: overlay;',
        'shadow-sm': 'box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);',
        'shadow-lg': 'box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);',
        'shadow-inner': 'box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);',
        'blur-3xl': 'filter: blur(64px);',
        'transition-colors': 'transition-property: background-color, border-color, color, fill, stroke; transition-duration: 150ms;',
        'transition-opacity': 'transition-property: opacity; transition-duration: 150ms;',
        'transition-all': 'transition-property: all; transition-duration: 150ms;',
        'duration-300': 'transition-duration: 300ms;',
        'duration-1000': 'transition-duration: 1000ms;',
        'ease-in-out': 'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);',
        'overflow-hidden': 'overflow: hidden;',
        'overflow-y-auto': 'overflow-y: auto;',
        'resize-none': 'resize: none;',
        'pointer-events-none': 'pointer-events: none;',
        'object-cover': 'object-fit: cover;',
        'inline-block': 'display: inline-block;',
        'inline-flex': 'display: inline-flex;',
        'align-middle': 'vertical-align: middle;',
        'hover:bg-primary-container': '/* handled via .hover\\:bg-primary-container:hover */ background-color: var(--primary-container);',
        'hover:bg-error/20': '/* hover */ background-color: rgba(179, 38, 30, 0.2);',
        'hover:bg-surface-container-high': '/* hover */ background-color: var(--surface-container-high);',
        'hover:text-primary': '/* hover */ color: var(--primary);',
        'hover:text-on-error': '/* hover */ color: var(--on-error);',
        'hover:bg-error': '/* hover */ background-color: var(--error);',
        'focus:outline-none': '/* focus */ outline: 2px solid transparent; outline-offset: 2px;',
        'focus:border-primary': '/* focus */ border-color: var(--primary);',
        'disabled:opacity-50': '/* disabled */ opacity: 0.5;',
        'animate-pulse': 'animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;',
        'animate-ping': 'animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;',
        'animate-bounce': 'animation: bounce 1s infinite;',
    }
    return mapping.get(tw_class, None)

def extract_classes(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    class_names = set()
    for match in re.finditer(r'className=(?:\"([^\"]+)\"|\{`([^`]+)`\})', content):
        classes1 = match.group(1) or ""
        classes2 = match.group(2) or ""
        for c in (classes1 + " " + classes2).split():
            c = c.strip()
            if c and not c.startswith('$'):
                class_names.add(c)
    return class_names

def generate_css(classes):
    css_lines = []
    for c in sorted(list(classes)):
        base_class = c
        pseudo = ""
        media = ""
        if c.startswith('md:'):
            media = "@media (min-width: 768px) { "
            base_class = c[3:]
        if base_class.startswith('hover:'):
            pseudo = ":hover"
            base_class = base_class[6:]
        elif base_class.startswith('focus:'):
            pseudo = ":focus"
            base_class = base_class[6:]
        elif base_class.startswith('disabled:'):
            pseudo = ":disabled"
            base_class = base_class[9:]
        elif base_class.startswith('group-hover:'):
            pseudo = " group-hover"
            base_class = base_class[12:]
            
        css_rules = tailwind_to_css(base_class)
        
        if css_rules:
            escaped_c = c.replace(':', '\\\\:').replace('[', '\\\\[').replace(']', '\\\\]').replace('/', '\\\\/')
            if "group-hover" in pseudo:
                rule = f".group:hover .{escaped_c} {{ {css_rules} }}"
            else:
                rule = f".{escaped_c}{pseudo} {{ {css_rules} }}"
            
            if media:
                rule = media + rule + " }"
            css_lines.append(rule)
            
    # Add keyframes
    css_lines.append("@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }")
    css_lines.append("@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }")
    css_lines.append("@keyframes bounce { 0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8,0,1,1); } 50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1); } }")
    return "\\n".join(css_lines)

filepath = "/Users/SMILE/Documents/AG_Interview/frontend/src/app/interview/live/page.tsx"
classes = extract_classes(filepath)
css = generate_css(classes)

globals_path = "/Users/SMILE/Documents/AG_Interview/frontend/src/app/globals.css"
with open(globals_path, 'a') as f:
    f.write("\\n/* Injected Tailwind CSS for Live Page */\\n" + css + "\\n")

print("Appended Tailwind CSS to globals.css!")
