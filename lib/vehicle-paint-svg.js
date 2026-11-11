import {DOMParser} from 'linkedom';
import {sceneModelSvg} from './progress-scene-svg.js';

// Keep the email's body paint consistent with the website/planner illustration.
export const vehiclePaintColours = {BLACK:'#191b20',WHITE:'#f5f5f2',SILVER:'#bfc3c8',GREY:'#626970',GRAY:'#626970',BLUE:'#1c4778',RED:'#ac1727',GREEN:'#204c36',YELLOW:'#e5ba20',ORANGE:'#d56b22',BROWN:'#77513b',BEIGE:'#c1ac88',GOLD:'#b59a50',BRONZE:'#98704c',PURPLE:'#654282',PINK:'#cb7a9b',MAROON:'#641f32',CREAM:'#e9dfc6',TURQUOISE:'#368d96'};

export function paintedVehicleSvg(source, colour) {
  const safe = sceneModelSvg(source);
  const hex = vehiclePaintColours[String(colour || '').trim().toUpperCase()];
  if (!hex) return safe;
  const svg = new DOMParser().parseFromString(safe, 'image/svg+xml').documentElement;
  const paint = svg.querySelector('[id="transparant_colour"], [id="transparent_colour"]');
  if (!paint) return safe;
  paint.setAttribute('fill', hex);
  for (const path of paint.querySelectorAll('path, polygon, rect, ellipse')) {
    if (path.getAttribute('fill') !== 'none') path.setAttribute('fill', hex);
  }
  return svg.outerHTML;
}
