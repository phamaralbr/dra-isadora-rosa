import { isUnpicCompatible, unpicOptimizer, astroAssetsOptimizer } from './images-optimization';
import type { ImageMetadata } from 'astro';
import type { OpenGraph, OpenGraphMedia } from '@astrolib/seo';

const load = async function () {
  let images: Record<string, () => Promise<unknown>> | undefined = undefined;
  try {
    images = import.meta.glob('~/assets/images/**/*.{jpeg,jpg,png,tiff,webp,gif,svg,JPEG,JPG,PNG,TIFF,WEBP,GIF,SVG}');
  } catch {
    // continue regardless of error
  }
  return images;
};

let _images: Record<string, () => Promise<unknown>> | undefined = undefined;

/** */
export const fetchLocalImages = async () => {
  _images = _images || (await load());
  return _images;
};

/** */
export const findImage = async (
  imagePath?: string | ImageMetadata | null
): Promise<string | ImageMetadata | undefined | null> => {
  if (typeof imagePath !== 'string') return imagePath;

  // Absolute paths or remote URLs
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
    return imagePath;
  }

  // Relative paths not in ~/assets/images
  if (!imagePath.startsWith('~/assets/images')) {
    return imagePath;
  }

  const images = await fetchLocalImages();
  const key = imagePath.replace('~/', '/src/');

  return images && typeof images[key] === 'function'
    ? ((await images[key]()) as { default: ImageMetadata }).default
    : null;
};

/** */
export const adaptOpenGraphImages = async (
  openGraph: OpenGraph = {},
  astroSite: URL | undefined = new URL('')
): Promise<OpenGraph> => {
  if (!openGraph?.images?.length) return openGraph;

  const defaultWidth = 1200;
  const defaultHeight = 630;

  const adaptedImages: OpenGraphMedia[] = await Promise.all(
    openGraph.images.map(async (image): Promise<OpenGraphMedia> => {
      if (!image?.url) return { url: '' };

      const resolvedImage = await findImage(image.url);
      if (!resolvedImage) return { url: '' };

      let optimized: { src: string; width?: number; height?: number } | undefined;

      // Remote URL + Unpic
      if (typeof resolvedImage === 'string' && isUnpicCompatible(resolvedImage)) {
        optimized = (await unpicOptimizer(resolvedImage, [defaultWidth], defaultWidth, defaultHeight, 'jpg'))[0];
      }

      // Imported local image
      else if (typeof resolvedImage !== 'string') {
        const width = resolvedImage.width <= defaultWidth ? resolvedImage.width : defaultWidth;
        const height = resolvedImage.width <= defaultWidth ? resolvedImage.height : defaultHeight;

        optimized = (await astroAssetsOptimizer(resolvedImage, [width], width, height, 'jpg'))[0];
      }

      // Fallback for string URLs (public paths etc)
      else {
        return {
          url: resolvedImage.startsWith('http') ? resolvedImage : String(new URL(resolvedImage, astroSite)),
          width: image.width,
          height: image.height,
          alt: image.alt,
        };
      }

      if (optimized?.src) {
        return {
          url: String(new URL(optimized.src, astroSite)),
          width: optimized.width,
          height: optimized.height,
          alt: image.alt,
        };
      }

      return { url: '' };
    })
  );

  return { ...openGraph, images: adaptedImages };
};
