import { ICONS, type IconName } from '../components/ui/iconData';

/** The app's SVG icons as standalone SVG strings, for places that take raw SVG (home screen widgets). */
export function iconSvg(name: string, color: string, strokeWidth = 2): string {
  const nodes = ICONS[name as IconName] ?? ICONS.kanban;
  const body = nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
