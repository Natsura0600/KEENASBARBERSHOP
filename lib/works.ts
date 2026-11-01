export type Work = { id: string; src: string; poster: string };

/**
 * Trabajos destacados. Cada uno es un par de archivos en /public/trabajos:
 *   trabajo-NN.mp4  (video vertical, sin audio)
 *   trabajo-NN.jpg  (imagen de portada)
 *
 * Para AGREGAR uno: subí los dos archivos y sumá su número a la lista.
 * Para REORDENAR o SACAR uno: cambiá la lista (se muestran en este orden).
 */
const ORDER = [6, 8, 2, 4, 10, 5, 1, 3, 9, 11, 7];

export const WORKS: Work[] = ORDER.map((n) => {
  const id = String(n).padStart(2, "0");
  return {
    id,
    src: `/trabajos/trabajo-${id}.mp4`,
    poster: `/trabajos/trabajo-${id}.jpg`,
  };
});
